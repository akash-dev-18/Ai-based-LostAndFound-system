from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.ai.admin_router import router as ai_admin_router
from app.ai.chatbot_router import router as chatbot_router
from app.ai.matching.router import router as matching_router
from app.audit.router import router as audit_router
from app.auth.router import router as auth_router
from app.cache import close_cache
from app.chat.router import router as chat_router
from app.claim.router import router as claim_router
from app.config import settings
from app.db.session import engine
from app.item.router import media_router as item_media_router
from app.item.router import router as item_router
from app.notification.router import router as notification_router
from app.realtime import router as realtime_router
from app.realtime import start_realtime, stop_realtime
from app.user.admin_router import router as admin_user_router
from app.user.router import router as user_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await start_realtime()
    try:
        yield
    finally:
        await stop_realtime()
        await close_cache()
        await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(user_router, prefix=settings.api_v1_prefix)
app.include_router(admin_user_router, prefix=settings.api_v1_prefix)
app.include_router(audit_router, prefix=settings.api_v1_prefix)
app.include_router(ai_admin_router, prefix=settings.api_v1_prefix)
app.include_router(chatbot_router, prefix=settings.api_v1_prefix)
app.include_router(item_router, prefix=settings.api_v1_prefix)
app.include_router(item_media_router, prefix=settings.api_v1_prefix)
app.include_router(claim_router, prefix=settings.api_v1_prefix)
app.include_router(matching_router, prefix=settings.api_v1_prefix)
app.include_router(chat_router, prefix=settings.api_v1_prefix)
app.include_router(notification_router, prefix=settings.api_v1_prefix)
app.include_router(realtime_router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["Health"])
async def health() -> dict[str, str]:
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        ) from exc
    return {"status": "ok"}
