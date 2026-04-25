# backend/app/services/notes.py
import json
from typing import Optional, List
from app.database.connection import get_db

def extract_text(content: str, content_format: str = "tiptap") -> str:
    """Extract plain text from Tiptap JSON or markdown."""
    if content_format == "markdown":
        return (content
            .replace("![alt](url)", "")
            .replace("[text](url)", r"\1")
            .replace("#", "").replace("*", "").replace("_", "").replace("`", "").replace("[", "").replace("]", "")
            .replace("\n+", " "))
    try:
        doc = json.loads(content)
        texts = []
        def traverse(node):
            if node.get("text"):
                texts.append(node["text"])
            for child in (node.get("content") or []):
                traverse(child)
        traverse(doc)
        return " ".join(texts)
    except Exception:
        return content

def row_to_note(row) -> dict:
    return {
        **dict(row),
        "tags": json.loads(row["tags"] or "[]"),
        "is_pinned": row["is_pinned"] == 1,
        "is_archived": row["is_archived"] == 1,
        "is_deleted": row["is_deleted"] == 1,
        "is_knowledge_base": row.get("is_knowledge_base", 0) == 1,
        "content_format": row.get("content_format", "markdown"),
    }

def get_notes(tag=None, search=None, folder_id=None, is_archived=False, is_pinned=None,
              is_knowledge_base=False, page=1, page_size=20):
    db = get_db()
    conditions = ["is_deleted = 0", f"is_archived = {1 if is_archived else 0}"]
    params = []
    if is_pinned is not None:
        conditions.append(f"is_pinned = {1 if is_pinned else 0}")
    if search:
        conditions.append("(title LIKE ? OR content_text LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if tag:
        conditions.append("EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)")
        params.append(tag)
    if folder_id == "none":
        conditions.append("folder_id IS NULL")
    elif folder_id is not None:
        conditions.append("folder_id = ?")
        params.append(folder_id)

    where = " AND ".join(conditions)
    total = db.execute(f"SELECT COUNT(*) as cnt FROM notes WHERE {where}", params).fetchone()["cnt"]
    rows = db.execute(
        f"SELECT * FROM notes WHERE {where} ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size]
    ).fetchall()
    return {"items": [row_to_note(r) for r in rows], "total": total, "page": page, "pageSize": page_size}

def get_note_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM notes WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_note(row) if row else None

def create_note(folder_id: int | None = None) -> dict:
    db = get_db()
    result = db.execute(
        "INSERT INTO notes (title, content, content_text, tags, folder_id, content_format) VALUES (?, ?, ?, ?, ?, ?)",
        ("无标题", "", "", "[]", folder_id, "markdown")
    )
    db.commit()
    return get_note_by_id(result.lastrowid)

def update_note(id: int, data: dict) -> Optional[dict]:
    db = get_db()
    existing = get_note_by_id(id)
    if not existing:
        return None

    updates = []
    params = []
    if "title" in data:
        updates.append("title = ?")
        params.append(data["title"])
    if "content" in data:
        fmt = data.get("content_format", existing["content_format"])
        updates.extend(["content = ?", "content_text = ?"])
        params.extend([data["content"], extract_text(data["content"], fmt)])
    if "tags" in data:
        updates.append("tags = ?")
        params.append(json.dumps(data["tags"]))
    if "is_pinned" in data:
        updates.append("is_pinned = ?")
        params.append(1 if data["is_pinned"] else 0)
    if "is_archived" in data:
        updates.append("is_archived = ?")
        params.append(1 if data["is_archived"] else 0)
    if "is_knowledge_base" in data:
        updates.append("is_knowledge_base = ?")
        params.append(1 if data["is_knowledge_base"] else 0)
    if "folder_id" in data:
        updates.append("folder_id = ?")
        params.append(data["folder_id"])
    if "content_format" in data:
        updates.append("content_format = ?")
        params.append(data["content_format"])

    if not updates:
        return existing

    updates.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    params.append(id)
    db.execute(f"UPDATE notes SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    return get_note_by_id(id)

def delete_note(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE notes SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    db.commit()
    return result.rowcount > 0

def get_all_note_tags() -> List[str]:
    db = get_db()
    rows = db.execute("""
        SELECT DISTINCT je.value as tag
        FROM notes n, json_each(n.tags) je
        WHERE n.is_deleted = 0
        ORDER BY tag
    """).fetchall()
    return [r["tag"] for r in rows]