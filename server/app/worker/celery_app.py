from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "lostfound",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.worker.tasks.delivery",
        "app.worker.tasks.embeddings",
        "app.worker.tasks.ingestion",
        "app.worker.tasks.matching",
    ],
)

celery_app.conf.update(
    accept_content=["json"],
    broker_connection_retry_on_startup=True,
    enable_utc=True,
    result_expires=3600,
    result_serializer="json",
    task_acks_late=True,
    task_default_queue="ai_jobs",
    task_reject_on_worker_lost=True,
    task_routes={
        "app.worker.tasks.embeddings.*": {"queue": "ai_jobs"},
        "app.worker.tasks.ingestion.*": {"queue": "ai_jobs"},
        "app.worker.tasks.matching.*": {"queue": "ai_jobs"},
        "app.worker.tasks.delivery.*": {"queue": "delivery"},
    },
    task_serializer="json",
    task_soft_time_limit=300,
    task_time_limit=360,
    task_track_started=True,
    timezone="UTC",
    worker_prefetch_multiplier=1,
)
