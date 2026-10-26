from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Self

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from app.common.schema import ORMModel


class AuditLogListQuery(BaseModel):
    actor_id: uuid.UUID | None = None
    action: str | None = Field(default=None, max_length=100)
    entity_type: str | None = Field(default=None, max_length=100)
    entity_id: uuid.UUID | None = None
    created_from: AwareDatetime | None = None
    created_to: AwareDatetime | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def validate_created_range(self) -> Self:
        if (
            self.created_from is not None
            and self.created_to is not None
            and self.created_from > self.created_to
        ):
            raise ValueError("created_from must be before created_to")
        return self


class AuditLogRead(ORMModel):
    id: uuid.UUID
    actor_id: uuid.UUID | None = None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None = None
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="log_metadata"
    )
    created_at: datetime
