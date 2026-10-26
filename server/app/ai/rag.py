from __future__ import annotations

import asyncio
import logging
import re
import uuid
from math import ceil

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import cache
from app.ai.embeddings import TEXT_MODEL_NAME, encode_texts
from app.ai.model import (
    DocumentChunk,
    KnowledgeDocument,
    KnowledgeDocumentStatus,
)
from app.ai.schema import (
    KnowledgeDocumentCreate,
    KnowledgeDocumentListQuery,
    KnowledgeDocumentRead,
)
from app.audit import service as audit_service
from app.common.schema import Page
from app.config import settings
from app.user.model import User

logger = logging.getLogger(__name__)


class KnowledgeDocumentError(Exception):
    status_code = 400

    def __init__(self, message: str = "Knowledge document operation failed") -> None:
        super().__init__(message)


class KnowledgeDocumentNotFoundError(KnowledgeDocumentError):
    status_code = 404


def _hard_split(text: str, max_chars: int) -> list[str]:
    words = text.split()
    parts: list[str] = []
    current = ""
    for word in words:
        if len(word) > max_chars:
            if current:
                parts.append(current)
                current = ""
            parts.extend(
                word[index : index + max_chars]
                for index in range(0, len(word), max_chars)
            )
            continue
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            parts.append(current)
            current = word
        else:
            current = candidate
    if current:
        parts.append(current)
    return parts


def _split_segments(text: str, max_chars: int) -> list[str]:
    segments: list[str] = []
    for paragraph in re.split(r"\n{2,}", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if len(paragraph) <= max_chars:
            segments.append(paragraph)
            continue
        for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
            sentence = sentence.strip()
            if not sentence:
                continue
            if len(sentence) <= max_chars:
                segments.append(sentence)
            else:
                segments.extend(_hard_split(sentence, max_chars))
    return segments


def _tail(text: str, limit: int) -> str:
    if limit <= 0:
        return ""
    tail = text[-limit:]
    boundary = tail.find(" ")
    if boundary > 0:
        tail = tail[boundary + 1 :]
    return tail.strip()


def chunk_text(text: str, *, max_chars: int, overlap: int) -> list[str]:
    normalized = "\n".join(
        line.rstrip() for line in text.replace("\r\n", "\n").splitlines()
    ).strip()
    if not normalized:
        return []

    chunks: list[str] = []
    current = ""
    for segment in _split_segments(normalized, max_chars):
        candidate = f"{current}\n\n{segment}".strip() if current else segment
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
            available = max_chars - len(segment) - 2
            tail = _tail(current, min(overlap, max(available, 0)))
            candidate = f"{tail}\n\n{segment}".strip() if tail else segment
        else:
            candidate = segment

        if len(candidate) > max_chars:
            parts = _hard_split(candidate, max_chars)
            chunks.extend(parts[:-1])
            current = parts[-1]
        else:
            current = candidate

    if current:
        chunks.append(current)

    deduped: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        value = chunk.strip()
        if value and value not in seen:
            seen.add(value)
            deduped.append(value)
    return deduped


async def ingest_document(
    db: AsyncSession,
    document_id: uuid.UUID,
    *,
    content: str | None = None,
) -> bool:
    document = await db.scalar(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.id == document_id)
        .with_for_update()
    )
    if document is None:
        return False

    source_text = (content if content is not None else document.content) or ""
    if not source_text.strip():
        existing_chunks = (
            await db.scalars(
                select(DocumentChunk)
                .where(DocumentChunk.document_id == document.id)
                .order_by(DocumentChunk.chunk_index)
            )
        ).all()
        source_text = "\n\n".join(chunk.content for chunk in existing_chunks)

    if not source_text.strip():
        document.status = KnowledgeDocumentStatus.FAILED
        await db.commit()
        return False

    document.content = source_text
    document.status = KnowledgeDocumentStatus.PROCESSING

    chunks = chunk_text(
        source_text,
        max_chars=settings.ai_rag_chunk_size,
        overlap=settings.ai_rag_chunk_overlap,
    )
    if not chunks:
        document.status = KnowledgeDocumentStatus.FAILED
        await db.commit()
        return False

    try:
        vectors = await asyncio.to_thread(encode_texts, chunks)
    except Exception:
        logger.exception("Knowledge document embedding failed for %s", document_id)
        await db.rollback()
        await _mark_failed(db, document_id)
        return False

    await db.execute(
        delete(DocumentChunk).where(DocumentChunk.document_id == document.id)
    )
    db.add_all(
        [
            DocumentChunk(
                document_id=document.id,
                chunk_index=index,
                content=chunk,
                embedding=vector,
                chunk_metadata={
                    "title": document.title,
                    "source": document.source,
                    "version": document.version,
                    "chunk_index": index,
                    "model": TEXT_MODEL_NAME,
                },
            )
            for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True))
        ]
    )
    document.status = KnowledgeDocumentStatus.READY
    await db.commit()
    await cache.bump_version("rag")
    return True


async def _mark_failed(db: AsyncSession, document_id: uuid.UUID) -> None:
    document = await db.get(KnowledgeDocument, document_id)
    if document is not None:
        document.status = KnowledgeDocumentStatus.FAILED
        await db.commit()


async def _schedule_ingestion(db: AsyncSession, document_id: uuid.UUID) -> None:
    if settings.ai_tasks_enabled:
        try:
            from app.worker.tasks.ingestion import ingest_knowledge_document_task

            ingest_knowledge_document_task.delay(str(document_id))
            return
        except Exception:
            logger.exception(
                "Could not enqueue knowledge document ingestion for %s",
                document_id,
            )
    await ingest_document(db, document_id)


async def create_knowledge_document(
    db: AsyncSession,
    *,
    actor: User,
    payload: KnowledgeDocumentCreate,
) -> KnowledgeDocumentRead:
    document = KnowledgeDocument(
        title=payload.title,
        source=payload.source,
        version=payload.version,
        content=payload.content,
        status=KnowledgeDocumentStatus.PENDING,
    )
    db.add(document)
    await db.flush()
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="KNOWLEDGE_DOCUMENT_CREATED",
        entity_type="KNOWLEDGE_DOCUMENT",
        entity_id=document.id,
        metadata={"version": document.version, "status": document.status.value},
    )
    await db.commit()
    await cache.bump_version("rag")
    await db.refresh(document)
    await _schedule_ingestion(db, document.id)
    await db.refresh(document)
    return KnowledgeDocumentRead.model_validate(document)


async def list_knowledge_documents(
    db: AsyncSession,
    query: KnowledgeDocumentListQuery,
) -> Page[KnowledgeDocumentRead]:
    conditions = []
    if query.status is not None:
        conditions.append(KnowledgeDocument.status == query.status)

    total = await db.scalar(
        select(func.count()).select_from(KnowledgeDocument).where(*conditions)
    )
    documents = (
        await db.scalars(
            select(KnowledgeDocument)
            .where(*conditions)
            .order_by(KnowledgeDocument.created_at.desc(), KnowledgeDocument.id.desc())
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
        )
    ).all()

    return Page(
        items=[
            KnowledgeDocumentRead.model_validate(document) for document in documents
        ],
        total=int(total or 0),
        page=query.page,
        page_size=query.page_size,
        pages=ceil((total or 0) / query.page_size) if total else 0,
    )


async def reindex_knowledge_document(
    db: AsyncSession,
    *,
    actor: User,
    document_id: uuid.UUID,
) -> KnowledgeDocumentRead:
    document = await db.scalar(
        select(KnowledgeDocument)
        .where(KnowledgeDocument.id == document_id)
        .with_for_update()
    )
    if document is None:
        raise KnowledgeDocumentNotFoundError("Knowledge document not found")

    document.status = KnowledgeDocumentStatus.PENDING
    await audit_service.record_audit(
        db,
        actor_id=actor.id,
        action="KNOWLEDGE_DOCUMENT_REINDEXED",
        entity_type="KNOWLEDGE_DOCUMENT",
        entity_id=document.id,
        metadata={"version": document.version},
    )
    await db.commit()
    await cache.bump_version("rag")
    await db.refresh(document)
    await _schedule_ingestion(db, document.id)
    await db.refresh(document)
    return KnowledgeDocumentRead.model_validate(document)
