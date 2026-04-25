# backend/app/routes/notes.py
from fastapi import APIRouter, Depends, Query, HTTPException
from app.middleware.auth import auth_dependency
from app.services.notes import (
    get_notes, get_note_by_id, create_note, update_note,
    delete_note, get_all_note_tags,
)
from app.models.note import NoteCreate, NoteUpdate, Note, NoteListResponse

router = APIRouter(prefix="/api/notes", tags=["notes"])

@router.get("", response_model=NoteListResponse)
async def list_notes(
    tag: str = None, search: str = None,
    folder_id: str = Query(None),  # can be "none" string or integer
    is_archived: bool = Query(False), is_pinned: bool = Query(None),
    page: int = Query(1), pageSize: int = Query(20),
    user: dict = Depends(auth_dependency),
):
    f_id = folder_id
    if folder_id and folder_id != "none":
        try:
            f_id = int(folder_id)
        except ValueError:
            f_id = None
    return get_notes(tag=tag, search=search, folder_id=f_id, is_archived=is_archived, is_pinned=is_pinned, page=page, page_size=pageSize)

@router.post("", response_model=Note)
async def create(data: NoteCreate, user: dict = Depends(auth_dependency)):
    return create_note(folder_id=data.folder_id)

@router.get("/tags", response_model=list[str])
async def list_tags(user: dict = Depends(auth_dependency)):
    return get_all_note_tags()

@router.get("/{note_id}", response_model=Note)
async def get_one(note_id: int, user: dict = Depends(auth_dependency)):
    result = get_note_by_id(note_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.put("/{note_id}", response_model=Note)
async def update(note_id: int, data: NoteUpdate, user: dict = Depends(auth_dependency)):
    result = update_note(note_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{note_id}")
async def delete(note_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_note(note_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}