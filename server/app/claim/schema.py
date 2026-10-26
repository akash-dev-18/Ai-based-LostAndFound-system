from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.claim.model import ClaimStatus
from app.common.schema import ORMModel
from app.item.model import ItemStatus, ItemType


class ClaimCreate(ORMModel):
    message: str = Field(min_length=1, max_length=5000)

    @field_validator("message")
    @classmethod
    def strip_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Claim message must not be blank")
        return value


class ClaimReview(ORMModel):
    resolution_notes: str | None = Field(default=None, max_length=5000)

    @field_validator("resolution_notes")
    @classmethod
    def strip_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ClaimReject(ClaimReview):
    resolution_notes: str = Field(min_length=1, max_length=5000)

    @field_validator("resolution_notes")
    @classmethod
    def strip_rejection_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A rejection reason is required")
        return value


class ClaimListQuery(BaseModel):
    status: ClaimStatus | None = None
    item_id: uuid.UUID | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class ManagerClaimListQuery(ClaimListQuery):
    claimant_id: uuid.UUID | None = None


class ClaimRead(ORMModel):
    id: uuid.UUID
    item_id: uuid.UUID
    claimant_id: uuid.UUID
    message: str
    status: ClaimStatus
    reviewed_by: uuid.UUID | None = None
    reviewed_at: datetime | None = None
    resolution_notes: str | None = None
    item_title: str | None = None
    item_type: ItemType | None = None
    item_status: ItemStatus | None = None
    item_image_url: str | None = None
    claimant_name: str | None = None
    created_at: datetime
    updated_at: datetime
