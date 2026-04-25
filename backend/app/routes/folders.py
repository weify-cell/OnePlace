# backend/app/routes/folders.py
from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import auth_dependency
from app.services.folders import get_folders, get_folder_by_id, create_folder, update_folder, delete_folder
from app.models.folder import FolderCreate, Folder

router = APIRouter(prefix="/api/folders", tags=["folders"])

@router.get("", response_model=list[Folder])
async def list_(user: dict = Depends(auth_dependency)):
    return get_folders()

@router.post("", response_model=Folder)
async def create(data: FolderCreate, user: dict = Depends(auth_dependency)):
    return create_folder(data.name)

@router.put("/{folder_id}", response_model=Folder)
async def update(folder_id: int, data: FolderCreate, user: dict = Depends(auth_dependency)):
    result = update_folder(folder_id, data.name)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{folder_id}")
async def delete(folder_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_folder(folder_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}