from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.dependencies import get_current_user
from app.auth.schema import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
)
from app.config import settings
from app.db.session import get_db
from app.rate_limit import login_rate_limit, refresh_rate_limit, register_rate_limit
from app.user.model import User
from app.user.schema import UserRead

router = APIRouter(prefix="/auth", tags=["Auth"])


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.secure_refresh_cookie,
        samesite=settings.refresh_cookie_samesite,
        path=settings.refresh_cookie_path,
    )
    response.headers["Cache-Control"] = "no-store"


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        secure=settings.secure_refresh_cookie,
        httponly=True,
        samesite=settings.refresh_cookie_samesite,
    )
    response.headers["Cache-Control"] = "no-store"


def _clear_refresh_cookie_header() -> str:
    parts = [
        f"{settings.refresh_cookie_name}=",
        f"Path={settings.refresh_cookie_path}",
        "Max-Age=0",
        "HttpOnly",
        f"SameSite={settings.refresh_cookie_samesite.capitalize()}",
    ]
    if settings.secure_refresh_cookie:
        parts.append("Secure")
    return "; ".join(parts)


def _refresh_token_from_request(
    request: Request,
    payload: RefreshRequest | None,
) -> str | None:
    if payload is not None:
        return payload.refresh_token
    return request.cookies.get(settings.refresh_cookie_name)


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    payload: RegisterRequest,
    response: Response,
    _rate_limit: Annotated[None, Depends(register_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    try:
        auth = await service.register_user(
            db,
            name=payload.name,
            email=payload.email,
            password=payload.password,
        )
    except service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        ) from exc
    _set_refresh_cookie(response, auth.refresh_token)
    return auth


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    _rate_limit: Annotated[None, Depends(login_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AuthResponse:
    try:
        auth = await service.login_user(
            db,
            email=payload.email,
            password=payload.password,
        )
    except service.InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except service.InactiveUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
        ) from exc
    _set_refresh_cookie(response, auth.refresh_token)
    return auth


@router.post("/refresh", response_model=AuthResponse)
async def refresh(
    request: Request,
    response: Response,
    _rate_limit: Annotated[None, Depends(refresh_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: RefreshRequest | None = None,
) -> AuthResponse:
    refresh_token = _refresh_token_from_request(request, payload)
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is required",
            headers={"Set-Cookie": _clear_refresh_cookie_header()},
        )
    try:
        auth = await service.refresh_tokens(
            db,
            refresh_token=refresh_token,
        )
    except service.InvalidRefreshTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"Set-Cookie": _clear_refresh_cookie_header()},
        ) from exc
    except service.InactiveUserError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled",
            headers={"Set-Cookie": _clear_refresh_cookie_header()},
        ) from exc
    _set_refresh_cookie(response, auth.refresh_token)
    return auth


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
    payload: RefreshRequest | None = None,
) -> None:
    refresh_token = _refresh_token_from_request(request, payload)
    if refresh_token is not None:
        await service.logout(db, refresh_token=refresh_token)
    _clear_refresh_cookie(response)


@router.get("/me", response_model=UserRead)
async def me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user
