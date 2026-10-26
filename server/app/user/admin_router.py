from __future__ import annotations

import uuid
from math import ceil
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import require_roles
from app.common.schema import Page
from app.db.session import get_db
from app.user import service
from app.user.model import User, UserRole
from app.user.schema import (
    UserListQuery,
    UserRead,
    UserRoleUpdate,
    UserStatusUpdate,
)

router = APIRouter(prefix="/admin/users", tags=["Admin Users"])

AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


@router.get("", response_model=Page[UserRead])
async def list_users(
    query: Annotated[UserListQuery, Query()],
    _: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[UserRead]:
    users, total = await service.list_users(db, query)
    return Page(
        items=[UserRead.model_validate(user) for user in users],
        total=total,
        page=query.page,
        page_size=query.page_size,
        pages=ceil(total / query.page_size) if total else 0,
    )


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: uuid.UUID,
    _: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        return await service.get_user(db, user_id)
    except service.UserError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc


@router.patch("/{user_id}/status", response_model=UserRead)
async def update_user_status(
    user_id: uuid.UUID,
    payload: UserStatusUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        target = await service.get_user(db, user_id)
        return await service.set_user_status(
            db,
            actor=admin,
            target=target,
            is_active=payload.is_active,
        )
    except service.UserError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc


@router.patch("/{user_id}/role", response_model=UserRead)
async def update_user_role(
    user_id: uuid.UUID,
    payload: UserRoleUpdate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    try:
        target = await service.get_user(db, user_id)
        return await service.set_user_role(
            db,
            actor=admin,
            target=target,
            role=payload.role,
        )
    except service.UserError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from exc
