# backend/app/services/rerank.py
from typing import List
import httpx
from app.services.settings import get_setting_value


MAX_DOC_CHARS = 3500


class RerankUnavailable(Exception):
    """Rerank cannot run: missing API key or unsupported provider."""


def _get_provider_api_key(provider: str) -> str:
    ai_providers: dict = get_setting_value("ai_providers", {})
    api_key = (ai_providers.get(provider) or {}).get("apiKey") or ""
    if not api_key or api_key == "sk-placeholder":
        raise RerankUnavailable(f"missing API key for provider '{provider}'")
    return api_key


async def rerank_chunks(query: str, chunks: List[dict]) -> List[dict]:
    """Cross-encoder rerank. Returns a NEW list (does not mutate input)."""
    if not chunks:
        return []

    provider = get_setting_value("kb_rerank_provider", "qwen")
    model = get_setting_value("kb_rerank_model", "gte-rerank-v2")
    api_key = _get_provider_api_key(provider)

    docs = [(c.get("content") or "")[:MAX_DOC_CHARS] for c in chunks]

    if provider == "qwen":
        scored = await _rerank_dashscope(query, docs, model, api_key)
    elif provider == "cohere":
        scored = await _rerank_cohere(query, docs, model, api_key)
    else:
        raise RerankUnavailable(f"unsupported rerank provider '{provider}'")

    reordered: List[dict] = []
    for index, score in scored:
        if index < 0 or index >= len(chunks):
            continue
        item = dict(chunks[index])
        item["score"] = score
        reordered.append(item)
    return reordered


async def _rerank_dashscope(
    query: str, docs: List[str], model: str, api_key: str
) -> List[tuple[int, float]]:
    url = "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank"
    body = {
        "model": model,
        "input": {"query": query, "documents": docs},
        "parameters": {"top_n": len(docs), "return_documents": False},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        if not resp.is_success:
            raise RerankUnavailable(
                f"DashScope rerank failed: {resp.status_code} {resp.text}"
            )
        data = resp.json()
    results = (data.get("output") or {}).get("results") or []
    return [(int(r["index"]), float(r["relevance_score"])) for r in results]


async def _rerank_cohere(
    query: str, docs: List[str], model: str, api_key: str
) -> List[tuple[int, float]]:
    url = "https://api.cohere.com/v2/rerank"
    body = {
        "model": model,
        "query": query,
        "documents": docs,
        "top_n": len(docs),
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        if not resp.is_success:
            raise RerankUnavailable(
                f"Cohere rerank failed: {resp.status_code} {resp.text}"
            )
        data = resp.json()
    results = data.get("results") or []
    return [(int(r["index"]), float(r["relevance_score"])) for r in results]
