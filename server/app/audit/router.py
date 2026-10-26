from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import service
from app.audit.schema import AuditLogListQuery, AuditLogRead
from app.auth.dependencies import require_roles
from app.common.schema import Page
from app.db.session import get_db
from app.user.model import User, UserRole

router = APIRouter(prefix="/admin/audit-logs", tags=["Admin Audit"])

AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


@router.get("", response_model=Page[AuditLogRead])
async def list_audit_logs(
    query: Annotated[AuditLogListQuery, Query()],
    _: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[AuditLogRead]:
    return await service.list_audit_logs(db, query)
