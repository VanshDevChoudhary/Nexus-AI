import logging

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from src.api.executions import router as executions_router
from src.api.workflows import router as workflows_router
from src.config import settings
from src.db import engine

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title="nexus-ai", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workflows_router)
app.include_router(executions_router)


@app.get("/api/v1/health")
async def health_check() -> dict[str, str]:
    db_status = "healthy"
    redis_status = "healthy"

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.warning(f"db health check failed: {e}")
        db_status = "unhealthy"

    try:
        r = aioredis.from_url(settings.redis_url)  # type: ignore[no-untyped-call]
        await r.ping()
        await r.aclose()
    except Exception as e:
        logger.warning(f"redis health check failed: {e}")
        redis_status = "unhealthy"

    status = "ok" if db_status == "healthy" and redis_status == "healthy" else "degraded"
    return {"status": status, "database": db_status, "redis": redis_status}
