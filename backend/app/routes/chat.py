# backend/app/routes/chat.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.middleware.auth import auth_dependency
from app.services.chat import (
    get_conversations, create_conversation, get_conversation_by_id,
    update_conversation, delete_conversation, get_messages, stream_chat,
)
from app.models.chat import ConversationCreate, ConversationUpdate, Conversation, Message, ChatStreamRequest

router = APIRouter(prefix="/api/conversations", tags=["chat"])

@router.get("", response_model=list[Conversation])
async def list_convs(user: dict = Depends(auth_dependency)):
    return get_conversations()

@router.post("", response_model=Conversation)
async def create(data: ConversationCreate, user: dict = Depends(auth_dependency)):
    return create_conversation(title=data.title, model=data.model, provider=data.provider)

@router.get("/{conv_id}", response_model=Conversation)
async def get_one(conv_id: int, user: dict = Depends(auth_dependency)):
    result = get_conversation_by_id(conv_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.put("/{conv_id}", response_model=Conversation)
async def update(conv_id: int, data: ConversationUpdate, user: dict = Depends(auth_dependency)):
    result = update_conversation(conv_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{conv_id}")
async def delete(conv_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_conversation(conv_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}

@router.get("/{conv_id}/messages", response_model=list[Message])
async def messages(conv_id: int, user: dict = Depends(auth_dependency)):
    return get_messages(conv_id)

@router.post("/{conv_id}/stream")
async def stream(conv_id: int, data: ChatStreamRequest, user: dict = Depends(auth_dependency)):
    return StreamingResponse(
        stream_chat(conv_id, data.message, data.system_prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )