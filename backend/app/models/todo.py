from pydantic import BaseModel
from typing import Optional, List

class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    status: str = "todo"
    type: Optional[str] = None
    due_date: Optional[str] = None
    tags: List[str] = []

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    type: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None

class Todo(TodoBase):
    id: int
    is_deleted: bool = False
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class TodoListResponse(BaseModel):
    items: List[Todo]
    total: int
    page: int
    pageSize: int

class TodoCounts(BaseModel):
    all: int
    todo: int
    in_progress: int
    done: int
    cancelled: int