# backend/app/services/todos.py
import json
from typing import Optional, List
from app.database.connection import get_db

def row_to_todo(row) -> dict:
    return {
        **dict(row),
        "tags": json.loads(row["tags"] or "[]"),
        "is_deleted": row["is_deleted"] == 1,
    }

def get_todos(status=None, priority=None, type_=None, tag=None, search=None, page=1, page_size=20):
    db = get_db()
    conditions = ["t.is_deleted = 0"]
    params = []
    if status:
        conditions.append("t.status = ?")
        params.append(status)
    if priority:
        conditions.append("t.priority = ?")
        params.append(priority)
    if type_:
        conditions.append("t.type = ?")
        params.append(type_)
    if search:
        conditions.append("(t.title LIKE ? OR t.description LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if tag:
        conditions.append("EXISTS (SELECT 1 FROM json_each(t.tags) WHERE value = ?)")
        params.append(tag)

    where = " AND ".join(conditions)

    if status == "done":
        order_by = "CASE WHEN t.completed_at IS NULL THEN 1 ELSE 0 END, t.completed_at DESC"
    else:
        order_by = "CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC"

    total = db.execute(f"SELECT COUNT(*) as cnt FROM todos t WHERE {where}", params).fetchone()["cnt"]
    rows = db.execute(
        f"SELECT * FROM todos t WHERE {where} ORDER BY {order_by} LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size]
    ).fetchall()

    return {"items": [row_to_todo(r) for r in rows], "total": total, "page": page, "pageSize": page_size}

def get_todo_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM todos WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_todo(row) if row else None

def create_todo(data: dict) -> dict:
    db = get_db()
    result = db.execute("""
        INSERT INTO todos (title, description, priority, status, type, due_date, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("title", ""),
        data.get("description"),
        data.get("priority", "medium"),
        data.get("status", "todo"),
        data.get("type"),
        data.get("due_date"),
        json.dumps(data.get("tags", []))
    ))
    db.commit()
    return get_todo_by_id(result.lastrowid)

def update_todo(id: int, data: dict) -> Optional[dict]:
    db = get_db()
    existing = get_todo_by_id(id)
    if not existing:
        return None

    updates = []
    params = []
    for field in ["title", "description", "priority", "type", "due_date"]:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])
    if "tags" in data:
        updates.append("tags = ?")
        params.append(json.dumps(data["tags"]))
    if "status" in data:
        updates.append("status = ?")
        params.append(data["status"])
        if data["status"] == "done":
            updates.append("completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
        else:
            updates.append("completed_at = NULL")

    if not updates:
        return existing

    updates.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    params.append(id)
    db.execute(f"UPDATE todos SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    return get_todo_by_id(id)

def delete_todo(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE todos SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    db.commit()
    return result.rowcount > 0

def get_all_todo_tags() -> List[str]:
    db = get_db()
    rows = db.execute("""
        SELECT DISTINCT je.value as tag
        FROM todos t, json_each(t.tags) je
        WHERE t.is_deleted = 0
        ORDER BY tag
    """).fetchall()
    return [r["tag"] for r in rows]

def get_todo_counts() -> dict:
    db = get_db()
    def cnt(query):
        return db.execute(query).fetchone()[0]
    return {
        "all": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0"),
        "todo": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'todo'"),
        "in_progress": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'in_progress'"),
        "done": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'done'"),
        "cancelled": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'cancelled'"),
    }

def get_pending_count() -> int:
    db = get_db()
    return db.execute("SELECT COUNT(*) as cnt FROM todos WHERE is_deleted = 0 AND status = 'todo'").fetchone()["cnt"]

def get_urgent_count() -> int:
    db = get_db()
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    three_days = (today + timedelta(days=3)).isoformat()
    return db.execute("""
        SELECT COUNT(*) as cnt FROM todos
        WHERE is_deleted = 0 AND status NOT IN ('done', 'cancelled')
        AND due_date IS NOT NULL AND due_date <= ?
    """, (three_days,)).fetchone()["cnt"]