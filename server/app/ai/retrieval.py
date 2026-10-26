from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import cache
from app.ai.embeddings import TEXT_MODEL_NAME, encode_texts
from app.ai.model import (
    DocumentChunk,
    KnowledgeDocument,
    KnowledgeDocumentStatus,
)
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: uuid.UUID
    document_id: uuid.UUID
    chunk_index: int
    content: str
    title: str
    version: str
    source: str
    chunk_metadata: dict[str, Any]
    vector_rank: int | None = None
    keyword_rank: int | None = None
    vector_score: float | None = None
    score: float = 0.0


def _candidate(
    candidates: dict[uuid.UUID, RetrievedChunk],
    chunk: DocumentChunk,
    document: KnowledgeDocument,
) -> RetrievedChunk:
    candidate = candidates.get(chunk.id)
    if candidate is None:
        candidate = RetrievedChunk(
            chunk_id=chunk.id,
            document_id=document.id,
            chunk_index=chunk.chunk_index,
            content=chunk.content,
            title=document.title,
            version=document.version,
            source=document.source,
            chunk_metadata=chunk.chunk_metadata or {},
        )
        candidates[chunk.id] = candidate
    return candidate


async def hybrid_retrieve(
    db: AsyncSession,
    query: str,
    *,
    limit: int | None = None,
    candidate_limit: int | None = None,
) -> list[RetrievedChunk]:
    normalized_query = query.strip()
    if not normalized_query:
        return []

    top_k = limit or settings.ai_rag_top_k
    candidates_limit = candidate_limit or settings.ai_rag_candidate_limit
    version = await cache.get_version("rag")
    cache_key = cache.make_key(
        "rag:retrieve",
        version,
        {
            "query": normalized_query,
            "limit": top_k,
            "candidate_limit": candidates_limit,
            "model": TEXT_MODEL_NAME,
        },
    )
    cached = await cache.get_json(cache_key)
    if cached is not None:
        try:
            return [_chunk_from_cache(item) for item in cached]
        except (KeyError, TypeError, ValueError):
            logger.warning("Discarding invalid cached RAG retrieval result")

    candidates: dict[uuid.UUID, RetrievedChunk] = {}

    vector: list[float] | None = None
    try:
        vector = (await asyncio.to_thread(encode_texts, [normalized_query]))[0]
    except Exception:
        logger.warning(
            "RAG query embedding failed; using keyword retrieval only",
            exc_info=True,
        )

    if vector is not None:
        distance = DocumentChunk.embedding.cosine_distance(vector)
        vector_rows = (
            await db.execute(
                select(DocumentChunk, KnowledgeDocument, distance.label("distance"))
                .join(
                    KnowledgeDocument,
                    DocumentChunk.document_id == KnowledgeDocument.id,
                )
                .where(KnowledgeDocument.status == KnowledgeDocumentStatus.READY)
                .order_by(distance)
                .limit(candidates_limit)
            )
        ).all()
        rank = 0
        for chunk, document, distance_value in vector_rows:
            similarity = 1.0 - float(distance_value)
            if similarity < settings.ai_rag_min_vector_score:
                continue
            rank += 1
            candidate = _candidate(candidates, chunk, document)
            candidate.vector_rank = rank
            candidate.vector_score = similarity
            candidate.score += 1.0 / (settings.ai_rag_rrf_k + rank)

    english = literal_column("'english'::regconfig")
    document = func.to_tsvector(english, DocumentChunk.content)
    ts_query = func.websearch_to_tsquery(english, normalized_query)
    rank_expression = func.ts_rank_cd(document, ts_query)
    keyword_rows = (
        await db.execute(
            select(DocumentChunk, KnowledgeDocument, rank_expression.label("rank"))
            .join(
                KnowledgeDocument,
                DocumentChunk.document_id == KnowledgeDocument.id,
            )
            .where(
                KnowledgeDocument.status == KnowledgeDocumentStatus.READY,
                document.op("@@")(ts_query),
            )
            .order_by(rank_expression.desc())
            .limit(candidates_limit)
        )
    ).all()
    for rank, (chunk, knowledge_document, _) in enumerate(keyword_rows, start=1):
        candidate = _candidate(candidates, chunk, knowledge_document)
        candidate.keyword_rank = rank
        candidate.score += 1.0 / (settings.ai_rag_rrf_k + rank)

    ordered = sorted(
        candidates.values(),
        key=lambda item: (
            -item.score,
            item.vector_rank or 10**9,
            item.keyword_rank or 10**9,
        ),
    )
    result = ordered[:top_k]
    await cache.set_json(
        cache_key,
        [asdict(chunk) for chunk in result],
        settings.cache_rag_ttl_seconds,
    )
    return result


def _chunk_from_cache(value: dict[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=uuid.UUID(value["chunk_id"]),
        document_id=uuid.UUID(value["document_id"]),
        chunk_index=int(value["chunk_index"]),
        content=value["content"],
        title=value["title"],
        version=value["version"],
        source=value["source"],
        chunk_metadata=value.get("chunk_metadata") or {},
        vector_rank=value.get("vector_rank"),
        keyword_rank=value.get("keyword_rank"),
        vector_score=value.get("vector_score"),
        score=float(value.get("score", 0.0)),
    )
