from __future__ import annotations

from datetime import UTC, datetime

import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import security
from app.auth.model import RefreshToken
from app.auth.schema import AuthResponse, TokenPair
from app.user.model import User
from app.user.schema import UserRead
from app.user.service import create_user, get_user_by_email, get_user_by_id


class AuthError(Exception):
    pass


class EmailAlreadyRegisteredError(AuthError):
    pass


class InvalidCredentialsError(AuthError):
    pass


class InactiveUserError(AuthError):
    pass


class InvalidRefreshTokenError(AuthError):
    pass


async def register_user(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password: str,
) -> AuthResponse:
    if await get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegisteredError

    try:
        user = await create_user(
            db,
            name=name,
            email=email,
            password_hash=security.hash_password(password),
        )
        tokens = await _issue_token_pair(db, user)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise EmailAlreadyRegisteredError from exc

    await db.refresh(user)
    return _build_auth_response(tokens, user)


async def login_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
) -> AuthResponse:
    user = await get_user_by_email(db, email)

    if user is None:
        security.verify_dummy_password(password)
        raise InvalidCredentialsError
    if user.password_hash is None:
        security.verify_dummy_password(password)
        raise InvalidCredentialsError
    if not security.verify_password(password, user.password_hash):
        raise InvalidCredentialsError
    if not user.is_active:
        raise InactiveUserError

    tokens = await _issue_token_pair(db, user)
    await db.commit()
    return _build_auth_response(tokens, user)


async def refresh_tokens(
    db: AsyncSession,
    *,
    refresh_token: str,
) -> AuthResponse:
    try:
        payload = security.decode_token(refresh_token, "refresh")
        user_id = security.get_subject(payload)
    except jwt.InvalidTokenError as exc:
        raise InvalidRefreshTokenError from exc

    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == security.hash_refresh_token(refresh_token))
        .with_for_update()
    )
    stored_token = result.scalar_one_or_none()
    now = datetime.now(UTC)

    if stored_token is None:
        raise InvalidRefreshTokenError
    if stored_token.revoked_at is not None:
        raise InvalidRefreshTokenError
    if stored_token.expires_at <= now:
        raise InvalidRefreshTokenError
    if stored_token.user_id != user_id:
        raise InvalidRefreshTokenError

    user = await get_user_by_id(db, stored_token.user_id)
    if user is None:
        raise InvalidRefreshTokenError
    if not user.is_active:
        raise InactiveUserError

    stored_token.revoked_at = now
    tokens = await _issue_token_pair(db, user)
    await db.commit()
    return _build_auth_response(tokens, user)


async def logout(db: AsyncSession, *, refresh_token: str) -> None:
    result = await db.execute(
        select(RefreshToken)
        .where(RefreshToken.token_hash == security.hash_refresh_token(refresh_token))
        .with_for_update()
    )
    stored_token = result.scalar_one_or_none()

    if stored_token is not None and stored_token.revoked_at is None:
        stored_token.revoked_at = datetime.now(UTC)

    await db.commit()


async def _issue_token_pair(db: AsyncSession, user: User) -> TokenPair:
    access_token = security.create_access_token(user.id)
    refresh_token, expires_at = security.create_refresh_token(user.id)

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=security.hash_refresh_token(refresh_token),
            expires_at=expires_at,
        )
    )
    await db.flush()

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
    )


def _build_auth_response(tokens: TokenPair, user: User) -> AuthResponse:
    return AuthResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        user=UserRead.model_validate(user),
    )
