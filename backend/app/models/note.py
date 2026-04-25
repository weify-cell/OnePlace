from pydantic import BaseModel
from typing import Optional, List

class NoteBase(BaseModel):
    title: str = "无标题"
    content: str = ""
    tags: List[str] = []
    folder_id: Optional[int] = None
    is_pinned: bool = False
    is_archived: bool = False
    is_knowledge_base: bool = False
    content_format: str = "markdown"

class NoteCreate(BaseModel):
    folder_id: Optional[int] = None

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    folder_id: Optional[int | None] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_knowledge_base: Optional[bool] = None
    content_format: Optional[str] = None

class Note(NoteBase):
    id: int
    content_text: str = ""
    is_deleted: bool = False
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class NoteListResponse(BaseModel):
    items: List[Note]
    total: int
    page: int
    pageSize: int