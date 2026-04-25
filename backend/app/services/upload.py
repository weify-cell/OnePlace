import os
import re
import uuid
from pathlib import Path
from typing import List
from fastapi import UploadFile

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

def ensure_uploads_dir() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

async def save_uploaded_file(file: UploadFile) -> dict:
    ensure_uploads_dir()
    ext = Path(file.filename).suffix.lower() or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOADS_DIR / filename
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return {"url": f"/uploads/{filename}", "filename": filename}

def delete_file(filename: str) -> bool:
    filepath = UPLOADS_DIR / filename
    if filepath.exists():
        filepath.unlink()
        return True
    return False

def file_exists(filename: str) -> bool:
    return (UPLOADS_DIR / filename).exists()

def parse_images_from_content(content: str) -> List[str]:
    return re.findall(r"!\[.*?\]\(/uploads/([^)]+)\)", content)

def get_note_images(note_id: int, content: str) -> List[dict]:
    used = parse_images_from_content(content)
    return [
        {"filename": f, "url": f"/uploads/{f}", "used_in_content": True}
        for f in used if file_exists(f)
    ]