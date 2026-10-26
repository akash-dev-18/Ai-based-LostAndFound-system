from __future__ import annotations

import uuid
from math import ceil
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.model import AuditLog
from app.audit.schema import AuditLogListQuery, AuditLogRead
from app.common.schema import Page


async def record_audit(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    log = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        log_metadata=metadata or {},
    )
    db.add(log)
    return log


async def list_audit_logs(
    db: AsyncSession,
    query: AuditLogListQuery,
) -> Page[AuditLogRead]:
    conditions = []

    if query.actor_id is not None:
        conditions.append(AuditLog.actor_id == query.actor_id)
    if query.action is not None:
        conditions.append(AuditLog.action == query.action)
    if query.entity_type is not None:
        conditions.append(AuditLog.entity_type == query.entity_type)
    if query.entity_id is not None:
        conditions.append(AuditLog.entity_id == query.entity_id)
    if query.created_from is not None:
        conditions.append(AuditLog.created_at >= query.created_from)
    if query.created_to is not None:
        conditions.append(AuditLog.created_at <= query.created_to)

    total = await db.scalar(
        select(func.count()).select_from(AuditLog).where(*conditions)
    )
    logs = (
        await db.scalars(
            select(AuditLog)
            .where(*conditions)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
        )
    ).all()

    return Page(
        items=[AuditLogRead.model_validate(log) for log in logs],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )
