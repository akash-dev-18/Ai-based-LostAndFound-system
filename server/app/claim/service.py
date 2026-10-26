from __future__ import annotations

import uuid
from datetime import UTC, datetime
from math import ceil

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import cache
from app.ai.matching import service as matching_service
from app.audit import service as audit_service
from app.claim.model import Claim, ClaimStatus
from app.claim.schema import (
    ClaimListQuery,
    ClaimRead,
    ManagerClaimListQuery,
)
from app.common.schema import Page
from app.item import storage
from app.item.model import Item, ItemStatus, ItemType
from app.notification import service as notification_service
from app.notification.model import Notification, NotificationType
from app.user.model import User, UserRole


class ClaimError(Exception):
    status_code = 400

    def __init__(self, message: str = "Claim operation failed") -> None:
        super().__init__(message)


class ClaimNotFoundError(ClaimError):
    status_code = 404


class ClaimPermissionError(ClaimError):
    status_code = 403


class ClaimStateError(ClaimError):
    status_code = 409


class ClaimConflictError(ClaimError):
    status_code = 409


def _is_staff(user: User) -> bool:
    return user.role in {UserRole.MANAGER, UserRole.ADMIN}


async def _create_claim_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    claim_id: uuid.UUID,
    item_id: uuid.UUID,
    notification_type: NotificationType,
    title: str,
    body: str,
    key_suffix: str,
) -> Notification | None:
    return await notification_service.create_notification(
        db,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        data={"claim_id": str(claim_id), "item_id": str(item_id)},
        dedupe_key=f"claim:{claim_id}:{key_suffix}:{user_id}",
    )


def _claim_to_read(
    claim: Claim,
    *,
    item: Item | None = None,
    claimant: User | None = None,
) -> ClaimRead:
    result = ClaimRead.model_validate(claim)
    if item is not None:
        result.item_title = item.title
        result.item_type = item.type
        result.item_status = item.status
        if item.images:
            result.item_image_url = storage.build_media_url(
                item.id,
                item.images[0].id,
            )
    if claimant is not None:
        result.claimant_name = claimant.name
    return result


async def submit_claim(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
    message: str,
) -> ClaimRead:
    item = await db.scalar(
        select(Item)
        .where(
            Item.id == item_id,
            Item.deleted_at.is_(None),
        )
        .with_for_update()
    )
    if item is None:
        raise ClaimNotFoundError("Item not found")
    if item.type != ItemType.FOUND:
        raise ClaimStateError("Only FOUND reports can be claimed")
    if item.reporter_id == actor.id:
        raise ClaimStateError("You cannot claim your own report")
    if item.status != ItemStatus.OPEN:
        raise ClaimStateError("Item is not open for claims")

    existing = await db.scalar(
        select(Claim.id).where(
            Claim.item_id == item.id,
            Claim.claimant_id == actor.id,
            Claim.status == ClaimStatus.PENDING,
        )
    )
    if existing is not None:
        raise ClaimConflictError("You already have a pending claim for this item")

    claim = Claim(
        item_id=item.id,
        claimant_id=actor.id,
        message=message,
    )
    db.add(claim)
    notification: Notification | None = None
    try:
        await db.flush()
        await audit_service.record_audit(
            db,
            actor_id=actor.id,
            action="CLAIM_SUBMITTED",
            entity_type="CLAIM",
            entity_id=claim.id,
            metadata={"item_id": str(item.id)},
        )
        notification = await _create_claim_notification(
            db,
            user_id=item.reporter_id,
            claim_id=claim.id,
            item_id=item.id,
            notification_type=NotificationType.CLAIM_SUBMITTED,
            title="New claim submitted",
            body="A new claim is awaiting your review.",
            key_suffix="submitted",
        )
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ClaimConflictError(
            "You already have a pending claim for this item"
        ) from exc

    await db.refresh(claim)
    if notification is not None:
        await notification_service.publish_notifications([notification])
    return ClaimRead.model_validate(claim)


async def get_claim(
    db: AsyncSession,
    *,
    actor: User,
    claim_id: uuid.UUID,
) -> ClaimRead:
    claim = await db.scalar(
        select(Claim)
        .options(
            selectinload(Claim.item).selectinload(Item.images),
            selectinload(Claim.claimant),
        )
        .where(Claim.id == claim_id)
    )
    if claim is None:
        raise ClaimNotFoundError("Claim not found")
    if claim.claimant_id != actor.id and not _is_staff(actor):
        raise ClaimPermissionError("You cannot view this claim")
    return _claim_to_read(claim, item=claim.item, claimant=claim.claimant)


async def list_my_claims(
    db: AsyncSession,
    *,
    actor: User,
    query: ClaimListQuery,
) -> Page[ClaimRead]:
    conditions = [Claim.claimant_id == actor.id]
    if query.status is not None:
        conditions.append(Claim.status == query.status)
    if query.item_id is not None:
        conditions.append(Claim.item_id == query.item_id)

    total = await db.scalar(select(func.count()).select_from(Claim).where(*conditions))
    result = await db.execute(
        select(Claim)
        .options(
            selectinload(Claim.item).selectinload(Item.images),
            selectinload(Claim.claimant),
        )
        .where(*conditions)
        .order_by(Claim.created_at.desc(), Claim.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )
    claims = list(result.scalars().all())

    return Page(
        items=[
            _claim_to_read(claim, item=claim.item, claimant=claim.claimant)
            for claim in claims
        ],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )


async def list_manager_claims(
    db: AsyncSession,
    *,
    actor: User,
    query: ManagerClaimListQuery,
) -> Page[ClaimRead]:
    if not _is_staff(actor):
        raise ClaimPermissionError("Manager access is required")

    conditions = []
    if query.status is not None:
        conditions.append(Claim.status == query.status)
    if query.item_id is not None:
        conditions.append(Claim.item_id == query.item_id)
    if query.claimant_id is not None:
        conditions.append(Claim.claimant_id == query.claimant_id)

    total = await db.scalar(select(func.count()).select_from(Claim).where(*conditions))
    result = await db.execute(
        select(Claim)
        .options(
            selectinload(Claim.item).selectinload(Item.images),
            selectinload(Claim.claimant),
        )
        .where(*conditions)
        .order_by(Claim.created_at.desc(), Claim.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )
    claims = list(result.scalars().all())

    return Page(
        items=[
            _claim_to_read(claim, item=claim.item, claimant=claim.claimant)
            for claim in claims
        ],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )


async def approve_claim(
    db: AsyncSession,
    *,
    actor: User,
    claim_id: uuid.UUID,
    resolution_notes: str | None,
) -> ClaimRead:
    if not _is_staff(actor):
        raise ClaimPermissionError("Manager access is required")

    claim, item = await _lock_claim_and_item(db, claim_id)
    if claim.status != ClaimStatus.PENDING:
        raise ClaimStateError("Only pending claims can be approved")

    if item.type != ItemType.FOUND:
        raise ClaimStateError("Only claims for FOUND reports can be approved")
    if item.status != ItemStatus.OPEN:
        raise ClaimStateError("Item is not open for another claim approval")

    other_approved = await db.scalar(
        select(Claim.id).where(
            Claim.item_id == item.id,
            Claim.id != claim.id,
            Claim.status.in_([ClaimStatus.APPROVED, ClaimStatus.COMPLETED]),
        )
    )
    if other_approved is not None:
        raise ClaimStateError("Item already has an approved claim")

    now = datetime.now(UTC)
    claim.status = ClaimStatus.APPROVED
    claim.reviewed_by = actor.id
    claim.reviewed_at = now
    if resolution_notes is not None:
        claim.resolution_notes = resolution_notes
    item.status = ItemStatus.CLAIM_PENDING
    await matching_service.mark_item_matches_stale(db, item_id=item.id)
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="CLAIM_APPROVED",
        entity_type="CLAIM",
        entity_id=claim.id,
        metadata={
            "item_id": str(item.id),
            "claimant_id": str(claim.claimant_id),
        },
    )

    notifications = [
        notification
        for notification in [
            await _create_claim_notification(
                db,
                user_id=claim.claimant_id,
                claim_id=claim.id,
                item_id=item.id,
                notification_type=NotificationType.CLAIM_APPROVED,
                title="Claim approved",
                body="Your claim has been approved.",
                key_suffix="approved",
            ),
            await _create_claim_notification(
                db,
                user_id=item.reporter_id,
                claim_id=claim.id,
                item_id=item.id,
                notification_type=NotificationType.CLAIM_APPROVED,
                title="Claim approved",
                body="A claim for your report has been approved.",
                key_suffix="approved",
            ),
        ]
        if notification is not None
    ]

    await db.commit()
    await cache.bump_version("items")
    await db.refresh(claim)
    await notification_service.publish_notifications(notifications)
    return ClaimRead.model_validate(claim)


async def reject_claim(
    db: AsyncSession,
    *,
    actor: User,
    claim_id: uuid.UUID,
    resolution_notes: str,
) -> ClaimRead:
    if not _is_staff(actor):
        raise ClaimPermissionError("Manager access is required")

    claim = await _get_claim_for_update(db, claim_id)
    if claim.status != ClaimStatus.PENDING:
        raise ClaimStateError("Only pending claims can be rejected")

    claim.status = ClaimStatus.REJECTED
    claim.reviewed_by = actor.id
    claim.reviewed_at = datetime.now(UTC)
    claim.resolution_notes = resolution_notes
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="CLAIM_REJECTED",
        entity_type="CLAIM",
        entity_id=claim.id,
        metadata={"item_id": str(claim.item_id)},
    )

    notification = await _create_claim_notification(
        db,
        user_id=claim.claimant_id,
        claim_id=claim.id,
        item_id=claim.item_id,
        notification_type=NotificationType.CLAIM_REJECTED,
        title="Claim rejected",
        body="Your claim was not approved.",
        key_suffix="rejected",
    )

    await db.commit()
    await db.refresh(claim)
    if notification is not None:
        await notification_service.publish_notifications([notification])
    return ClaimRead.model_validate(claim)


async def complete_handover(
    db: AsyncSession,
    *,
    actor: User,
    claim_id: uuid.UUID,
    resolution_notes: str | None,
) -> ClaimRead:
    if not _is_staff(actor):
        raise ClaimPermissionError("Manager access is required")

    claim, item = await _lock_claim_and_item(db, claim_id)
    if claim.status != ClaimStatus.APPROVED:
        raise ClaimStateError("Only approved claims can be completed")

    if item.type != ItemType.FOUND:
        raise ClaimStateError("Only FOUND reports can be handed over")
    if item.status != ItemStatus.CLAIM_PENDING:
        raise ClaimStateError("Item is not pending handover")

    now = datetime.now(UTC)
    cancelled_claimant_ids = list(
        (
            await db.scalars(
                select(Claim.claimant_id).where(
                    Claim.item_id == item.id,
                    Claim.id != claim.id,
                    Claim.status == ClaimStatus.PENDING,
                )
            )
        ).all()
    )

    claim.status = ClaimStatus.COMPLETED
    if resolution_notes is not None:
        claim.resolution_notes = resolution_notes
    item.status = ItemStatus.RESOLVED
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="CLAIM_COMPLETED",
        entity_type="CLAIM",
        entity_id=claim.id,
        metadata={
            "item_id": str(item.id),
            "claimant_id": str(claim.claimant_id),
            "cancelled_claims": len(cancelled_claimant_ids),
        },
    )

    await db.execute(
        update(Claim)
        .where(
            Claim.item_id == item.id,
            Claim.id != claim.id,
            Claim.status == ClaimStatus.PENDING,
        )
        .values(
            status=ClaimStatus.CANCELLED,
            reviewed_by=actor.id,
            reviewed_at=now,
            resolution_notes="Cancelled because another claim was completed",
        )
    )
    await matching_service.mark_item_matches_stale(db, item_id=item.id)

    notifications = [
        notification
        for notification in [
            await _create_claim_notification(
                db,
                user_id=claim.claimant_id,
                claim_id=claim.id,
                item_id=item.id,
                notification_type=NotificationType.HANDOVER_COMPLETED,
                title="Handover completed",
                body="The handover for your claim has been completed.",
                key_suffix="completed",
            ),
            await _create_claim_notification(
                db,
                user_id=item.reporter_id,
                claim_id=claim.id,
                item_id=item.id,
                notification_type=NotificationType.ITEM_RESOLVED,
                title="Item resolved",
                body="Your report has been marked resolved.",
                key_suffix="resolved",
            ),
            *[
                await _create_claim_notification(
                    db,
                    user_id=claimant_id,
                    claim_id=claim.id,
                    item_id=item.id,
                    notification_type=NotificationType.CLAIM_REJECTED,
                    title="Claim cancelled",
                    body="Another claim was completed for this item.",
                    key_suffix=f"cancelled:{claimant_id}",
                )
                for claimant_id in cancelled_claimant_ids
            ],
        ]
        if notification is not None
    ]

    await db.commit()
    await cache.bump_version("items")
    await db.refresh(claim)
    await notification_service.publish_notifications(notifications)
    return ClaimRead.model_validate(claim)


async def cancel_open_claims_for_item(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
    reason: str,
    actor_id: uuid.UUID | None = None,
) -> list[Notification]:
    claims = list(
        (
            await db.scalars(
                select(Claim).where(
                    Claim.item_id == item_id,
                    Claim.status.in_([ClaimStatus.PENDING, ClaimStatus.APPROVED]),
                )
            )
        ).all()
    )
    notifications = [
        notification
        for notification in [
            await _create_claim_notification(
                db,
                user_id=claim.claimant_id,
                claim_id=claim.id,
                item_id=item_id,
                notification_type=NotificationType.CLAIM_REJECTED,
                title="Claim cancelled",
                body=f"Your claim was cancelled. {reason}",
                key_suffix="cancelled",
            )
            for claim in claims
        ]
        if notification is not None
    ]

    for claim in claims:
        await audit_service.record_audit(
            db,
            actor_id=actor_id,
            action="CLAIM_CANCELLED",
            entity_type="CLAIM",
            entity_id=claim.id,
            metadata={"item_id": str(item_id), "reason": reason},
        )

    await db.execute(
        update(Claim)
        .where(
            Claim.item_id == item_id,
            Claim.status.in_([ClaimStatus.PENDING, ClaimStatus.APPROVED]),
        )
        .values(
            status=ClaimStatus.CANCELLED,
            reviewed_at=datetime.now(UTC),
            resolution_notes=reason,
        )
    )
    return notifications


async def _lock_claim_and_item(
    db: AsyncSession,
    claim_id: uuid.UUID,
) -> tuple[Claim, Item]:
    item_id = await db.scalar(select(Claim.item_id).where(Claim.id == claim_id))
    if item_id is None:
        raise ClaimNotFoundError("Claim not found")

    item = await _get_item_for_update(db, item_id)
    claim = await _get_claim_for_update(db, claim_id)
    if claim.item_id != item.id:
        raise ClaimStateError("Claim item changed during review")
    return claim, item


async def _get_claim_for_update(
    db: AsyncSession,
    claim_id: uuid.UUID,
) -> Claim:
    claim = await db.scalar(select(Claim).where(Claim.id == claim_id).with_for_update())
    if claim is None:
        raise ClaimNotFoundError("Claim not found")
    return claim


async def _get_item_for_update(
    db: AsyncSession,
    item_id: uuid.UUID,
) -> Item:
    item = await db.scalar(
        select(Item)
        .where(
            Item.id == item_id,
            Item.deleted_at.is_(None),
        )
        .with_for_update()
    )
    if item is None:
        raise ClaimNotFoundError("Item not found")
    return item
