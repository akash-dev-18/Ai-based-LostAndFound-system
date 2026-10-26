from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import agent
from app.ai.schema import ChatbotMessageRequest, ChatbotMessageResponse
from app.auth.dependencies import get_current_user
from app.db.session import get_db
from app.rate_limit import chatbot_rate_limit
from app.user.model import User

router = APIRouter(prefix="/chatbot", tags=["Chatbot"])


@router.post("/messages", response_model=ChatbotMessageResponse)
async def send_message(
    payload: ChatbotMessageRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    _rate_limit: Annotated[None, Depends(chatbot_rate_limit)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatbotMessageResponse:
    return await agent.run_agent(
        db,
        actor=current_user,
        message=payload.message,
        session_id=payload.session_id,
    )
