from __future__ import annotations

import uuid
from datetime import UTC, datetime
from math import ceil
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app import realtime
from app.common.schema import Page
from app.notification.model import Notification, NotificationType
from app.notification.schema import NotificationListQuery, NotificationRead


class NotificationError(Exception):
    status_code = 400

    def __init__(self, message: str = "Notification operation failed") -> None:
        super().__init__(message)


class NotificationNotFoundError(NotificationError):
    status_code = 404


async def create_notification(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    notification_type: NotificationType,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
    dedupe_key: str | None = None,
) -> Notification | None:
    values = {
        "user_id": user_id,
        "type": notification_type.value,
        "title": title,
        "body": body,
        "data": data or {},
        "dedupe_key": dedupe_key,
    }

    if dedupe_key is None:
        notification = Notification(**values)
        db.add(notification)
        await db.flush()
        await db.refresh(notification)
        return notification

    statement = (
        pg_insert(Notification)
        .values(**values)
        .on_conflict_do_nothing(index_elements=[Notification.dedupe_key])
        .returning(Notification.id)
    )
    notification_id = await db.scalar(statement)
    if notification_id is None:
        return None
    return await db.get(Notification, notification_id)


async def publish_notifications(notifications: list[Notification]) -> None:
    for notification in notifications:
        await realtime.publish_notification(
            user_id=notification.user_id,
            notification=NotificationRead.model_validate(notification).model_dump(
                mode="json"
            ),
        )


async def list_notifications(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    query: NotificationListQuery,
) -> Page[NotificationRead]:
    conditions = [Notification.user_id == user_id]
    if query.unread_only:
        conditions.append(Notification.read_at.is_(None))
    if query.type is not None:
        conditions.append(Notification.type == query.type)

    total = await db.scalar(
        select(func.count()).select_from(Notification).where(*conditions)
    )
    result = await db.execute(
        select(Notification)
        .where(*conditions)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )
    notifications = list(result.scalars().all())

    return Page(
        items=[
            NotificationRead.model_validate(notification)
            for notification in notifications
        ],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )


async def get_unread_count(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> int:
    total = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
    )
    return int(total or 0)


async def mark_notification_read(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    notification_id: uuid.UUID,
) -> NotificationRead:
    notification = await db.scalar(
        select(Notification)
        .where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
        .with_for_update()
    )
    if notification is None:
        raise NotificationNotFoundError("Notification not found")

    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(notification)
    return NotificationRead.model_validate(notification)


async def mark_all_read(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
) -> int:
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.read_at.is_(None),
        )
        .values(read_at=datetime.now(UTC))
    )
    await db.commit()
    return int(result.rowcount or 0)
