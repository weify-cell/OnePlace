# backend/app/routes/todos.py
from fastapi import APIRouter, Depends, Query
from app.middleware.auth import auth_dependency
from app.services.todos import (
    get_todos, get_todo_by_id, create_todo, update_todo,
    delete_todo, get_all_todo_tags, get_todo_counts,
    get_pending_count, get_urgent_count,
)
from app.models.todo import TodoCreate, TodoUpdate, Todo, TodoListResponse, TodoCounts

router = APIRouter(prefix="/api/todos", tags=["todos"])

@router.get("", response_model=TodoListResponse)
async def list_todos(
    status: str = None, priority: str = None, type_: str = Query(None, alias="type"),
    tag: str = None, search: str = None,
    page: int = Query(1), pageSize: int = Query(20),
    user: dict = Depends(auth_dependency),
):
    return get_todos(status=status, priority=priority, type_=type_, tag=tag, search=search, page=page, page_size=pageSize)

@router.post("", response_model=Todo)
async def create(data: TodoCreate, user: dict = Depends(auth_dependency)):
    return create_todo(data.model_dump())

@router.get("/tags", response_model=list[str])
async def list_tags(user: dict = Depends(auth_dependency)):
    return get_all_todo_tags()

@router.get("/counts", response_model=TodoCounts)
async def counts(user: dict = Depends(auth_dependency)):
    return get_todo_counts()

@router.get("/pending-count")
async def pending_count(user: dict = Depends(auth_dependency)):
    return {"count": get_pending_count()}

@router.get("/urgent-count")
async def urgent_count(user: dict = Depends(auth_dependency)):
    return {"count": get_urgent_count()}

@router.get("/{todo_id}", response_model=Todo)
async def get_one(todo_id: int, user: dict = Depends(auth_dependency)):
    result = get_todo_by_id(todo_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.put("/{todo_id}", response_model=Todo)
async def update(todo_id: int, data: TodoUpdate, user: dict = Depends(auth_dependency)):
    result = update_todo(todo_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{todo_id}")
async def delete(todo_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_todo(todo_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}