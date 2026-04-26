import httpx
from typing import List
from app.services.settings import get_setting_value

async def qdrant_request(path: str, method: str = "GET", body: dict = None) -> dict:
    url = get_setting_value("qdrant_url", "http://localhost:6333")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method, f"{url}{path}", json=body)
        if not resp.is_success:
            raise Exception(f"Qdrant {method} {path} failed: {resp.status_code} {resp.text}")
        return resp.json()

async def upsert_chunks(chunks: List[dict]) -> None:
    if not chunks:
        return
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    for i in range(0, len(chunks), 9):
        batch = chunks[i:i+9]
        await qdrant_request(f"/collections/{collection}/points", "PUT", {
            "points": [
                {"id": c["id"], "vector": c["vector"], "payload": c["payload"]}
                for c in batch
            ]
        })

async def search_chunks(
    query_vector: List[float],
    top_k: int,
    score_threshold: float | None = None,
) -> List[dict]:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    threshold = (
        score_threshold
        if score_threshold is not None
        else get_setting_value("kb_score_threshold", 0.5)
    )
    result = await qdrant_request(f"/collections/{collection}/points/search", "POST", {
        "vector": query_vector,
        "limit": top_k,
        "score_threshold": threshold,
        "with_payload": True,
    })
    out = []
    for r in (result.get("result") or []):
        p = r.get("payload") or {}
        note_id = p.get("note_id") or p.get("node_id")
        if note_id is None:
            continue
        out.append({
            "chunk_id": p.get("chunk_id", ""),
            "note_id": note_id,
            "title": p.get("title", ""),
            "content": p.get("content", ""),
            "tags": p.get("tags", []),
            "score": r.get("score", 0.0),
        })
    return out

async def delete_chunks_by_note_id(note_id: int) -> None:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    await qdrant_request(f"/collections/{collection}/points/delete", "POST", {
        "filter": {"must": [{"key": "note_id", "match": {"value": note_id}}]}
    })

async def get_collection_info() -> dict:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    try:
        result = await qdrant_request(f"/collections/{collection}")
        return {"points_count": result.get("result", {}).get("points_count", 0)}
    except Exception:
        return {"points_count": 0}


async def create_collection_if_not_exists(dimension: int) -> bool:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    try:
        await qdrant_request(f"/collections/{collection}")
        return True
    except Exception as e:
        if "404" not in str(e):
            return False
    try:
        await qdrant_request(f"/collections/{collection}", "PUT", {
            "vectors": {"size": dimension, "distance": "Cosine"}
        })
        return True
    except Exception as e:
        print(f"[vector] Failed to create collection: {e}")
        return False


async def delete_collection() -> None:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    try:
        await qdrant_request(f"/collections/{collection}", "DELETE")
    except Exception:
        pass