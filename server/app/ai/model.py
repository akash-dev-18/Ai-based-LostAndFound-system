from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.item.model import Item, ItemImage


class EmbeddingModality(StrEnum):
    TEXT = "TEXT"
    IMAGE = "IMAGE"


class KnowledgeDocumentStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"
    ARCHIVED = "ARCHIVED"


class ItemEmbedding(Base):
    __tablename__ = "item_embeddings"
    __table_args__ = (
        Index("ix_item_embeddings_item_modality", "item_id", "modality"),
        Index(
            "uq_item_embeddings_text_item",
            "item_id",
            unique=True,
            postgresql_where=text("modality = 'TEXT'"),
        ),
        Index(
            "ix_item_embeddings_text_hnsw",
            "text_embedding",
            postgresql_using="hnsw",
            postgresql_ops={"text_embedding": "vector_cosine_ops"},
            postgresql_where=text("modality = 'TEXT'"),
        ),
        Index(
            "uq_item_embeddings_image_image",
            "image_id",
            unique=True,
            postgresql_where=text("modality = 'IMAGE'"),
        ),
        Index(
            "ix_item_embeddings_image_hnsw",
            "image_embedding",
            postgresql_using="hnsw",
            postgresql_ops={"image_embedding": "vector_cosine_ops"},
            postgresql_where=text("modality = 'IMAGE'"),
        ),
        CheckConstraint(
            "(modality = 'TEXT' AND text_embedding IS NOT NULL "
            "AND image_embedding IS NULL AND image_id IS NULL) OR "
            "(modality = 'IMAGE' AND image_embedding IS NOT NULL "
            "AND text_embedding IS NULL AND image_id IS NOT NULL)",
            name="valid_embedding_modality",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE")
    )
    image_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("item_images.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    modality: Mapped[EmbeddingModality] = mapped_column(
        Enum(EmbeddingModality, name="embedding_modality")
    )
    model_name: Mapped[str] = mapped_column(String(100))
    text_embedding: Mapped[list[float] | None] = mapped_column(
        Vector(384), nullable=True
    )
    image_embedding: Mapped[list[float] | None] = mapped_column(
        Vector(512), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    item: Mapped[Item] = relationship(back_populates="embeddings")
    image: Mapped[ItemImage | None] = relationship(back_populates="embeddings")


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(50))
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[KnowledgeDocumentStatus] = mapped_column(
        Enum(KnowledgeDocumentStatus, name="knowledge_document_status"),
        default=KnowledgeDocumentStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    chunks: Mapped[list[DocumentChunk]] = relationship(back_populates="document")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        UniqueConstraint(
            "document_id", "chunk_index", name="uq_document_chunks_document_chunk"
        ),
        Index(
            "ix_document_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
        Index(
            "ix_document_chunks_fts",
            text("to_tsvector('english'::regconfig, content)"),
            postgresql_using="gin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("knowledge_documents.id", ondelete="CASCADE")
    )
    chunk_index: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(384))
    chunk_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")
