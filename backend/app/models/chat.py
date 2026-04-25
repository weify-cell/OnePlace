from pydantic import BaseModel
from typing import Optional, List

class ConversationCreate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None

class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    kb_enabled: Optional[bool] = None

class Conversation(BaseModel):
    id: int
    title: str
    model: str
    provider: str
    kb_enabled: bool = False
    kb_scope: str = "all"
    is_deleted: bool = False
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class Message(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    tokens_used: Optional[int] = None
    is_error: bool = False
    created_at: str
    class Config:
        from_attributes = True

class ChatStreamRequest(BaseModel):
    message: str
    system_prompt: Optional[str] = None