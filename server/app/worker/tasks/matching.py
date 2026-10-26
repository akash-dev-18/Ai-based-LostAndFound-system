from __future__ import annotations

import asyncio
import uuid

from app import cache
from app.ai.matching import service as matching_service
from app.worker.celery_app import celery_app
from app.worker.db import task_session


async def _match_item(item_id: uuid.UUID) -> int:
    try:
        async with task_session() as db:
            return await matching_service.generate_matches(db, item_id=item_id)
    finally:
        await cache.close_cache()


@celery_app.task(
    bind=True,
    name="app.worker.tasks.matching.generate_item_matches",
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
    retry_jitter=True,
)
def generate_item_matches_task(self, item_id: str) -> int:
    return asyncio.run(_match_item(uuid.UUID(item_id)))
