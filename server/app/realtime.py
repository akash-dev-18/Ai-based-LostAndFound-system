from __future__ import annotations

import asyncio
import json
import logging
import uuid
from contextlib import suppress
from typing import Any

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from redis.asyncio import Redis

from app import rate_limit
from app.auth import security
from app.config import settings
from app.db.session import AsyncSessionLocal
from app.user.model import User

logger = logging.getLogger(__name__)

CHANNEL = "lostfound:realtime"
router = APIRouter(tags=["Realtime"])


class RealtimeHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._users: dict[uuid.UUID, set[WebSocket]] = {}
        self._conversations: dict[uuid.UUID, set[WebSocket]] = {}
        self._connection_users: dict[WebSocket, uuid.UUID] = {}
        self._connection_conversations: dict[WebSocket, set[uuid.UUID]] = {}

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID) -> None:
        async with self._lock:
            self._users.setdefault(user_id, set()).add(websocket)
            self._connection_users[websocket] = user_id
            self._connection_conversations.setdefault(websocket, set())

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            user_id = self._connection_users.pop(websocket, None)
            if user_id is not None:
                sockets = self._users.get(user_id)
                if sockets is not None:
                    sockets.discard(websocket)
                    if not sockets:
                        self._users.pop(user_id, None)

            conversation_ids = self._connection_conversations.pop(websocket, set())
            for conversation_id in conversation_ids:
                sockets = self._conversations.get(conversation_id)
                if sockets is not None:
                    sockets.discard(websocket)
                    if not sockets:
                        self._conversations.pop(conversation_id, None)

    async def subscribe(
        self,
        websocket: WebSocket,
        conversation_id: uuid.UUID,
    ) -> None:
        async with self._lock:
            self._conversations.setdefault(conversation_id, set()).add(websocket)
            self._connection_conversations.setdefault(websocket, set()).add(
                conversation_id
            )

    async def unsubscribe(
        self,
        websocket: WebSocket,
        conversation_id: uuid.UUID,
    ) -> None:
        async with self._lock:
            sockets = self._conversations.get(conversation_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    self._conversations.pop(conversation_id, None)
            self._connection_conversations.get(websocket, set()).discard(
                conversation_id
            )

    async def send_to_user(self, user_id: uuid.UUID, payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self._users.get(user_id, set()))
        await self._send_many(targets, payload)

    async def broadcast_conversation(
        self,
        conversation_id: uuid.UUID,
        payload: dict[str, Any],
        *,
        exclude_user_id: uuid.UUID | None = None,
    ) -> None:
        async with self._lock:
            targets = [
                websocket
                for websocket in self._conversations.get(conversation_id, set())
                if exclude_user_id is None
                or self._connection_users.get(websocket) != exclude_user_id
            ]
        await self._send_many(targets, payload)

    async def _send_many(
        self,
        targets: list[WebSocket],
        payload: dict[str, Any],
    ) -> None:
        for websocket in targets:
            try:
                await websocket.send_json(payload)
            except Exception:
                logger.exception("Failed to send realtime payload")
                await self.disconnect(websocket)


hub = RealtimeHub()
_listener_task: asyncio.Task[None] | None = None


async def start_realtime() -> None:
    global _listener_task
    if _listener_task is None or _listener_task.done():
        _listener_task = asyncio.create_task(_listen_loop())


async def stop_realtime() -> None:
    global _listener_task
    task = _listener_task
    _listener_task = None
    if task is not None:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


async def _listen_loop() -> None:
    while True:
        client: Redis | None = None
        pubsub = None
        try:
            client = Redis.from_url(settings.redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(CHANNEL)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    event = json.loads(message["data"])
                except (KeyError, TypeError, json.JSONDecodeError):
                    continue
                try:
                    await _dispatch_local(event)
                except Exception:
                    logger.exception(
                        "Failed to dispatch realtime event %s",
                        event.get("type"),
                    )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Realtime listener disconnected; retrying")
            await asyncio.sleep(1)
        finally:
            if pubsub is not None:
                with suppress(Exception):
                    await pubsub.aclose()
            if client is not None:
                with suppress(Exception):
                    await client.aclose()


async def _publish_event(event: dict[str, Any]) -> int:
    client: Redis | None = None
    try:
        client = Redis.from_url(settings.redis_url, decode_responses=True)
        return int(
            await client.publish(
                CHANNEL,
                json.dumps(event, separators=(",", ":")),
            )
        )
    finally:
        if client is not None:
            with suppress(Exception):
                await client.aclose()


async def _publish_or_local(event: dict[str, Any]) -> None:
    delivered = 0
    try:
        delivered = await _publish_event(event)
    except Exception:
        logger.exception("Realtime publish failed for %s", event.get("type"))

    if delivered == 0 and _listener_task is not None:
        await _dispatch_local(event)


async def _dispatch_local(event: dict[str, Any]) -> None:
    event_type = event.get("type") or event.get("kind")
    if event_type == "chat.message":
        conversation_id = uuid.UUID(event["conversation_id"])
        exclude_user_id = (
            uuid.UUID(event["sender_id"]) if event.get("sender_id") else None
        )
        await hub.broadcast_conversation(
            conversation_id,
            event,
            exclude_user_id=exclude_user_id,
        )
    elif event_type == "notification.created":
        await hub.send_to_user(
            uuid.UUID(event["user_id"]),
            event,
        )


async def publish_chat_message(
    *,
    conversation_id: uuid.UUID,
    sender_id: uuid.UUID,
    message: dict[str, Any],
) -> None:
    await _publish_or_local(
        {
            "type": "chat.message",
            "conversation_id": str(conversation_id),
            "sender_id": str(sender_id),
            "message": message,
        }
    )


async def publish_notification(
    *,
    user_id: uuid.UUID,
    notification: dict[str, Any],
) -> None:
    await _publish_or_local(
        {
            "type": "notification.created",
            "user_id": str(user_id),
            "notification": notification,
        }
    )


def _header_token(websocket: WebSocket) -> str | None:
    authorization = websocket.headers.get("authorization")
    if authorization is None:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


async def _load_user(token: str) -> User | None:
    try:
        payload = security.decode_token(token, "access")
        user_id = security.get_subject(payload)
    except jwt.InvalidTokenError:
        return None

    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
    if user is None or not user.is_active:
        return None
    return user


async def _authenticate_websocket(websocket: WebSocket) -> User | None:
    token = _header_token(websocket)
    if token is not None:
        return await _load_user(token)

    try:
        message = await asyncio.wait_for(websocket.receive_json(), timeout=15)
    except (TimeoutError, WebSocketDisconnect, json.JSONDecodeError):
        return None

    if not isinstance(message, dict) or message.get("type") != "auth":
        return None
    token = message.get("token")
    if not isinstance(token, str) or not token:
        return None
    return await _load_user(token)


def _parse_uuid(value: Any) -> uuid.UUID | None:
    if not isinstance(value, str):
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


async def _handle_subscribe(
    websocket: WebSocket,
    user: User,
    payload: dict[str, Any],
) -> None:
    from app.chat import service as chat_service

    conversation_id = _parse_uuid(payload.get("conversation_id"))
    if conversation_id is None:
        await websocket.send_json(
            {"type": "error", "detail": "Invalid conversation_id"}
        )
        return

    async with AsyncSessionLocal() as db:
        try:
            await chat_service.ensure_participant(
                db,
                conversation_id=conversation_id,
                user_id=user.id,
            )
        except chat_service.ChatError as exc:
            await websocket.send_json(
                {"type": "error", "detail": str(exc), "code": exc.status_code}
            )
            return

    await hub.subscribe(websocket, conversation_id)
    await websocket.send_json(
        {"type": "subscribed", "conversation_id": str(conversation_id)}
    )


async def _handle_send_message(
    websocket: WebSocket,
    user: User,
    payload: dict[str, Any],
) -> None:
    from app.chat import service as chat_service
    from app.chat.schema import MessageCreate

    conversation_id = _parse_uuid(payload.get("conversation_id"))
    if conversation_id is None:
        await websocket.send_json(
            {"type": "error", "detail": "Invalid conversation_id"}
        )
        return

    retry_after = await rate_limit.check_rate_limit(
        "chat:send",
        str(user.id),
        limit=settings.rate_limit_chat_per_minute,
        window_seconds=60,
    )
    if retry_after is not None:
        await websocket.send_json(
            {
                "type": "error",
                "detail": "Too many requests",
                "code": 429,
                "retry_after": retry_after,
            }
        )
        return

    try:
        message_payload = MessageCreate(
            content=payload.get("content", ""),
            client_message_id=payload.get("client_message_id"),
        )
    except ValidationError as exc:
        await websocket.send_json(
            {
                "type": "error",
                "detail": "Invalid message payload",
                "errors": exc.errors(
                    include_url=False,
                    include_context=False,
                    include_input=False,
                ),
            }
        )
        return

    async with AsyncSessionLocal() as db:
        actor = await db.get(User, user.id)
        if actor is None:
            await websocket.send_json({"type": "error", "detail": "Unauthorized"})
            return
        try:
            message = await chat_service.send_message(
                db,
                actor=actor,
                conversation_id=conversation_id,
                payload=message_payload,
            )
        except chat_service.ChatError as exc:
            await websocket.send_json(
                {"type": "error", "detail": str(exc), "code": exc.status_code}
            )
            return

    await websocket.send_json(
        {"type": "message.saved", "message": message.model_dump(mode="json")}
    )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    user = await _authenticate_websocket(websocket)
    if user is None:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await hub.connect(websocket, user.id)
    await websocket.send_json({"type": "auth.ok", "user_id": str(user.id)})

    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except WebSocketDisconnect:
                break
            except json.JSONDecodeError:
                await websocket.send_json(
                    {"type": "error", "detail": "Invalid JSON payload"}
                )
                continue

            if not isinstance(payload, dict):
                await websocket.send_json(
                    {"type": "error", "detail": "Payload must be an object"}
                )
                continue

            message_type = payload.get("type")
            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif message_type == "subscribe":
                await _handle_subscribe(websocket, user, payload)
            elif message_type == "unsubscribe":
                conversation_id = _parse_uuid(payload.get("conversation_id"))
                if conversation_id is None:
                    await websocket.send_json(
                        {"type": "error", "detail": "Invalid conversation_id"}
                    )
                    continue
                await hub.unsubscribe(websocket, conversation_id)
                await websocket.send_json(
                    {"type": "unsubscribed", "conversation_id": str(conversation_id)}
                )
            elif message_type == "message.send":
                await _handle_send_message(websocket, user, payload)
            else:
                await websocket.send_json(
                    {"type": "error", "detail": "Unsupported message type"}
                )
    finally:
        await hub.disconnect(websocket)
