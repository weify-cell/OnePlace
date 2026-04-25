from typing import Optional, List
from app.database.connection import get_db

def row_to_folder(row) -> dict:
    return {**dict(row), "is_deleted": row["is_deleted"] == 1}

def get_folders() -> List[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM folders WHERE is_deleted = 0 ORDER BY name").fetchall()
    return [row_to_folder(r) for r in rows]

def get_folder_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM folders WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_folder(row) if row else None

def create_folder(name: str) -> dict:
    db = get_db()
    result = db.execute("INSERT INTO folders (name) VALUES (?)", (name,))
    db.commit()
    return get_folder_by_id(result.lastrowid)

def update_folder(id: int, name: str) -> Optional[dict]:
    db = get_db()
    db.execute(
        "UPDATE folders SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (name, id)
    )
    db.commit()
    return get_folder_by_id(id)

def delete_folder(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE folders SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    db.commit()
    return result.rowcount > 0