from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.ai.matching.model import MatchStatus
from app.common.schema import ORMModel


class MatchListQuery(BaseModel):
    status: MatchStatus | None = None
    min_score: float | None = Field(default=None, ge=0, le=1)
    include_stale: bool = False
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ItemMatchRead(ORMModel):
    id: uuid.UUID
    lost_item_id: uuid.UUID
    found_item_id: uuid.UUID
    text_score: float | None = None
    image_score: float | None = None
    attribute_score: float | None = None
    final_score: float
    status: MatchStatus
    model_version: str
    created_at: datetime
    updated_at: datetime


class MatchFeedback(ORMModel):
    status: MatchStatus

    @field_validator("status")
    @classmethod
    def only_final_feedback(cls, value: MatchStatus) -> MatchStatus:
        if value not in {MatchStatus.CONFIRMED, MatchStatus.REJECTED}:
            raise ValueError("Feedback status must be CONFIRMED or REJECTED")
        return value
