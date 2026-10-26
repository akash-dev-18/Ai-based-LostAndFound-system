from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.ai.model import EmbeddingModality, KnowledgeDocumentStatus
from app.common.schema import ORMModel


class ItemEmbeddingRead(ORMModel):
    id: uuid.UUID
    item_id: uuid.UUID
    image_id: uuid.UUID | None = None
    modality: EmbeddingModality
    model_name: str
    created_at: datetime


class KnowledgeDocumentCreate(ORMModel):
    title: str = Field(min_length=1, max_length=255)
    source: str = Field(min_length=1)
    version: str = Field(min_length=1, max_length=50)
    content: str = Field(min_length=1, max_length=1_000_000)

    @field_validator("title", "source", "version", "content")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value must not be blank")
        return value


class KnowledgeDocumentListQuery(BaseModel):
    status: KnowledgeDocumentStatus | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class KnowledgeDocumentRead(ORMModel):
    id: uuid.UUID
    title: str
    source: str
    version: str
    status: KnowledgeDocumentStatus
    created_at: datetime
    updated_at: datetime


class DocumentChunkRead(ORMModel):
    id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    content: str
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="chunk_metadata"
    )
    created_at: datetime


class ChatbotMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = Field(default=None, max_length=100)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message must not be blank")
        return value


class ChatbotSource(BaseModel):
    type: str
    id: str
    title: str
    snippet: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ChatbotToolCall(BaseModel):
    name: str
    ok: bool
    duration_ms: int


class ChatbotMessageResponse(BaseModel):
    answer: str
    session_id: str
    grounded: bool
    uncertain: bool
    sources: list[ChatbotSource] = Field(default_factory=list)
    tool_calls: list[ChatbotToolCall] = Field(default_factory=list)
    steps: int = 0
