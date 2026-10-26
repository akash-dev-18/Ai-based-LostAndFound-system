from __future__ import annotations

import asyncio
import logging
import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app import cache
from app.ai.embeddings import (
    IMAGE_MODEL_NAME,
    TEXT_MODEL_NAME,
    build_item_text,
    encode_images,
    encode_texts,
)
from app.ai.model import EmbeddingModality, ItemEmbedding
from app.config import settings
from app.item import storage
from app.item.model import Item, ProcessingStatus

logger = logging.getLogger(__name__)


async def refresh_item_embeddings(
    db: AsyncSession,
    *,
    item_id: uuid.UUID,
) -> bool:
    item = await db.scalar(
        select(Item)
        .options(selectinload(Item.images))
        .where(Item.id == item_id)
        .with_for_update()
    )
    if item is None:
        return False

    if item.deleted_at is not None:
        await db.execute(delete(ItemEmbedding).where(ItemEmbedding.item_id == item.id))
        await db.commit()
        await cache.bump_version("items")
        return True

    image_ids = [image.id for image in item.images]
    text = build_item_text(item)
    item.processing_status = ProcessingStatus.PROCESSING
    await db.flush()

    try:
        paths = [
            storage.resolve_storage_path(image.storage_key) for image in item.images
        ]
        text_vectors = await asyncio.to_thread(encode_texts, [text])
        image_vectors = await asyncio.to_thread(encode_images, paths)
    except Exception:
        await db.rollback()
        failed_item = await db.get(Item, item_id)
        if failed_item is not None:
            failed_item.processing_status = ProcessingStatus.FAILED
            await db.commit()
            await cache.bump_version("items")
        logger.exception("Embedding generation failed for item %s", item_id)
        raise

    await db.execute(delete(ItemEmbedding).where(ItemEmbedding.item_id == item.id))
    db.add(
        ItemEmbedding(
            item_id=item.id,
            modality=EmbeddingModality.TEXT,
            model_name=TEXT_MODEL_NAME,
            text_embedding=text_vectors[0],
        )
    )
    for image_id, vector in zip(image_ids, image_vectors, strict=True):
        db.add(
            ItemEmbedding(
                item_id=item.id,
                image_id=image_id,
                modality=EmbeddingModality.IMAGE,
                model_name=IMAGE_MODEL_NAME,
                image_embedding=vector,
            )
        )

    item.processing_status = ProcessingStatus.READY
    await db.commit()
    await cache.bump_version("items")
    return True


async def enqueue_item_processing(item_id: uuid.UUID) -> None:
    if not settings.ai_tasks_enabled:
        return

    try:
        from app.worker.tasks.embeddings import refresh_item_embeddings_task

        refresh_item_embeddings_task.delay(str(item_id))
    except Exception:
        logger.exception("Could not enqueue AI processing for item %s", item_id)
