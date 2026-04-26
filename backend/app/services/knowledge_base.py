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
        idx = i // chunk_size
        chunks.append({
            "id": note_id * 10000 + idx,
            "text": chunk_text,
            "chunk_id": f"note_{note_id}_{idx}",
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
            embeddings: list = []
            batch_size = 10
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i+batch_size]
                resp = await http.post(
                    f"{base_url}/embeddings",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"model": model, "input": [c["text"] for c in batch]}
                )
                if not resp.is_success:
                    print(f"[KB] Embedding failed: {resp.status_code} {resp.text}")
                    return
                embeddings.extend(resp.json()["data"])

        if not embeddings:
            return
        from app.services.vector import create_collection_if_not_exists
        dim = len(embeddings[0]["embedding"])
        if not await create_collection_if_not_exists(dim):
            print(f"[KB] Failed to ensure collection exists (dim={dim})")
            return

        await upsert_chunks([
            {
                "id": chunks[i]["id"],
                "vector": embeddings[i]["embedding"],
                "payload": {k: chunks[i][k] for k in ["chunk_id", "note_id", "title", "content", "tags", "folder_id", "created_at"]}
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
    from app.services.vector import delete_collection
    await delete_collection()
    db = get_db()
    rows = db.execute("SELECT id FROM notes WHERE is_deleted = 0 AND is_knowledge_base = 1").fetchall()
    for row in rows:
        enqueue_embedding_task({"noteId": row["id"], "action": "upsert", "timestamp": 0})
    return len(rows)


def _get_provider_base_url(provider: str) -> str:
    return {
        "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "deepseek": "https://api.deepseek.com/v1",
        "openai": "https://api.openai.com/v1",
    }.get(provider, "")


async def embed_text(text: str, provider: str, model: str) -> List[float]:
    import httpx
    base_url = _get_provider_base_url(provider)
    api_key = get_setting_value("ai_providers", {}).get(provider, {}).get("apiKey") or "sk-placeholder"
    async with httpx.AsyncClient(timeout=30.0) as http:
        resp = await http.post(
            f"{base_url}/embeddings",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "input": text},
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]


async def build_knowledge_base_context(conversation_id: int, user_query: str) -> dict | None:
    from app.services.chat import get_conversation_by_id
    from app.services.vector import search_chunks
    from app.services.rerank import rerank_chunks, RerankUnavailable

    conversation = get_conversation_by_id(conversation_id)
    if not conversation or not conversation.get("kb_enabled"):
        return None
    if not get_setting_value("kb_enabled", False):
        return None

    provider = get_setting_value("embedding_provider", "qwen")
    model = get_setting_value("embedding_model", "text-embedding-v2")
    top_k = int(get_setting_value("kb_top_k", 5))

    rerank_enabled = bool(get_setting_value("kb_rerank_enabled", True))
    rerank_recall_size = int(get_setting_value("kb_rerank_recall_size", 20))
    rerank_threshold = float(get_setting_value("kb_rerank_score_threshold", 0.0))

    try:
        query_vector = await embed_text(user_query, provider, model)
        if rerank_enabled:
            recall = max(min(rerank_recall_size, 100), top_k)
            chunks = await search_chunks(query_vector, recall, score_threshold=0.0)
        else:
            chunks = await search_chunks(query_vector, top_k)
        if not chunks:
            return {"system_prompt": "", "references": []}

        seen: dict = {}
        for c in chunks:
            key = f"{c['note_id']}_{c['chunk_id']}"
            if key not in seen:
                seen[key] = c
        chunks = list(seen.values())

        if rerank_enabled:
            try:
                chunks = await asyncio.wait_for(rerank_chunks(user_query, chunks), 8.0)
            except (RerankUnavailable, asyncio.TimeoutError) as e:
                print(f"[KB rerank] failed, falling back to vector order: {e}")
            except Exception as e:
                print(f"[KB rerank] unexpected error, falling back: {e}")

        chunks = [c for c in chunks if c.get("score", 0.0) >= rerank_threshold]
        references = [
            {
                "note_id": c["note_id"],
                "title": c["title"],
                "content": c["content"],
                "score": c["score"],
            }
            for c in chunks[:top_k]
        ]
        ref_text = "\n\n".join(f"[{i+1}] {r['title']}: {r['content']}" for i, r in enumerate(references))
        system_prompt = (
            "You are an assistant. When the user asks a question, please answer based on the provided reference notes.\n"
            "If the reference content does not contain relevant information, please say so honestly.\n\n"
            "## References\n"
            f"{ref_text}\n\n"
            "## Requirements\n"
            "- Answer based on the reference content above\n"
            "- If multiple notes are relevant, synthesize them\n"
            "- If you cannot answer from the references, say \"I cannot answer this based on the current knowledge base\"\n\n"
            "## Notes\n"
            "- Your answers should cite relevant note content as evidence\n"
            "- If multiple notes cover the same topic, synthesize the answers"
        )
        return {"system_prompt": system_prompt, "references": references}
    except Exception as e:
        print(f"[knowledge-base] Failed to build context: {e}")
        return None