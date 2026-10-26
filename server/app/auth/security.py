from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.config import settings

TokenType = Literal["access", "refresh"]

password_hasher = PasswordHash.recommended()
_dummy_password_hash = password_hasher.hash("not-a-real-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return password_hasher.verify(password, password_hash)
    except UnknownHashError:
        return False


def verify_dummy_password(password: str) -> None:
    try:
        password_hasher.verify(password, _dummy_password_hash)
    except UnknownHashError:
        pass


def _create_token(
    subject: uuid.UUID,
    token_type: TokenType,
    expires_delta: timedelta,
) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + expires_delta
    payload = {
        "sub": str(subject),
        "type": token_type,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(
        payload,
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    return token, expires_at


def create_access_token(user_id: uuid.UUID) -> str:
    token, _ = _create_token(
        user_id,
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )
    return token


def create_refresh_token(user_id: uuid.UUID) -> tuple[str, datetime]:
    return _create_token(
        user_id,
        "refresh",
        timedelta(days=settings.refresh_token_expire_days),
    )


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.InvalidTokenError as exc:
        raise jwt.InvalidTokenError("Invalid or expired token") from exc

    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Invalid token type")
    if not payload.get("sub") or not payload.get("jti"):
        raise jwt.InvalidTokenError("Invalid token payload")
    return payload


def get_subject(payload: dict[str, Any]) -> uuid.UUID:
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise jwt.InvalidTokenError("Invalid token subject")
    try:
        return uuid.UUID(subject)
    except ValueError as exc:
        raise jwt.InvalidTokenError("Invalid token subject") from exc


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
