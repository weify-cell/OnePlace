# backend/app/routes/upload.py
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.middleware.auth import auth_dependency
from app.services.upload import save_uploaded_file, delete_file, get_note_images
from app.models.upload import UploadResponse

router = APIRouter(prefix="/api/upload", tags=["upload"])

@router.post("", response_model=UploadResponse)
async def upload(file: UploadFile = File(...), user: dict = Depends(auth_dependency)):
    return await save_uploaded_file(file)

@router.delete("/{filename}")
async def delete(filename: str, user: dict = Depends(auth_dependency)):
    deleted = delete_file(filename)
    return {"ok": deleted}

@router.get("/note-images/{note_id}")
async def note_images(note_id: int, content: str = "", user: dict = Depends(auth_dependency)):
    return get_note_images(note_id, content)