from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    Field,
    StringConstraints,
    model_validator,
)

from app.common.schema import ORMModel
from app.item.model import ItemStatus, ItemType, ProcessingStatus


def _not_in_future(value: datetime) -> datetime:
    if value > datetime.now(UTC):
        raise ValueError("Occurred time cannot be in the future")
    return value


def _normalize_optional_text(max_length: int):
    def normalize(value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if len(value) > max_length:
            raise ValueError(f"String should have at most {max_length} characters")
        return value

    return normalize


Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Category = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
Location = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Brand = Annotated[str | None, AfterValidator(_normalize_optional_text(100))]
Color = Annotated[str | None, AfterValidator(_normalize_optional_text(50))]
OccurredAt = Annotated[AwareDatetime, AfterValidator(_not_in_future)]


class ItemBase(ORMModel):
    title: Title
    description: Description
    category: Category
    brand: Brand = None
    color: Color = None
    location: Location
    occurred_at: OccurredAt | None = None


class ItemCreate(ItemBase):
    type: ItemType


class ItemUpdate(ORMModel):
    title: Title | None = None
    description: Description | None = None
    category: Category | None = None
    brand: Brand = None
    color: Color = None
    location: Location | None = None
    occurred_at: OccurredAt | None = None

    @model_validator(mode="after")
    def reject_null_required_fields(self) -> Self:
        for field in ("title", "description", "category", "location"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ItemSort(StrEnum):
    CREATED_AT = "created_at"
    OCCURRED_AT = "occurred_at"
    TITLE = "title"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class ItemListQuery(BaseModel):
    q: str | None = Field(default=None, max_length=200)
    type: ItemType | None = None
    category: str | None = Field(default=None, max_length=100)
    status: ItemStatus | None = None
    location: str | None = Field(default=None, max_length=200)
    occurred_from: AwareDatetime | None = None
    occurred_to: AwareDatetime | None = None
    created_from: AwareDatetime | None = None
    created_to: AwareDatetime | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort: ItemSort = ItemSort.CREATED_AT
    order: SortOrder = SortOrder.DESC

    @model_validator(mode="after")
    def validate_ranges(self) -> Self:
        if (
            self.occurred_from is not None
            and self.occurred_to is not None
            and self.occurred_from > self.occurred_to
        ):
            raise ValueError("occurred_from must be before occurred_to")
        if (
            self.created_from is not None
            and self.created_to is not None
            and self.created_from > self.created_to
        ):
            raise ValueError("created_from must be before created_to")
        return self


class MyItemsQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    status: ItemStatus | None = None
    include_withdrawn: bool = False


class ItemImageRead(ORMModel):
    id: uuid.UUID
    item_id: uuid.UUID
    mime_type: str
    size_bytes: int
    width: int
    height: int
    created_at: datetime
    url: str


class ItemRead(ItemBase):
    id: uuid.UUID
    type: ItemType
    status: ItemStatus
    processing_status: ProcessingStatus
    is_owner: bool = False
    created_at: datetime
    updated_at: datetime
    images: list[ItemImageRead] = Field(default_factory=list)
