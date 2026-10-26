from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import suppress
from datetime import UTC, datetime
from math import ceil

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import cache
from app.ai import service as ai_service
from app.ai.matching import service as matching_service
from app.audit import service as audit_service
from app.claim import service as claim_service
from app.common.schema import Page
from app.config import settings
from app.item import storage
from app.item.model import Item, ItemImage, ItemStatus, ProcessingStatus
from app.item.schema import (
    ItemCreate,
    ItemImageRead,
    ItemListQuery,
    ItemRead,
    ItemSort,
    ItemUpdate,
    MyItemsQuery,
    SortOrder,
)
from app.notification import service as notification_service
from app.user.model import User, UserRole

logger = logging.getLogger(__name__)


class ItemError(Exception):
    status_code = 400

    def __init__(self, message: str = "Item operation failed") -> None:
        super().__init__(message)


class ItemNotFoundError(ItemError):
    status_code = 404


class ItemPermissionError(ItemError):
    status_code = 403


class ItemStateError(ItemError):
    status_code = 409


class TooManyImagesError(ItemError):
    status_code = 409


async def create_item(
    db: AsyncSession,
    *,
    actor: User,
    payload: ItemCreate,
) -> ItemRead:
    item = Item(reporter_id=actor.id, **payload.model_dump())
    db.add(item)
    await db.flush()
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="ITEM_CREATED",
        entity_type="ITEM",
        entity_id=item.id,
        metadata={"type": item.type.value, "status": item.status.value},
    )
    await db.commit()
    await cache.bump_version("items")
    await db.refresh(item)
    await ai_service.enqueue_item_processing(item.id)
    return _item_to_read(item, images=[], is_owner=True)


async def get_item(
    db: AsyncSession,
    item_id: uuid.UUID,
    *,
    viewer_id: uuid.UUID | None = None,
) -> ItemRead:
    version = await cache.get_version("items")
    key = cache.make_key("items:detail", version, {"item_id": str(item_id)})
    cached = await cache.get_json(key)
    if cached is not None:
        try:
            result = ItemRead.model_validate(cached)
            return await _apply_detail_ownership(db, result, viewer_id)
        except ValueError:
            logger.warning("Discarding invalid cached item detail %s", item_id)

    item = await _get_visible_item(db, item_id)
    result = _item_to_read(item)
    await cache.set_json(
        key,
        result.model_dump(mode="json"),
        settings.cache_item_detail_ttl_seconds,
    )
    return await _apply_detail_ownership(db, result, viewer_id)


async def list_items(
    db: AsyncSession,
    query: ItemListQuery,
    *,
    viewer_id: uuid.UUID | None = None,
) -> Page[ItemRead]:
    version = await cache.get_version("items")
    key = cache.make_key(
        "items:list",
        version,
        query.model_dump(mode="json"),
    )
    cached = await cache.get_json(key)
    if cached is not None:
        try:
            page = Page[ItemRead].model_validate(cached)
            return await _apply_page_ownership(db, page, viewer_id)
        except ValueError:
            logger.warning("Discarding invalid cached item list")

    conditions = _build_list_conditions(query)
    total = await _count_items(db, conditions)

    result = await db.execute(
        select(Item)
        .options(selectinload(Item.images))
        .where(*conditions)
        .order_by(*_order_by(query.sort, query.order))
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )

    page = Page(
        items=[_item_to_read(item) for item in result.scalars().all()],
        total=total,
        page=query.page,
        page_size=query.page_size,
        pages=ceil(total / query.page_size) if total else 0,
    )
    await cache.set_json(
        key,
        page.model_dump(mode="json"),
        settings.cache_item_list_ttl_seconds,
    )
    return await _apply_page_ownership(db, page, viewer_id)


async def list_my_items(
    db: AsyncSession,
    *,
    actor: User,
    query: MyItemsQuery,
) -> Page[ItemRead]:
    conditions = [Item.reporter_id == actor.id]

    if not query.include_withdrawn:
        conditions.append(Item.deleted_at.is_(None))
    if query.status is not None:
        conditions.append(Item.status == query.status)

    total = await _count_items(db, conditions)
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.images))
        .where(*conditions)
        .order_by(Item.created_at.desc(), Item.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )

    return Page(
        items=[_item_to_read(item, is_owner=True) for item in result.scalars().all()],
        total=total,
        page=query.page,
        page_size=query.page_size,
        pages=ceil(total / query.page_size) if total else 0,
    )


async def update_item(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
    payload: ItemUpdate,
) -> ItemRead:
    item = await _get_item_for_modification(db, item_id)
    _ensure_owner(item, actor)
    _ensure_open(item)

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(item, field, value)
    item.processing_status = ProcessingStatus.PENDING
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="ITEM_UPDATED",
        entity_type="ITEM",
        entity_id=item.id,
        metadata={"changed_fields": sorted(changes)},
    )

    images = list(item.images)
    await db.commit()
    await cache.bump_version("items")
    await db.refresh(item)
    await ai_service.enqueue_item_processing(item.id)
    return _item_to_read(item, images=images, is_owner=True)


async def withdraw_item(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
) -> None:
    item = await _get_item_for_modification(db, item_id)
    _ensure_owner(item, actor)

    if item.status in {ItemStatus.RESOLVED, ItemStatus.CLOSED}:
        raise ItemStateError("Resolved or closed reports cannot be withdrawn")

    previous_status = item.status
    item.deleted_at = datetime.now(UTC)
    item.status = ItemStatus.CLOSED
    notifications = await claim_service.cancel_open_claims_for_item(
        db,
        item_id=item.id,
        reason="Item was withdrawn by its reporter",
        actor_id=actor.id,
    )
    await matching_service.mark_item_matches_stale(db, item_id=item.id)
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="ITEM_WITHDRAWN",
        entity_type="ITEM",
        entity_id=item.id,
        metadata={
            "previous_status": previous_status.value,
            "status": item.status.value,
        },
    )
    await db.commit()
    await cache.bump_version("items")
    await notification_service.publish_notifications(notifications)
    await ai_service.enqueue_item_processing(item.id)


async def close_item(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
) -> ItemRead:
    item = await _get_item_for_modification(db, item_id)
    is_owner = item.reporter_id == actor.id
    is_staff = actor.role in {UserRole.MANAGER, UserRole.ADMIN}

    if not is_owner and not is_staff:
        raise ItemPermissionError("You do not have permission to close this item")
    if item.status in {ItemStatus.RESOLVED, ItemStatus.CLOSED}:
        raise ItemStateError("Item is already resolved or closed")
    if is_owner and not is_staff and item.status != ItemStatus.OPEN:
        raise ItemStateError("Only OPEN reports can be closed by the reporter")

    images = list(item.images)
    previous_status = item.status
    item.status = ItemStatus.CLOSED
    notifications = await claim_service.cancel_open_claims_for_item(
        db,
        item_id=item.id,
        reason="Item was closed",
        actor_id=actor.id,
    )
    await matching_service.mark_item_matches_stale(db, item_id=item.id)
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="ITEM_CLOSED",
        entity_type="ITEM",
        entity_id=item.id,
        metadata={
            "previous_status": previous_status.value,
            "status": item.status.value,
            "closed_by_staff": is_staff,
        },
    )
    await db.commit()
    await cache.bump_version("items")
    await db.refresh(item)
    await notification_service.publish_notifications(notifications)
    return _item_to_read(item, images=images, is_owner=is_owner)


async def add_image(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
    data: bytes,
) -> ItemImageRead:
    item = await _get_item_for_modification(db, item_id)
    _ensure_owner(item, actor)
    _ensure_open(item)

    if len(item.images) >= settings.max_images_per_item:
        raise TooManyImagesError(
            f"An item can have at most {settings.max_images_per_item} images"
        )

    processed = await asyncio.to_thread(storage.process_image, data)
    storage_key = await asyncio.to_thread(storage.save_image, item.id, processed)

    image = ItemImage(
        item_id=item.id,
        storage_key=storage_key,
        mime_type=processed.mime_type,
        size_bytes=len(processed.data),
        width=processed.width,
        height=processed.height,
    )
    db.add(image)
    item.processing_status = ProcessingStatus.PENDING

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await asyncio.to_thread(storage.delete_image, storage_key)
        raise

    await cache.bump_version("items")
    await db.refresh(image)
    await ai_service.enqueue_item_processing(item.id)
    return _image_to_read(image)


async def delete_image(
    db: AsyncSession,
    *,
    actor: User,
    item_id: uuid.UUID,
    image_id: uuid.UUID,
) -> None:
    item = await _get_item_for_modification(db, item_id)
    _ensure_owner(item, actor)
    _ensure_open(item)

    image = next((image for image in item.images if image.id == image_id), None)
    if image is None:
        raise ItemNotFoundError("Image not found")

    storage_key = image.storage_key
    await db.delete(image)
    item.processing_status = ProcessingStatus.PENDING
    await db.commit()
    await cache.bump_version("items")

    with suppress(OSError):
        await asyncio.to_thread(storage.delete_image, storage_key)
    await ai_service.enqueue_item_processing(item.id)


async def get_media_image(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
    image_id: uuid.UUID,
) -> ItemImage:
    result = await db.execute(
        select(ItemImage)
        .join(Item, ItemImage.item_id == Item.id)
        .where(
            ItemImage.id == image_id,
            ItemImage.item_id == item_id,
            Item.deleted_at.is_(None),
        )
    )
    image = result.scalar_one_or_none()
    if image is None:
        raise ItemNotFoundError("Image not found")
    return image


async def _get_visible_item(db: AsyncSession, item_id: uuid.UUID) -> Item:
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.images))
        .where(Item.id == item_id, Item.deleted_at.is_(None))
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise ItemNotFoundError("Item not found")
    return item


async def _get_item_for_modification(db: AsyncSession, item_id: uuid.UUID) -> Item:
    result = await db.execute(
        select(Item)
        .options(selectinload(Item.images))
        .where(Item.id == item_id, Item.deleted_at.is_(None))
        .with_for_update()
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise ItemNotFoundError("Item not found")
    return item


def _ensure_owner(item: Item, actor: User) -> None:
    if item.reporter_id != actor.id:
        raise ItemPermissionError("You do not own this item")


def _ensure_open(item: Item) -> None:
    if item.status != ItemStatus.OPEN:
        raise ItemStateError("Only OPEN reports can be modified")


def _build_list_conditions(query: ItemListQuery) -> list:
    conditions = [Item.deleted_at.is_(None)]

    if query.status is not None:
        conditions.append(Item.status == query.status)
    else:
        conditions.append(Item.status.in_([ItemStatus.OPEN, ItemStatus.CLAIM_PENDING]))

    if query.type is not None:
        conditions.append(Item.type == query.type)
    if query.category and query.category.strip():
        conditions.append(Item.category.ilike(query.category.strip()))
    if query.location and query.location.strip():
        conditions.append(Item.location.ilike(f"%{query.location.strip()}%"))
    if query.q and query.q.strip():
        term = f"%{query.q.strip()}%"
        conditions.append(
            or_(
                Item.title.ilike(term),
                Item.description.ilike(term),
                Item.location.ilike(term),
                Item.brand.ilike(term),
                Item.color.ilike(term),
            )
        )
    if query.occurred_from is not None:
        conditions.append(Item.occurred_at >= query.occurred_from)
    if query.occurred_to is not None:
        conditions.append(Item.occurred_at <= query.occurred_to)
    if query.created_from is not None:
        conditions.append(Item.created_at >= query.created_from)
    if query.created_to is not None:
        conditions.append(Item.created_at <= query.created_to)

    return conditions


async def _count_items(db: AsyncSession, conditions: list) -> int:
    total = await db.scalar(select(func.count()).select_from(Item).where(*conditions))
    return int(total or 0)


def _order_by(sort: ItemSort, order: SortOrder) -> tuple:
    column = {
        ItemSort.CREATED_AT: Item.created_at,
        ItemSort.OCCURRED_AT: Item.occurred_at,
        ItemSort.TITLE: Item.title,
    }[sort]

    if sort == ItemSort.OCCURRED_AT:
        if order == SortOrder.ASC:
            return column.asc().nulls_last(), Item.id.asc()
        return column.desc().nulls_last(), Item.id.desc()

    if order == SortOrder.ASC:
        return column.asc(), Item.id.asc()
    return column.desc(), Item.id.desc()


async def _apply_detail_ownership(
    db: AsyncSession,
    item: ItemRead,
    viewer_id: uuid.UUID | None,
) -> ItemRead:
    if viewer_id is None:
        return item
    owned_id = await db.scalar(
        select(Item.id).where(
            Item.id == item.id,
            Item.reporter_id == viewer_id,
        )
    )
    item.is_owner = owned_id is not None
    return item


async def _apply_page_ownership(
    db: AsyncSession,
    page: Page[ItemRead],
    viewer_id: uuid.UUID | None,
) -> Page[ItemRead]:
    if viewer_id is None or not page.items:
        return page
    item_ids = [item.id for item in page.items]
    owned_ids = set(
        (
            await db.scalars(
                select(Item.id).where(
                    Item.id.in_(item_ids),
                    Item.reporter_id == viewer_id,
                )
            )
        ).all()
    )
    for item in page.items:
        item.is_owner = item.id in owned_ids
    return page


def _item_to_read(
    item: Item,
    images: list[ItemImage] | None = None,
    *,
    is_owner: bool = False,
) -> ItemRead:
    item_images = images if images is not None else item.images
    return ItemRead(
        id=item.id,
        type=item.type,
        title=item.title,
        description=item.description,
        category=item.category,
        brand=item.brand,
        color=item.color,
        location=item.location,
        occurred_at=item.occurred_at,
        status=item.status,
        processing_status=item.processing_status,
        is_owner=is_owner,
        created_at=item.created_at,
        updated_at=item.updated_at,
        images=[_image_to_read(image) for image in item_images],
    )


def _image_to_read(image: ItemImage) -> ItemImageRead:
    return ItemImageRead(
        id=image.id,
        item_id=image.item_id,
        mime_type=image.mime_type,
        size_bytes=image.size_bytes,
        width=image.width,
        height=image.height,
        created_at=image.created_at,
        url=storage.build_media_url(image.item_id, image.id),
    )
