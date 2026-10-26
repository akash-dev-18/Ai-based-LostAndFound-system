from __future__ import annotations

import hashlib
import logging
import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.auth.dependencies import get_current_user
from app.cache import get_cache_redis
from app.config import settings
from app.user.model import User

logger = logging.getLogger(__name__)

_RATE_LIMIT_SCRIPT = """
local current = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
end
return {current, ttl}
"""


def _identity(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:32]


def _client_ip(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown"


async def check_rate_limit(
    scope: str,
    identity: str,
    *,
    limit: int,
    window_seconds: int,
) -> int | None:
    if not settings.rate_limit_enabled:
        return None

    bucket = int(time.time()) // window_seconds
    key = f"lostfound:ratelimit:{scope}:{_identity(identity)}:{bucket}"
    try:
        current, ttl = await get_cache_redis().eval(
            _RATE_LIMIT_SCRIPT,
            1,
            key,
            window_seconds + 1,
        )
    except Exception:
        logger.warning("Rate limit check failed; allowing request", exc_info=True)
        return None

    if int(current) <= limit:
        return None
    return int(ttl) if int(ttl) > 0 else window_seconds


async def _enforce(
    scope: str,
    identity: str,
    *,
    limit: int,
    window_seconds: int,
) -> None:
    retry_after = await check_rate_limit(
        scope,
        identity,
        limit=limit,
        window_seconds=window_seconds,
    )
    if retry_after is None:
        return
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests",
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": str(retry_after),
        },
    )


async def login_rate_limit(request: Request) -> None:
    await _enforce(
        "auth:login",
        _client_ip(request),
        limit=settings.rate_limit_login_per_minute,
        window_seconds=60,
    )


async def register_rate_limit(request: Request) -> None:
    await _enforce(
        "auth:register",
        _client_ip(request),
        limit=settings.rate_limit_register_per_hour,
        window_seconds=3600,
    )


async def refresh_rate_limit(request: Request) -> None:
    await _enforce(
        "auth:refresh",
        _client_ip(request),
        limit=settings.rate_limit_refresh_per_minute,
        window_seconds=60,
    )


async def upload_rate_limit(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await _enforce(
        "items:upload",
        str(current_user.id),
        limit=settings.rate_limit_uploads_per_hour,
        window_seconds=3600,
    )


async def chat_rate_limit(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await _enforce(
        "chat:send",
        str(current_user.id),
        limit=settings.rate_limit_chat_per_minute,
        window_seconds=60,
    )


async def claim_rate_limit(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await _enforce(
        "claims:submit",
        str(current_user.id),
        limit=settings.rate_limit_claims_per_hour,
        window_seconds=3600,
    )


async def chatbot_rate_limit(
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    await _enforce(
        "chatbot:messages",
        str(current_user.id),
        limit=settings.rate_limit_chatbot_per_minute,
        window_seconds=60,
    )
