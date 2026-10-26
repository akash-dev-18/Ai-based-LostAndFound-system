from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.chat.model import ConversationType
from app.common.schema import ORMModel

MessageContent = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=10000),
]


class ConversationCreate(ORMModel):
    type: ConversationType
    claim_id: uuid.UUID | None = None
    match_id: uuid.UUID | None = None
    participant_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def reject_multiple_relations(self) -> ConversationCreate:
        if self.claim_id is not None and self.match_id is not None:
            raise ValueError("A conversation cannot relate to both a claim and a match")
        return self


class ConversationListQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ConversationParticipantRead(ORMModel):
    conversation_id: uuid.UUID
    user_id: uuid.UUID
    name: str
    joined_at: datetime
    last_read_at: datetime | None = None


class ConversationRead(ORMModel):
    id: uuid.UUID
    type: ConversationType
    claim_id: uuid.UUID | None = None
    match_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime
    participants: list[ConversationParticipantRead] = Field(default_factory=list)
    unread_count: int = 0


class MessageCreate(ORMModel):
    content: MessageContent
    client_message_id: uuid.UUID | None = None


class MessageListQuery(BaseModel):
    limit: int = Field(default=50, ge=1, le=100)
    before_id: uuid.UUID | None = None
    after_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def reject_conflicting_cursors(self) -> MessageListQuery:
        if self.before_id is not None and self.after_id is not None:
            raise ValueError("before_id and after_id cannot be used together")
        return self


class MessageRead(ORMModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    sender_id: uuid.UUID
    client_message_id: uuid.UUID | None = None
    content: str
    created_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None


class MessagePage(BaseModel):
    items: list[MessageRead]
    has_more: bool
    next_cursor: uuid.UUID | None = None
