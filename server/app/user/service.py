from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import service as audit_service
from app.auth.model import RefreshToken
from app.auth.security import hash_password, verify_password
from app.user.model import User, UserRole
from app.user.schema import UserListQuery


class UserError(Exception):
    status_code = 400

    def __init__(self, message: str = "User operation failed") -> None:
        super().__init__(message)


class EmailAlreadyInUseError(UserError):
    status_code = 409


class InvalidCurrentPasswordError(UserError):
    status_code = 400


class SamePasswordError(UserError):
    status_code = 400


class CannotModifySelfError(UserError):
    status_code = 400


class LastAdminError(UserError):
    status_code = 409


class UserNotFoundError(UserError):
    status_code = 404


def normalize_email(email: str) -> str:
    return email.strip().lower()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == normalize_email(email)))
    return result.scalar_one_or_none()


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await get_user_by_id(db, user_id)
    if user is None:
        raise UserNotFoundError("User not found")
    return user


async def create_user(
    db: AsyncSession,
    *,
    name: str,
    email: str,
    password_hash: str,
    role: UserRole = UserRole.USER,
) -> User:
    user = User(
        name=name,
        email=normalize_email(email),
        password_hash=password_hash,
        role=role,
    )
    db.add(user)
    await db.flush()
    return user


async def update_profile(
    db: AsyncSession,
    user: User,
    *,
    name: str | None = None,
    email: str | None = None,
) -> User:
    if name is not None:
        user.name = name

    if email is not None:
        normalized_email = normalize_email(email)
        if normalized_email != user.email:
            existing = await get_user_by_email(db, normalized_email)
            if existing is not None and existing.id != user.id:
                raise EmailAlreadyInUseError("Email is already in use")
            user.email = normalized_email

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise EmailAlreadyInUseError("Email is already in use") from exc

    await db.refresh(user)
    return user


async def change_password(
    db: AsyncSession,
    user: User,
    *,
    current_password: str,
    new_password: str,
) -> None:
    if user.password_hash is None or not verify_password(
        current_password, user.password_hash
    ):
        raise InvalidCurrentPasswordError("Current password is incorrect")
    if verify_password(new_password, user.password_hash):
        raise SamePasswordError(
            "New password must be different from the current password"
        )

    user.password_hash = hash_password(new_password)
    await _revoke_refresh_tokens(db, user.id)
    await db.commit()


async def list_users(
    db: AsyncSession,
    query: UserListQuery,
) -> tuple[list[User], int]:
    conditions = []

    if query.q and query.q.strip():
        term = f"%{query.q.strip()}%"
        conditions.append(or_(User.name.ilike(term), User.email.ilike(term)))
    if query.role is not None:
        conditions.append(User.role == query.role)
    if query.is_active is not None:
        conditions.append(User.is_active.is_(query.is_active))

    total = await db.scalar(select(func.count()).select_from(User).where(*conditions))
    result = await db.execute(
        select(User)
        .where(*conditions)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset((query.page - 1) * query.page_size)
        .limit(query.page_size)
    )
    return list(result.scalars().all()), total or 0


async def set_user_status(
    db: AsyncSession,
    *,
    actor: User,
    target: User,
    is_active: bool,
) -> User:
    if target.id == actor.id:
        raise CannotModifySelfError("You cannot change your own account status")

    if target.role == UserRole.ADMIN and target.is_active and not is_active:
        await _ensure_active_admin_remains(db, target)

    previous_is_active = target.is_active
    target.is_active = is_active
    if not is_active:
        await _revoke_refresh_tokens(db, target.id)
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="USER_STATUS_CHANGED",
        entity_type="USER",
        entity_id=target.id,
        metadata={
            "previous_is_active": previous_is_active,
            "is_active": is_active,
        },
    )

    await db.commit()
    await db.refresh(target)
    return target


async def set_user_role(
    db: AsyncSession,
    *,
    actor: User,
    target: User,
    role: UserRole,
) -> User:
    if target.id == actor.id:
        raise CannotModifySelfError("You cannot change your own role")

    if target.role == UserRole.ADMIN and role != UserRole.ADMIN:
        await _ensure_active_admin_remains(db, target)

    previous_role = target.role
    target.role = role
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="USER_ROLE_CHANGED",
        entity_type="USER",
        entity_id=target.id,
        metadata={
            "previous_role": previous_role.value,
            "role": role.value,
        },
    )
    await db.commit()
    await db.refresh(target)
    return target


async def _ensure_active_admin_remains(db: AsyncSession, target: User) -> None:
    if not target.is_active or target.role != UserRole.ADMIN:
        return

    active_admins = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
    )
    if (active_admins or 0) <= 1:
        raise LastAdminError("At least one active administrator is required")


async def _revoke_refresh_tokens(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
