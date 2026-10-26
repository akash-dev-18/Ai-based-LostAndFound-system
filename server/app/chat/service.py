from __future__ import annotations

import uuid
from datetime import UTC, datetime
from math import ceil

from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import realtime
from app.ai.matching.model import ItemMatch
from app.chat.model import (
    Conversation,
    ConversationParticipant,
    ConversationType,
    Message,
)
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
from app.claim.model import Claim
from app.common.schema import Page
from app.item.model import Item
from app.notification import service as notification_service
from app.notification.model import NotificationType
from app.user.model import User, UserRole


class ChatError(Exception):
    status_code = 400

    def __init__(self, message: str = "Chat operation failed") -> None:
        super().__init__(message)


class ConversationNotFoundError(ChatError):
    status_code = 404


class ConversationPermissionError(ChatError):
    status_code = 403


class ConversationStateError(ChatError):
    status_code = 409


class ConversationConflictError(ChatError):
    status_code = 409


class MessageNotFoundError(ChatError):
    status_code = 404


def _is_staff(user: User) -> bool:
    return user.role in {UserRole.MANAGER, UserRole.ADMIN}


async def _load_users(
    db: AsyncSession,
    user_ids: set[uuid.UUID],
) -> dict[uuid.UUID, User]:
    if not user_ids:
        return {}
    users = (await db.scalars(select(User).where(User.id.in_(user_ids)))).all()
    return {user.id: user for user in users}


async def _get_conversation_for_user(
    db: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    lock: bool = False,
) -> Conversation:
    statement = (
        select(Conversation)
        .options(
            selectinload(Conversation.participants).selectinload(
                ConversationParticipant.user
            )
        )
        .where(Conversation.id == conversation_id)
    )
    if lock:
        statement = statement.with_for_update()
    conversation = await db.scalar(statement)
    if conversation is None:
        raise ConversationNotFoundError("Conversation not found")
    if all(participant.user_id != user_id for participant in conversation.participants):
        raise ConversationPermissionError(
            "You are not a participant in this conversation"
        )
    return conversation


async def ensure_participant(
    db: AsyncSession,
    *,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
) -> ConversationParticipant:
    conversation = await _get_conversation_for_user(
        db,
        conversation_id=conversation_id,
        user_id=user_id,
    )
    return next(
        participant
        for participant in conversation.participants
        if participant.user_id == user_id
    )


async def _relation_participants(
    db: AsyncSession,
    *,
    actor: User,
    payload: ConversationCreate,
    requested: set[uuid.UUID],
) -> tuple[set[uuid.UUID], set[uuid.UUID]]:
    related: set[uuid.UUID] = set()

    if payload.claim_id is not None:
        claim = await db.get(Claim, payload.claim_id)
        if claim is None:
            raise ConversationNotFoundError("Claim not found")
        item = await db.get(Item, claim.item_id)
        if item is None:
            raise ConversationNotFoundError("Claim item not found")
        related = {claim.claimant_id, item.reporter_id}
        if actor.id not in related and not _is_staff(actor):
            raise ConversationPermissionError("You are not authorized for this claim")
    elif payload.match_id is not None:
        match = await db.get(ItemMatch, payload.match_id)
        if match is None:
            raise ConversationNotFoundError("Match not found")
        lost_item = await db.get(Item, match.lost_item_id)
        found_item = await db.get(Item, match.found_item_id)
        if lost_item is None or found_item is None:
            raise ConversationNotFoundError("Match item not found")
        related = {lost_item.reporter_id, found_item.reporter_id}
        if actor.id not in related and not _is_staff(actor):
            raise ConversationPermissionError("You are not authorized for this match")
    else:
        if payload.type != ConversationType.SUPPORT:
            raise ConversationStateError(
                "Direct conversations must relate to a claim or match"
            )

    if not requested:
        if related:
            requested = related - {actor.id}
        if payload.type == ConversationType.DIRECT and len(requested) != 1:
            raise ConversationStateError(
                "Direct conversations require exactly one other participant"
            )

    return related, requested


async def _find_existing_conversation(
    db: AsyncSession,
    *,
    payload: ConversationCreate,
    participant_ids: set[uuid.UUID],
) -> Conversation | None:
    statement = select(Conversation).options(
        selectinload(Conversation.participants).selectinload(
            ConversationParticipant.user
        )
    )
    if payload.claim_id is not None:
        statement = statement.where(Conversation.claim_id == payload.claim_id)
    elif payload.match_id is not None:
        statement = statement.where(Conversation.match_id == payload.match_id)
    else:
        statement = statement.where(
            Conversation.type == payload.type,
            Conversation.claim_id.is_(None),
            Conversation.match_id.is_(None),
        )

    candidates = (await db.scalars(statement)).all()
    for candidate in candidates:
        existing_ids = {participant.user_id for participant in candidate.participants}
        if candidate.type == payload.type and existing_ids == participant_ids:
            return candidate
    return None


def _conversation_to_read(
    conversation: Conversation,
    *,
    unread_count: int = 0,
) -> ConversationRead:
    return ConversationRead(
        id=conversation.id,
        type=conversation.type,
        claim_id=conversation.claim_id,
        match_id=conversation.match_id,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        participants=[
            ConversationParticipantRead(
                conversation_id=participant.conversation_id,
                user_id=participant.user_id,
                name=participant.user.name,
                joined_at=participant.joined_at,
                last_read_at=participant.last_read_at,
            )
            for participant in conversation.participants
        ],
        unread_count=unread_count,
    )


async def _unread_counts(
    db: AsyncSession,
    *,
    conversations: list[Conversation],
    user_id: uuid.UUID,
) -> dict[uuid.UUID, int]:
    conditions = []
    for conversation in conversations:
        participant = next(
            (
                participant
                for participant in conversation.participants
                if participant.user_id == user_id
            ),
            None,
        )
        cutoff = (
            participant.last_read_at
            if participant is not None and participant.last_read_at is not None
            else conversation.created_at
        )
        conditions.append(
            and_(
                Message.conversation_id == conversation.id,
                Message.created_at > cutoff,
            )
        )

    if not conditions:
        return {}

    rows = await db.execute(
        select(Message.conversation_id, func.count())
        .where(
            Message.deleted_at.is_(None),
            Message.sender_id != user_id,
            or_(*conditions),
        )
        .group_by(Message.conversation_id)
    )
    return {conversation_id: int(count) for conversation_id, count in rows}


async def create_conversation(
    db: AsyncSession,
    *,
    actor: User,
    payload: ConversationCreate,
) -> ConversationRead:
    requested = {
        participant_id
        for participant_id in payload.participant_ids
        if participant_id != actor.id
    }

    related, requested = await _relation_participants(
        db,
        actor=actor,
        payload=payload,
        requested=requested,
    )

    users = await _load_users(db, requested)
    if len(users) != len(requested):
        raise ConversationNotFoundError("One or more participants were not found")
    if any(not user.is_active for user in users.values()):
        raise ConversationStateError("One or more participants are inactive")

    if payload.type == ConversationType.DIRECT:
        if len(requested) != 1:
            raise ConversationStateError(
                "Direct conversations require exactly one other participant"
            )
        other = users[next(iter(requested))]
        if related and other.id not in related and not _is_staff(other):
            raise ConversationStateError(
                "Participant is not part of this claim or match"
            )
        if not related and not _is_staff(actor):
            raise ConversationStateError(
                "Direct conversations must relate to a claim or match"
            )
    else:
        if not requested:
            raise ConversationStateError(
                "Support conversations require at least one other participant"
            )
        participants_are_staff = _is_staff(actor) or any(
            _is_staff(user) for user in users.values()
        )
        if not participants_are_staff:
            raise ConversationStateError(
                "Support conversations require a manager or administrator"
            )

    participant_ids = {actor.id, *requested}
    existing = await _find_existing_conversation(
        db,
        payload=payload,
        participant_ids=participant_ids,
    )
    if existing is not None:
        unread = await _unread_counts(
            db,
            conversations=[existing],
            user_id=actor.id,
        )
        return _conversation_to_read(
            existing,
            unread_count=unread.get(existing.id, 0),
        )

    conversation = Conversation(
        type=payload.type,
        claim_id=payload.claim_id,
        match_id=payload.match_id,
    )
    for participant_id in participant_ids:
        conversation.participants.append(
            ConversationParticipant(user_id=participant_id)
        )

    db.add(conversation)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise ConversationConflictError(
            "Conversation already exists or is invalid"
        ) from exc

    created = await _get_conversation_for_user(
        db,
        conversation_id=conversation.id,
        user_id=actor.id,
    )
    return _conversation_to_read(created)


async def list_conversations(
    db: AsyncSession,
    *,
    actor: User,
    query: ConversationListQuery,
) -> Page[ConversationRead]:
    base = (
        select(Conversation)
        .join(ConversationParticipant)
        .where(ConversationParticipant.user_id == actor.id)
    )
    total = await db.scalar(
        select(func.count())
        .select_from(Conversation)
        .join(ConversationParticipant)
        .where(ConversationParticipant.user_id == actor.id)
    )
    result = await db.execute(
        base.options(
            selectinload(Conversation.participants).selectinload(
                ConversationParticipant.user
            )
        )
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )
    conversations = list(result.scalars().all())
    unread = await _unread_counts(
        db,
        conversations=conversations,
        user_id=actor.id,
    )

    return Page(
        items=[
            _conversation_to_read(
                conversation,
                unread_count=unread.get(conversation.id, 0),
            )
            for conversation in conversations
        ],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )


async def get_conversation(
    db: AsyncSession,
    *,
    actor: User,
    conversation_id: uuid.UUID,
) -> ConversationRead:
    conversation = await _get_conversation_for_user(
        db,
        conversation_id=conversation_id,
        user_id=actor.id,
    )
    unread = await _unread_counts(
        db,
        conversations=[conversation],
        user_id=actor.id,
    )
    return _conversation_to_read(
        conversation,
        unread_count=unread.get(conversation.id, 0),
    )


async def list_messages(
    db: AsyncSession,
    *,
    actor: User,
    conversation_id: uuid.UUID,
    query: MessageListQuery,
) -> MessagePage:
    await ensure_participant(
        db,
        conversation_id=conversation_id,
        user_id=actor.id,
    )

    conditions = [
        Message.conversation_id == conversation_id,
        Message.deleted_at.is_(None),
    ]
    cursor_id = query.before_id or query.after_id
    cursor = None
    if cursor_id is not None:
        cursor = await db.scalar(
            select(Message).where(
                Message.id == cursor_id,
                Message.conversation_id == conversation_id,
            )
        )
        if cursor is None:
            raise MessageNotFoundError("Message cursor not found")

    if query.before_id is not None and cursor is not None:
        conditions.append(
            or_(
                Message.created_at < cursor.created_at,
                and_(
                    Message.created_at == cursor.created_at,
                    Message.id < cursor.id,
                ),
            )
        )
    elif query.after_id is not None and cursor is not None:
        conditions.append(
            or_(
                Message.created_at > cursor.created_at,
                and_(
                    Message.created_at == cursor.created_at,
                    Message.id > cursor.id,
                ),
            )
        )

    if query.after_id is not None:
        order_by = (Message.created_at.asc(), Message.id.asc())
    else:
        order_by = (Message.created_at.desc(), Message.id.desc())

    result = await db.execute(
        select(Message).where(*conditions).order_by(*order_by).limit(query.limit + 1)
    )
    rows = list(result.scalars().all())
    has_more = len(rows) > query.limit
    rows = rows[: query.limit]

    if query.after_id is None:
        rows.reverse()
        next_cursor = rows[0].id if rows and has_more else None
    else:
        next_cursor = rows[-1].id if rows and has_more else None

    return MessagePage(
        items=[MessageRead.model_validate(message) for message in rows],
        has_more=has_more,
        next_cursor=next_cursor,
    )


async def mark_conversation_read(
    db: AsyncSession,
    *,
    actor: User,
    conversation_id: uuid.UUID,
) -> ConversationParticipantRead:
    participant = await ensure_participant(
        db,
        conversation_id=conversation_id,
        user_id=actor.id,
    )
    participant.last_read_at = datetime.now(UTC)
    name = participant.user.name
    await db.commit()
    return ConversationParticipantRead(
        conversation_id=participant.conversation_id,
        user_id=participant.user_id,
        name=name,
        joined_at=participant.joined_at,
        last_read_at=participant.last_read_at,
    )


async def send_message(
    db: AsyncSession,
    *,
    actor: User,
    conversation_id: uuid.UUID,
    payload: MessageCreate,
) -> MessageRead:
    conversation = await _get_conversation_for_user(
        db,
        conversation_id=conversation_id,
        user_id=actor.id,
        lock=True,
    )
    participant = next(
        participant
        for participant in conversation.participants
        if participant.user_id == actor.id
    )

    if payload.client_message_id is not None:
        existing = await db.scalar(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.client_message_id == payload.client_message_id,
            )
        )
        if existing is not None:
            if existing.sender_id != actor.id:
                raise ConversationConflictError("client_message_id is already in use")
            return MessageRead.model_validate(existing)

    now = datetime.now(UTC)
    conversation.updated_at = now
    participant.last_read_at = now
    message = Message(
        conversation_id=conversation_id,
        sender_id=actor.id,
        client_message_id=payload.client_message_id,
        content=payload.content,
    )
    db.add(message)
    await db.flush()

    notifications = []
    for recipient_id in {
        participant.user_id for participant in conversation.participants
    } - {actor.id}:
        notification = await notification_service.create_notification(
            db,
            user_id=recipient_id,
            notification_type=NotificationType.NEW_MESSAGE,
            title="New message",
            body="You have a new message in a conversation.",
            data={
                "conversation_id": str(conversation_id),
                "message_id": str(message.id),
                "sender_id": str(actor.id),
            },
            dedupe_key=f"new_message:{message.id}:{recipient_id}",
        )
        if notification is not None:
            notifications.append(notification)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if payload.client_message_id is None:
            raise ConversationConflictError("Message could not be saved") from exc
        existing = await db.scalar(
            select(Message).where(
                Message.conversation_id == conversation_id,
                Message.client_message_id == payload.client_message_id,
            )
        )
        if existing is None:
            raise ConversationConflictError("Message could not be saved") from exc
        if existing.sender_id != actor.id:
            raise ConversationConflictError(
                "client_message_id is already in use"
            ) from exc
        return MessageRead.model_validate(existing)

    await db.refresh(message)
    message_read = MessageRead.model_validate(message)
    await realtime.publish_chat_message(
        conversation_id=conversation_id,
        sender_id=actor.id,
        message=message_read.model_dump(mode="json"),
    )
    await notification_service.publish_notifications(notifications)
    return message_read
