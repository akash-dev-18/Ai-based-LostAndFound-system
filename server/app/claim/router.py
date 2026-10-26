from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user, require_roles
from app.claim import service
from app.claim.schema import (
    ClaimCreate,
    ClaimListQuery,
    ClaimRead,
    ClaimReject,
    ClaimReview,
    ManagerClaimListQuery,
)
from app.common.schema import Page
from app.db.session import get_db
from app.rate_limit import claim_rate_limit
from app.user.model import User, UserRole

router = APIRouter(tags=["Claims"])

StaffUser = Annotated[
    User,
    Depends(require_roles(UserRole.MANAGER, UserRole.ADMIN)),
]


def _claim_http_exception(exc: service.ClaimError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post(
    "/items/{item_id}/claims",
    response_model=ClaimRead,
    status_code=status.HTTP_201_CREATED,
)
async def submit_claim(
    item_id: uuid.UUID,
    payload: ClaimCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    _rate_limit: Annotated[None, Depends(claim_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClaimRead:
    try:
        return await service.submit_claim(
            db,
            actor=current_user,
            item_id=item_id,
            message=payload.message,
        )
    except service.ClaimError as exc:
        raise _claim_http_exception(exc) from exc


@router.get("/claims/mine", response_model=Page[ClaimRead])
async def list_my_claims(
    query: Annotated[ClaimListQuery, Query()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[ClaimRead]:
    return await service.list_my_claims(db, actor=current_user, query=query)


@router.get("/claims/{claim_id}", response_model=ClaimRead)
async def get_claim(
    claim_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClaimRead:
    try:
        return await service.get_claim(
            db,
            actor=current_user,
            claim_id=claim_id,
        )
    except service.ClaimError as exc:
        raise _claim_http_exception(exc) from exc


@router.get("/manager/claims", response_model=Page[ClaimRead])
async def list_manager_claims(
    query: Annotated[ManagerClaimListQuery, Query()],
    staff: StaffUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[ClaimRead]:
    return await service.list_manager_claims(db, actor=staff, query=query)


@router.post(
    "/manager/claims/{claim_id}/approve",
    response_model=ClaimRead,
)
async def approve_claim(
    claim_id: uuid.UUID,
    staff: StaffUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: ClaimReview | None = None,
) -> ClaimRead:
    try:
        return await service.approve_claim(
            db,
            actor=staff,
            claim_id=claim_id,
            resolution_notes=payload.resolution_notes if payload else None,
        )
    except service.ClaimError as exc:
        raise _claim_http_exception(exc) from exc


@router.post(
    "/manager/claims/{claim_id}/reject",
    response_model=ClaimRead,
)
async def reject_claim(
    claim_id: uuid.UUID,
    payload: ClaimReject,
    staff: StaffUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClaimRead:
    try:
        return await service.reject_claim(
            db,
            actor=staff,
            claim_id=claim_id,
            resolution_notes=payload.resolution_notes,
        )
    except service.ClaimError as exc:
        raise _claim_http_exception(exc) from exc


@router.post(
    "/manager/claims/{claim_id}/complete-handover",
    response_model=ClaimRead,
)
async def complete_handover(
    claim_id: uuid.UUID,
    staff: StaffUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: ClaimReview | None = None,
) -> ClaimRead:
    try:
        return await service.complete_handover(
            db,
            actor=staff,
            claim_id=claim_id,
            resolution_notes=payload.resolution_notes if payload else None,
        )
    except service.ClaimError as exc:
        raise _claim_http_exception(exc) from exc
