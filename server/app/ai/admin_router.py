from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import rag
from app.ai.schema import (
    KnowledgeDocumentCreate,
    KnowledgeDocumentListQuery,
    KnowledgeDocumentRead,
)
from app.auth.dependencies import require_roles
from app.common.schema import Page
from app.db.session import get_db
from app.user.model import User, UserRole

router = APIRouter(prefix="/admin/knowledge-documents", tags=["Admin Knowledge"])

AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


def _knowledge_http_exception(exc: rag.KnowledgeDocumentError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=str(exc))


@router.post(
    "",
    response_model=KnowledgeDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_knowledge_document(
    payload: KnowledgeDocumentCreate,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeDocumentRead:
    return await rag.create_knowledge_document(db, actor=admin, payload=payload)


@router.get("", response_model=Page[KnowledgeDocumentRead])
async def list_knowledge_documents(
    query: Annotated[KnowledgeDocumentListQuery, Query()],
    _: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Page[KnowledgeDocumentRead]:
    return await rag.list_knowledge_documents(db, query)


@router.post(
    "/{document_id}/reindex",
    response_model=KnowledgeDocumentRead,
)
async def reindex_knowledge_document(
    document_id: uuid.UUID,
    admin: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> KnowledgeDocumentRead:
    try:
        return await rag.reindex_knowledge_document(
            db,
            actor=admin,
            document_id=document_id,
        )
    except rag.KnowledgeDocumentError as exc:
        raise _knowledge_http_exception(exc) from exc
