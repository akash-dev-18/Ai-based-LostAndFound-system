from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import get_current_user
from app.chat import service
from app.chat.schema import (
    ConversationCreate,
    ConversationListQuery,
    ConversationParticipantRead,
    ConversationRead,
    MessageCreate,
    MessageListQuery,
    MessagePage,
    MessageRead,
)
from app.common.schema import Page
from app.db.session import get_db
from app.rate_limit import chat_rate_limit
from app.user.model import User

router = APIRouter(prefix="/conversations", tags=["Chat"])


def _chat_http_exception(exc: service.ChatError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConversationRead:
    try:
        return await service.create_conversation(
            db,
            actor=current_user,
            payload=payload,
        )
    except service.ChatError as exc:
        raise _chat_http_exception(exc) from exc


@router.get("", response_model=Page[ConversationRead])
async def list_conversations(
    query: Annotated[ConversationListQuery, Query()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[ConversationRead]:
    return await service.list_conversations(
        db,
        actor=current_user,
        query=query,
    )


@router.get("/{conversation_id}", response_model=ConversationRead)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConversationRead:
    try:
        return await service.get_conversation(
            db,
            actor=current_user,
            conversation_id=conversation_id,
        )
    except service.ChatError as exc:
        raise _chat_http_exception(exc) from exc


@router.get("/{conversation_id}/messages", response_model=MessagePage)
async def list_messages(
    conversation_id: uuid.UUID,
    query: Annotated[MessageListQuery, Query()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessagePage:
    try:
        return await service.list_messages(
            db,
            actor=current_user,
            conversation_id=conversation_id,
            query=query,
        )
    except service.ChatError as exc:
        raise _chat_http_exception(exc) from exc


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: uuid.UUID,
    payload: MessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    _rate_limit: Annotated[None, Depends(chat_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageRead:
    try:
        return await service.send_message(
            db,
            actor=current_user,
            conversation_id=conversation_id,
            payload=payload,
        )
    except service.ChatError as exc:
        raise _chat_http_exception(exc) from exc


@router.post(
    "/{conversation_id}/read",
    response_model=ConversationParticipantRead,
)
async def mark_conversation_read(
    conversation_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ConversationParticipantRead:
    try:
        return await service.mark_conversation_read(
            db,
            actor=current_user,
            conversation_id=conversation_id,
        )
    except service.ChatError as exc:
        raise _chat_http_exception(exc) from exc
