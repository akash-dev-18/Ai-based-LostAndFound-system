from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.chat.model import Conversation
    from app.item.model import Item


class MatchStatus(StrEnum):
    PENDING = "PENDING"
    NOTIFIED = "NOTIFIED"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    STALE = "STALE"


class ItemMatch(Base):
    __tablename__ = "item_matches"
    __table_args__ = (
        UniqueConstraint(
            "lost_item_id", "found_item_id", name="uq_item_matches_lost_found"
        ),
        CheckConstraint("lost_item_id <> found_item_id", name="distinct_items"),
        Index("ix_item_matches_found_status", "found_item_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lost_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE")
    )
    found_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE")
    )
    text_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    attribute_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    final_score: Mapped[float] = mapped_column(Float)
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, name="match_status"), default=MatchStatus.PENDING
    )
    model_version: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lost_item: Mapped[Item] = relationship(
        back_populates="lost_matches", foreign_keys="ItemMatch.lost_item_id"
    )
    found_item: Mapped[Item] = relationship(
        back_populates="found_matches", foreign_keys="ItemMatch.found_item_id"
    )
    conversations: Mapped[list[Conversation]] = relationship(back_populates="match")
