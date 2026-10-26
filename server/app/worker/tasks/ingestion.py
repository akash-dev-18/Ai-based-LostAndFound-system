from __future__ import annotations

import asyncio
import uuid

from app import cache
from app.ai import rag
from app.worker.celery_app import celery_app
from app.worker.db import task_session


async def _ingest(document_id: uuid.UUID) -> bool:
    try:
        async with task_session() as db:
            return await rag.ingest_document(db, document_id)
    finally:
        await cache.close_cache()


@celery_app.task(
    bind=True,
    name="app.worker.tasks.ingestion.ingest_knowledge_document",
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def ingest_knowledge_document_task(self, document_id: str) -> bool:
    return asyncio.run(_ingest(uuid.UUID(document_id)))
