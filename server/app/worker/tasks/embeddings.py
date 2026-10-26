from __future__ import annotations

import asyncio
import uuid

from app import cache
from app.ai import service as ai_service
from app.ai.matching import service as matching_service
from app.worker.celery_app import celery_app
from app.worker.db import task_session


async def _process_item(item_id: uuid.UUID) -> None:
    try:
        async with task_session() as db:
            refreshed = await ai_service.refresh_item_embeddings(db, item_id=item_id)
            if refreshed:
                await matching_service.generate_matches(db, item_id=item_id)
    finally:
        await cache.close_cache()


@celery_app.task(
    bind=True,
    name="app.worker.tasks.embeddings.refresh_item_embeddings",
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def refresh_item_embeddings_task(self, item_id: str) -> None:
    asyncio.run(_process_item(uuid.UUID(item_id)))
