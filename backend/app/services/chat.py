import json
from typing import Optional, List, AsyncGenerator
from app.database.connection import get_db
from app.services.settings import get_setting_value

def row_to_conversation(row) -> dict:
    return {
        **dict(row),
        "is_deleted": row["is_deleted"] == 1,
        "kb_enabled": row.get("kb_enabled", 0) == 1,
    }

def row_to_message(row) -> dict:
    return {
        **dict(row),
        "is_error": row["is_error"] == 1,
    }

def get_conversations() -> List[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM conversations WHERE is_deleted = 0 ORDER BY updated_at DESC").fetchall()
    return [row_to_conversation(r) for r in rows]

def create_conversation(title: str = "新对话", model: str = None, provider: str = None) -> dict:
    db = get_db()
    model = model or get_setting_value("default_model", "qwen-turbo")
    provider = provider or get_setting_value("default_provider", "qwen")
    kb_default = 1 if get_setting_value("kb_default_enabled", False) else 0
    result = db.execute(
        "INSERT INTO conversations (title, model, provider, kb_enabled) VALUES (?, ?, ?, ?)",
        (title, model, provider, kb_default)
    )
    db.commit()
    return db.execute("SELECT * FROM conversations WHERE id = ?", (result.lastrowid,)).fetchone()

def get_conversation_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM conversations WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_conversation(row) if row else None

def update_conversation(id: int, data: dict) -> Optional[dict]:
    db = get_db()
    updates = []
    params = []
    for field in ["title", "model", "provider"]:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])
    if "kb_enabled" in data:
        updates.append("kb_enabled = ?")
        params.append(1 if data["kb_enabled"] else 0)
    if not updates:
        return get_conversation_by_id(id)
    updates.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    params.append(id)
    db.execute(f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?", params)
    db.commit()
    return get_conversation_by_id(id)

def delete_conversation(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE conversations SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    db.commit()
    return result.rowcount > 0

def get_messages(conversation_id: int) -> List[dict]:
    db = get_db()
    rows = db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,)
    ).fetchall()
    return [row_to_message(r) for r in rows]

def create_message(conversation_id: int, role: str, content: str, tokens_used: int = None, is_error: bool = False) -> dict:
    db = get_db()
    result = db.execute(
        "INSERT INTO messages (conversation_id, role, content, tokens_used, is_error) VALUES (?, ?, ?, ?, ?)",
        (conversation_id, role, content, tokens_used, 1 if is_error else 0)
    )
    db.commit()
    return db.execute("SELECT * FROM messages WHERE id = ?", (result.lastrowid,)).fetchone()

def _build_sse_event(event: str, data: dict | str) -> str:
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"

async def stream_chat(conversation_id: int, user_message: str, system_prompt: str = None) -> AsyncGenerator[str, None]:
    """Stream chat response using SSE. Compatible with the existing frontend stream parser."""
    from app.services.ai_providers import get_ai_client

    conversation = get_conversation_by_id(conversation_id)
    if not conversation:
        yield _build_sse_event("error", {"detail": "Conversation not found"})
        return

    # Insert user message
    create_message(conversation_id, "user", user_message)

    # Build messages list
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for msg in get_messages(conversation_id):
        messages.append({"role": msg["role"], "content": msg["content"]})

    try:
        client = get_ai_client(conversation["provider"])
        yield _build_sse_event("start", {})

        response_content = ""
        stream = client.chat.completions.create(
            model=conversation["model"],
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                response_content += delta
                yield _build_sse_event("delta", {"content": delta})

        # Save assistant message
        create_message(conversation_id, "assistant", response_content)
        yield _build_sse_event("done", {"content": response_content})

    except Exception as e:
        create_message(conversation_id, "assistant", str(e), is_error=True)
        yield _build_sse_event("error", {"detail": str(e)})