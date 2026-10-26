from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.common.schema import ORMModel


class NotificationListQuery(BaseModel):
    unread_only: bool = False
    type: str | None = Field(default=None, max_length=50)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class NotificationRead(ORMModel):
    id: uuid.UUID
    user_id: uuid.UUID
    type: str
    title: str
    body: str
    data: dict[str, Any] = Field(default_factory=dict)
    read_at: datetime | None = None
    created_at: datetime


class NotificationUnreadCount(ORMModel):
    unread_count: int


class NotificationReadAll(ORMModel):
    updated: int
