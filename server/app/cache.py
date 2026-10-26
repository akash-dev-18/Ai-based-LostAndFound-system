from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

_client: Redis | None = None
_VERSION_PREFIX = "lostfound:cache:version:"
_KEY_PREFIX = "lostfound:cache:"


def get_cache_redis() -> Redis:
    global _client
    if _client is None:
        _client = Redis.from_url(
            settings.resolved_cache_redis_url(),
            decode_responses=True,
        )
    return _client


async def close_cache() -> None:
    global _client
    client = _client
    _client = None
    if client is not None:
        await client.aclose()


def make_key(namespace: str, version: str, payload: dict[str, Any]) -> str:
    serialized = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(serialized.encode()).hexdigest()
    return f"{_KEY_PREFIX}{namespace}:{version}:{digest}"


async def get_json(key: str) -> Any | None:
    if not settings.cache_enabled:
        return None
    try:
        value = await get_cache_redis().get(key)
    except Exception:
        logger.warning("Cache read failed", exc_info=True)
        return None
    if value is None:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        logger.warning("Cache value is not valid JSON")
        return None


async def set_json(key: str, value: Any, ttl_seconds: int) -> None:
    if not settings.cache_enabled:
        return
    try:
        await get_cache_redis().set(
            key,
            json.dumps(value, separators=(",", ":"), default=str),
            ex=ttl_seconds,
        )
    except Exception:
        logger.warning("Cache write failed", exc_info=True)


async def delete(key: str) -> None:
    if not settings.cache_enabled:
        return
    try:
        await get_cache_redis().delete(key)
    except Exception:
        logger.warning("Cache delete failed", exc_info=True)


async def get_version(namespace: str) -> str:
    if not settings.cache_enabled:
        return "0"
    try:
        value = await get_cache_redis().get(f"{_VERSION_PREFIX}{namespace}")
    except Exception:
        logger.warning("Cache version read failed", exc_info=True)
        return "0"
    return value or "0"


async def bump_version(namespace: str) -> None:
    if not settings.cache_enabled:
        return
    try:
        await get_cache_redis().incr(f"{_VERSION_PREFIX}{namespace}")
    except Exception:
        logger.warning("Cache version bump failed", exc_info=True)
