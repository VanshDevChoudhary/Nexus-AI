from celery import Celery

from src.config import settings

celery = Celery(
    "nexus",
    broker=settings.celery_broker_url,
    include=["src.tasks.execute_workflow"],
)

celery.conf.update(
    result_backend=settings.celery_broker_url,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)
