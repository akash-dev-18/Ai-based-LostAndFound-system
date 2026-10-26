from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.common.schema import Page
from app.db.session import get_db
from app.notification import service
from app.notification.schema import (
    NotificationListQuery,
    NotificationRead,
    NotificationReadAll,
    NotificationUnreadCount,
)
from app.user.model import User

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _notification_http_exception(exc: service.NotificationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("", response_model=Page[NotificationRead])
async def list_notifications(
    query: Annotated[NotificationListQuery, Query()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[NotificationRead]:
    return await service.list_notifications(
        db,
        user_id=current_user.id,
        query=query,
    )


@router.get("/unread-count", response_model=NotificationUnreadCount)
async def get_unread_count(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationUnreadCount:
    unread_count = await service.get_unread_count(db, user_id=current_user.id)
    return NotificationUnreadCount(unread_count=unread_count)


@router.patch("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationRead:
    try:
        return await service.mark_notification_read(
            db,
            user_id=current_user.id,
            notification_id=notification_id,
        )
    except service.NotificationError as exc:
        raise _notification_http_exception(exc) from exc


@router.post("/read-all", response_model=NotificationReadAll)
async def mark_all_read(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationReadAll:
    updated = await service.mark_all_read(db, user_id=current_user.id)
    return NotificationReadAll(updated=updated)
