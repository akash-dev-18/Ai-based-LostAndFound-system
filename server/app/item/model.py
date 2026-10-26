from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.ai.matching.model import ItemMatch
    from app.ai.model import ItemEmbedding
    from app.claim.model import Claim
    from app.user.model import User


class ItemType(StrEnum):
    LOST = "LOST"
    FOUND = "FOUND"


class ItemStatus(StrEnum):
    OPEN = "OPEN"
    CLAIM_PENDING = "CLAIM_PENDING"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class ProcessingStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        Index("ix_items_type_status_created_at", "type", "status", "created_at"),
        Index("ix_items_reporter_created_at", "reporter_id", "created_at"),
        Index(
            "ix_items_fts",
            text(
                "to_tsvector('english'::regconfig, "
                "(((((((((COALESCE(title, ''::character varying)::text "
                "|| ' '::text) || COALESCE(description, ''::text)) "
                "|| ' '::text) || COALESCE(category, ''::character varying)::text) "
                "|| ' '::text) || COALESCE(brand, ''::character varying)::text) "
                "|| ' '::text) || COALESCE(color, ''::character varying)::text) "
                "|| ' '::text) || COALESCE(location, ''::text))"
            ),
            postgresql_using="gin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    type: Mapped[ItemType] = mapped_column(Enum(ItemType, name="item_type"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100))
    brand: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str] = mapped_column(Text)
    occurred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[ItemStatus] = mapped_column(
        Enum(ItemStatus, name="item_status"), default=ItemStatus.OPEN
    )
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        Enum(ProcessingStatus, name="processing_status"),
        default=ProcessingStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    reporter: Mapped[User] = relationship(back_populates="items")
    images: Mapped[list[ItemImage]] = relationship(back_populates="item")
    embeddings: Mapped[list[ItemEmbedding]] = relationship(back_populates="item")
    claims: Mapped[list[Claim]] = relationship(back_populates="item")
    lost_matches: Mapped[list[ItemMatch]] = relationship(
        back_populates="lost_item", foreign_keys="ItemMatch.lost_item_id"
    )
    found_matches: Mapped[list[ItemMatch]] = relationship(
        back_populates="found_item", foreign_keys="ItemMatch.found_item_id"
    )


class ItemImage(Base):
    __tablename__ = "item_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), index=True
    )
    storage_key: Mapped[str] = mapped_column(String(500), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    item: Mapped[Item] = relationship(back_populates="images")
    embeddings: Mapped[list[ItemEmbedding]] = relationship(back_populates="image")
