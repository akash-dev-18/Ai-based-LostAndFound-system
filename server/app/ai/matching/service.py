from __future__ import annotations

import uuid
from dataclasses import dataclass
from math import ceil

from sqlalchemy import Text, func, literal_column, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import IMAGE_MODEL_NAME, TEXT_MODEL_NAME
from app.ai.matching.model import ItemMatch, MatchStatus
from app.ai.matching.schema import ItemMatchRead, MatchListQuery
from app.ai.model import EmbeddingModality, ItemEmbedding
from app.audit import service as audit_service
from app.common.schema import Page
from app.config import settings
from app.item.model import Item, ItemStatus, ItemType
from app.notification import service as notification_service
from app.notification.model import Notification, NotificationType
from app.user.model import User, UserRole


class MatchError(Exception):
    status_code = 400

    def __init__(self, message: str = "Match operation failed") -> None:
        super().__init__(message)


class MatchNotFoundError(MatchError):
    status_code = 404


class MatchPermissionError(MatchError):
    status_code = 403


class MatchStateError(MatchError):
    status_code = 409


@dataclass
class _CandidateScore:
    text_score: float | None
    image_score: float | None
    attribute_score: float | None
    final_score: float


@dataclass
class _EmbeddingSet:
    text: list[float] | None
    images: list[list[float]]


def _is_staff(user: User) -> bool:
    return user.role in {UserRole.MANAGER, UserRole.ADMIN}


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _cosine(first: list[float], second: list[float]) -> float:
    dot = sum(a * b for a, b in zip(first, second, strict=False))
    first_norm = sum(value * value for value in first) ** 0.5
    second_norm = sum(value * value for value in second) ** 0.5
    if first_norm == 0 or second_norm == 0:
        return 0.0
    return _clamp(dot / (first_norm * second_norm))


def _token_similarity(first: str | None, second: str | None) -> float | None:
    if not first or not second:
        return None
    first_tokens = {token for token in first.casefold().split() if token}
    second_tokens = {token for token in second.casefold().split() if token}
    if not first_tokens or not second_tokens:
        return None
    if first_tokens == second_tokens:
        return 1.0
    return len(first_tokens & second_tokens) / len(first_tokens | second_tokens)


def _attribute_score(first: Item, second: Item) -> float | None:
    values: list[tuple[float, float | None]] = [
        (0.35, _token_similarity(first.category, second.category)),
        (0.20, _token_similarity(first.brand, second.brand)),
        (0.20, _token_similarity(first.color, second.color)),
        (0.25, _token_similarity(first.location, second.location)),
    ]
    available = [(weight, score) for weight, score in values if score is not None]
    if not available:
        return None
    total_weight = sum(weight for weight, _ in available)
    return sum(weight * score for weight, score in available) / total_weight


def _combine_scores(
    text_score: float | None,
    image_score: float | None,
    attribute_score: float | None,
) -> _CandidateScore:
    weighted: list[tuple[float, float]] = []
    if text_score is not None:
        weighted.append((settings.ai_match_text_weight, text_score))
    if image_score is not None:
        weighted.append((settings.ai_match_image_weight, image_score))
    if attribute_score is not None:
        weighted.append((settings.ai_match_attribute_weight, attribute_score))

    total_weight = sum(weight for weight, _ in weighted)
    final_score = (
        sum(weight * score for weight, score in weighted) / total_weight
        if total_weight
        else 0.0
    )
    return _CandidateScore(
        text_score=text_score,
        image_score=image_score,
        attribute_score=attribute_score,
        final_score=_clamp(final_score),
    )


async def _load_embedding_set(
    db: AsyncSession,
    item_id: uuid.UUID,
) -> _EmbeddingSet:
    rows = (
        await db.scalars(select(ItemEmbedding).where(ItemEmbedding.item_id == item_id))
    ).all()
    text: list[float] | None = None
    images: list[list[float]] = []
    for row in rows:
        if row.modality == EmbeddingModality.TEXT:
            if row.model_name == TEXT_MODEL_NAME and row.text_embedding is not None:
                text = list(row.text_embedding)
        elif row.model_name == IMAGE_MODEL_NAME and row.image_embedding is not None:
            images.append(list(row.image_embedding))
    return _EmbeddingSet(text=text, images=images)


async def _text_candidates(
    db: AsyncSession,
    *,
    item: Item,
    vector: list[float],
) -> dict[uuid.UUID, float]:
    distance = ItemEmbedding.text_embedding.cosine_distance(vector)
    rows = await db.execute(
        select(ItemEmbedding.item_id, distance.label("distance"))
        .join(Item, Item.id == ItemEmbedding.item_id)
        .where(
            Item.type != item.type,
            Item.status == ItemStatus.OPEN,
            Item.deleted_at.is_(None),
            Item.reporter_id != item.reporter_id,
            ItemEmbedding.modality == EmbeddingModality.TEXT,
            ItemEmbedding.model_name == TEXT_MODEL_NAME,
        )
        .order_by(distance)
        .limit(settings.ai_match_candidate_limit)
    )
    return {item_id: float(value) for item_id, value in rows}


async def _image_candidates(
    db: AsyncSession,
    *,
    item: Item,
    vector: list[float],
) -> dict[uuid.UUID, float]:
    distance = ItemEmbedding.image_embedding.cosine_distance(vector)
    rows = await db.execute(
        select(
            ItemEmbedding.item_id,
            func.min(distance).label("distance"),
        )
        .join(Item, Item.id == ItemEmbedding.item_id)
        .where(
            Item.type != item.type,
            Item.status == ItemStatus.OPEN,
            Item.deleted_at.is_(None),
            Item.reporter_id != item.reporter_id,
            ItemEmbedding.modality == EmbeddingModality.IMAGE,
            ItemEmbedding.model_name == IMAGE_MODEL_NAME,
        )
        .group_by(ItemEmbedding.item_id)
        .order_by("distance")
        .limit(settings.ai_match_candidate_limit)
    )
    return {item_id: float(value) for item_id, value in rows}


async def _fts_candidates(
    db: AsyncSession,
    *,
    item: Item,
) -> set[uuid.UUID]:
    space = literal_column("' '::text")
    document_text = (
        func.coalesce(
            Item.title,
            literal_column("''::character varying"),
        ).cast(Text)
        + space
        + func.coalesce(Item.description, literal_column("''::text"))
        + space
        + func.coalesce(
            Item.category,
            literal_column("''::character varying"),
        ).cast(Text)
        + space
        + func.coalesce(
            Item.brand,
            literal_column("''::character varying"),
        ).cast(Text)
        + space
        + func.coalesce(
            Item.color,
            literal_column("''::character varying"),
        ).cast(Text)
        + space
        + func.coalesce(Item.location, literal_column("''::text")).cast(Text)
    )
    document = func.to_tsvector(
        literal_column("'english'::regconfig"),
        document_text,
    )
    query = func.websearch_to_tsquery(
        "english",
        f"{item.title} {item.description[:2000]}",
    )
    rows = await db.execute(
        select(Item.id)
        .where(
            Item.type != item.type,
            Item.status == ItemStatus.OPEN,
            Item.deleted_at.is_(None),
            Item.reporter_id != item.reporter_id,
            document.op("@@")(query),
        )
        .order_by(func.ts_rank_cd(document, query).desc())
        .limit(settings.ai_match_candidate_limit)
    )
    return set(rows.scalars().all())


async def generate_matches(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
) -> int:
    item = await db.scalar(select(Item).where(Item.id == item_id).with_for_update())
    if item is None:
        return 0

    if item.deleted_at is not None or item.status != ItemStatus.OPEN:
        await _mark_matches_stale(db, item.id)
        await db.commit()
        return 0

    own_embeddings = await _load_embedding_set(db, item.id)
    candidate_distances: dict[uuid.UUID, dict[str, float]] = {}

    if own_embeddings.text is not None:
        text_matches = await _text_candidates(
            db,
            item=item,
            vector=own_embeddings.text,
        )
        for candidate_id, distance in text_matches.items():
            candidate_distances.setdefault(candidate_id, {})["text"] = distance

    for image_vector in own_embeddings.images:
        image_matches = await _image_candidates(
            db,
            item=item,
            vector=image_vector,
        )
        for candidate_id, distance in image_matches.items():
            current = candidate_distances.setdefault(candidate_id, {})
            current["image"] = min(current.get("image", 1.0), distance)

    for candidate_id in await _fts_candidates(db, item=item):
        candidate_distances.setdefault(candidate_id, {})

    candidate_ids = list(candidate_distances)
    if not candidate_ids:
        await _mark_matches_stale(db, item.id)
        await db.commit()
        return 0

    candidates = (
        await db.scalars(
            select(Item).where(
                Item.id.in_(candidate_ids),
                Item.type != item.type,
                Item.status == ItemStatus.OPEN,
                Item.deleted_at.is_(None),
                Item.reporter_id != item.reporter_id,
            )
        )
    ).all()
    candidate_items = {candidate.id: candidate for candidate in candidates}

    candidate_embeddings: dict[uuid.UUID, _EmbeddingSet] = {}
    embedding_rows = (
        await db.scalars(
            select(ItemEmbedding).where(ItemEmbedding.item_id.in_(candidate_ids))
        )
    ).all()
    for row in embedding_rows:
        embedding_set = candidate_embeddings.setdefault(
            row.item_id,
            _EmbeddingSet(text=None, images=[]),
        )
        if row.modality == EmbeddingModality.TEXT:
            if row.model_name == TEXT_MODEL_NAME and row.text_embedding is not None:
                embedding_set.text = list(row.text_embedding)
        elif row.model_name == IMAGE_MODEL_NAME and row.image_embedding is not None:
            embedding_set.images.append(list(row.image_embedding))

    scores: dict[tuple[uuid.UUID, uuid.UUID], _CandidateScore] = {}
    for candidate_id, distances in candidate_distances.items():
        candidate = candidate_items.get(candidate_id)
        if candidate is None:
            continue
        candidate_embedding = candidate_embeddings.get(
            candidate_id,
            _EmbeddingSet(text=None, images=[]),
        )

        text_score = (
            1.0 - distances["text"]
            if "text" in distances and own_embeddings.text is not None
            else None
        )
        if text_score is not None:
            text_score = _clamp(text_score)
        elif own_embeddings.text and candidate_embedding.text:
            text_score = _cosine(own_embeddings.text, candidate_embedding.text)

        image_score: float | None = None
        if own_embeddings.images and candidate_embedding.images:
            image_score = max(
                _cosine(first, second)
                for first in own_embeddings.images
                for second in candidate_embedding.images
            )

        attribute_score = _attribute_score(item, candidate)
        combined = _combine_scores(text_score, image_score, attribute_score)
        if combined.final_score < settings.ai_match_min_score:
            continue

        if item.type == ItemType.LOST:
            pair = (item.id, candidate.id)
        else:
            pair = (candidate.id, item.id)
        scores[pair] = combined

    existing_matches = (
        await db.scalars(
            select(ItemMatch).where(
                or_(
                    ItemMatch.lost_item_id == item.id,
                    ItemMatch.found_item_id == item.id,
                )
            )
        )
    ).all()
    existing_by_pair = {
        (match.lost_item_id, match.found_item_id): match for match in existing_matches
    }
    model_version = f"{TEXT_MODEL_NAME}|{IMAGE_MODEL_NAME}|v1"

    matches_to_notify: list[ItemMatch] = []
    for pair, score in scores.items():
        match = existing_by_pair.get(pair)
        if match is None:
            match = ItemMatch(
                lost_item_id=pair[0],
                found_item_id=pair[1],
                text_score=score.text_score,
                image_score=score.image_score,
                attribute_score=score.attribute_score,
                final_score=score.final_score,
                status=MatchStatus.PENDING,
                model_version=model_version,
            )
            db.add(match)
        else:
            match.text_score = score.text_score
            match.image_score = score.image_score
            match.attribute_score = score.attribute_score
            match.final_score = score.final_score
            match.model_version = model_version
            if match.status == MatchStatus.STALE:
                match.status = MatchStatus.PENDING

        if (
            match.status == MatchStatus.PENDING
            and match.final_score >= settings.ai_match_notify_threshold
        ):
            matches_to_notify.append(match)

    for pair, match in existing_by_pair.items():
        if pair not in scores and match.status in {
            MatchStatus.PENDING,
            MatchStatus.NOTIFIED,
            MatchStatus.STALE,
        }:
            match.status = MatchStatus.STALE

    notifications: list[Notification] = []
    if matches_to_notify:
        await db.flush()
        for match in matches_to_notify:
            lost_item = (
                item
                if match.lost_item_id == item.id
                else candidate_items.get(match.lost_item_id)
            )
            found_item = (
                item
                if match.found_item_id == item.id
                else candidate_items.get(match.found_item_id)
            )
            if lost_item is None or found_item is None:
                continue

            for recipient_id in {
                lost_item.reporter_id,
                found_item.reporter_id,
            }:
                notification = await notification_service.create_notification(
                    db,
                    user_id=recipient_id,
                    notification_type=NotificationType.POSSIBLE_MATCH,
                    title="Possible match found",
                    body="A possible match was found for one of your reports.",
                    data={
                        "match_id": str(match.id),
                        "lost_item_id": str(match.lost_item_id),
                        "found_item_id": str(match.found_item_id),
                        "final_score": match.final_score,
                    },
                    dedupe_key=f"match:{match.id}:{recipient_id}",
                )
                if notification is not None:
                    notifications.append(notification)
            match.status = MatchStatus.NOTIFIED

    await db.commit()
    await notification_service.publish_notifications(notifications)
    return len(scores)


async def mark_item_matches_stale(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
) -> None:
    await _mark_matches_stale(db, item_id)


async def _mark_matches_stale(db: AsyncSession, item_id: uuid.UUID) -> None:
    await db.execute(
        update(ItemMatch)
        .where(
            or_(
                ItemMatch.lost_item_id == item_id,
                ItemMatch.found_item_id == item_id,
            ),
            ItemMatch.status.in_([MatchStatus.PENDING, MatchStatus.NOTIFIED]),
        )
        .values(status=MatchStatus.STALE)
    )


async def list_item_matches(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
    query: MatchListQuery,
) -> Page[ItemMatchRead]:
    item = await db.get(Item, item_id)
    if item is None or (item.deleted_at is not None and not _is_staff(actor)):
        raise MatchNotFoundError("Item not found")
    if item.reporter_id != actor.id and not _is_staff(actor):
        raise MatchPermissionError("You cannot view matches for this item")

    conditions = [
        or_(
            ItemMatch.lost_item_id == item_id,
            ItemMatch.found_item_id == item_id,
        )
    ]
    if query.status is not None:
        conditions.append(ItemMatch.status == query.status)
    elif not query.include_stale:
        conditions.append(ItemMatch.status != MatchStatus.STALE)
    if query.min_score is not None:
        conditions.append(ItemMatch.final_score >= query.min_score)

    total = await db.scalar(
        select(func.count()).select_from(ItemMatch).where(*conditions)
    )
    rows = (
        await db.scalars(
            select(ItemMatch)
            .where(*conditions)
            .order_by(ItemMatch.final_score.desc(), ItemMatch.created_at.desc())
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
        )
    ).all()

    return Page(
        items=[ItemMatchRead.model_validate(match) for match in rows],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )


async def get_match(
    db: AsyncSession,
    *,
    actor: User,
    match_id: uuid.UUID,
) -> ItemMatchRead:
    match = await db.get(ItemMatch, match_id)
    if match is None:
        raise MatchNotFoundError("Match not found")
    await _check_match_access(db, actor=actor, match=match)
    return ItemMatchRead.model_validate(match)


async def feedback_match(
    db: AsyncSession,
    *,
    actor: User,
    match_id: uuid.UUID,
    status: MatchStatus,
) -> ItemMatchRead:
    if status not in {MatchStatus.CONFIRMED, MatchStatus.REJECTED}:
        raise MatchStateError("Feedback status must be CONFIRMED or REJECTED")

    match = await db.scalar(
        select(ItemMatch).where(ItemMatch.id == match_id).with_for_update()
    )
    if match is None:
        raise MatchNotFoundError("Match not found")
    await _check_match_access(db, actor=actor, match=match)

    if match.status in {MatchStatus.CONFIRMED, MatchStatus.REJECTED}:
        if match.status != status:
            raise MatchStateError("Match feedback has already been finalized")
        return ItemMatchRead.model_validate(match)

    match.status = status
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="MATCH_FEEDBACK",
        entity_type="MATCH",
        entity_id=match.id,
        metadata={
            "status": status.value,
            "lost_item_id": str(match.lost_item_id),
            "found_item_id": str(match.found_item_id),
        },
    )
    await db.commit()
    await db.refresh(match)
    return ItemMatchRead.model_validate(match)


async def _check_match_access(
    db: AsyncSession,
    *,
    actor: User,
    match: ItemMatch,
) -> None:
    if _is_staff(actor):
        return
    lost_item = await db.get(Item, match.lost_item_id)
    found_item = await db.get(Item, match.found_item_id)
    reporter_ids = {
        item.reporter_id for item in (lost_item, found_item) if item is not None
    }
    if actor.id not in reporter_ids:
        raise MatchPermissionError("You cannot view this match")
