from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.matching import service
from app.ai.matching.schema import (
    ItemMatchRead,
    MatchFeedback,
    MatchListQuery,
)
from app.auth.dependencies import get_current_user
from app.common.schema import Page
from app.db.session import get_db
from app.user.model import User

router = APIRouter(tags=["Matching"])


def _match_http_exception(exc: service.MatchError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.get("/items/{item_id}/matches", response_model=Page[ItemMatchRead])
async def list_item_matches(
    item_id: uuid.UUID,
    query: Annotated[MatchListQuery, Query()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[ItemMatchRead]:
    try:
        return await service.list_item_matches(
            db,
            actor=current_user,
            item_id=item_id,
            query=query,
        )
    except service.MatchError as exc:
        raise _match_http_exception(exc) from exc


@router.get("/matches/{match_id}", response_model=ItemMatchRead)
async def get_match(
    match_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemMatchRead:
    try:
        return await service.get_match(
            db,
            actor=current_user,
            match_id=match_id,
        )
    except service.MatchError as exc:
        raise _match_http_exception(exc) from exc


@router.post("/matches/{match_id}/feedback", response_model=ItemMatchRead)
async def feedback_match(
    match_id: uuid.UUID,
    payload: MatchFeedback,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ItemMatchRead:
    try:
        return await service.feedback_match(
            db,
            actor=current_user,
            match_id=match_id,
            status=payload.status,
        )
    except service.MatchError as exc:
        raise _match_http_exception(exc) from exc
