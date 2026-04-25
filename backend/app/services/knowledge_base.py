import asyncio
import json
from typing import List
from app.database.connection import get_db
from app.services.settings import get_setting_value

# In-memory embedding task queue (same as TS version)
_embedding_queue: list = []
_processing = False

def enqueue_embedding_task(task: dict) -> None:
    _embedding_queue.append(task)
    asyncio.create_task(_process_embedding_queue())

async def _process_embedding_queue() -> None:
    global _processing
    if _processing:
        return
    _processing = True
    while _embedding_queue:
        task = _embedding_queue.pop(0)
        try:
            await _process_task(task)
        except Exception as e:
            print(f"[Embedding Queue] Error: {e}")
    _processing = False

async def _process_task(task: dict) -> None:
    from app.services.vector import upsert_chunks, delete_chunks_by_note_id
    from app.services.ai_providers import get_ai_client

    note_id = task["noteId"]
    action = task["action"]

    if action == "delete":
        await delete_chunks_by_note_id(note_id)
        return

    db = get_db()
    row = db.execute("SELECT * FROM notes WHERE id = ? AND is_deleted = 0", (note_id,)).fetchone()
    if not row:
        return

    content = row["content_text"] or ""
    if not content.strip():
        return

    title = row["title"]
    tags = json.loads(row["tags"] or "[]")
    folder_id = row["folder_id"]
    created_at = row["created_at"]

    # Split into ~500 char chunks
    chunks = []
    chunk_size = 500
    for i in range(0, len(content), chunk_size):
        chunk_text = content[i:i+chunk_size]
        chunk_id = f"{note_id}_{i // chunk_size}"
        chunks.append({
            "id": chunk_id,
            "text": chunk_text,
            "note_id": note_id,
            "title": title,
            "content": chunk_text,
            "tags": tags,
            "folder_id": folder_id,
            "created_at": created_at,
        })

    if not chunks:
        return

    provider = get_setting_value("embedding_provider", "qwen")
    model = get_setting_value("embedding_model", "text-embedding-v2")

    try:
        client = get_ai_client(provider)
        # Import httpx for sync embedding calls
        import httpx
        provider_config = {
            "qwen": {"baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
            "deepseek": {"baseURL": "https://api.deepseek.com/v1"},
            "openai": {"baseURL": "https://api.openai.com/v1"},
        }.get(provider, {})
        base_url = provider_config.get("baseURL", "")
        api_key = get_setting_value("ai_providers", {}).get(provider, {}).get("apiKey") or "sk-placeholder"

        async with httpx.AsyncClient(timeout=60.0) as http:
            resp = await http.post(
                f"{base_url}/embeddings",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": model, "input": [c["text"] for c in chunks]}
            )
            if not resp.is_success:
                print(f"[KB] Embedding failed: {resp.status_code}")
                return
            embeddings = resp.json()["data"]

        await upsert_chunks([
            {
                "id": chunks[i]["id"],
                "vector": embeddings[i]["embedding"],
                "payload": {k: chunks[i][k] for k in ["note_id", "title", "content", "tags", "folder_id", "created_at"]}
            }
            for i in range(len(chunks))
        ])
    except Exception as e:
        print(f"[Knowledge Base] Embedding failed: {e}")

async def get_collection_stats() -> dict:
    from app.services.vector import get_collection_info
    return await get_collection_info()

async def rebuild_all_embeddings() -> int:
    """Re-embed all notes marked as knowledge_base."""
    db = get_db()
    rows = db.execute("SELECT id FROM notes WHERE is_deleted = 0 AND is_knowledge_base = 1").fetchall()
    for row in rows:
        enqueue_embedding_task({"noteId": row["id"], "action": "upsert", "timestamp": 0})
    return len(rows)