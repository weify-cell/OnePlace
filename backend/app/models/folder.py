from pydantic import BaseModel

class FolderCreate(BaseModel):
    name: str

class Folder(BaseModel):
    id: int
    name: str
    is_deleted: bool = False
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True