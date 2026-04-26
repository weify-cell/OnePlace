# backend/app/routes/knowledge_base.py
import json
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.middleware.auth import auth_dependency
from app.services.knowledge_base import get_collection_stats, rebuild_all_embeddings
from app.services.settings import get_setting, set_setting

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])

class KnowledgeBaseSettings(BaseModel):
    kb_enabled: Optional[bool] = None
    embedding_provider: Optional[str] = None
    embedding_api_key: Optional[str] = None
    embedding_model: Optional[str] = None
    qdrant_url: Optional[str] = None
    qdrant_collection: Optional[str] = None
    kb_top_k: Optional[int] = None
    kb_chunk_size: Optional[int] = None
    kb_chunk_overlap: Optional[int] = None
    kb_default_enabled: Optional[bool] = None
    kb_score_threshold: Optional[float] = None
    kb_rerank_enabled: Optional[bool] = None
    kb_rerank_provider: Optional[str] = None
    kb_rerank_model: Optional[str] = None
    kb_rerank_recall_size: Optional[int] = None
    kb_rerank_score_threshold: Optional[float] = None

KB_KEYS = [
    "kb_enabled", "embedding_provider", "embedding_api_key", "embedding_model",
    "qdrant_url", "qdrant_collection", "kb_top_k", "kb_chunk_size",
    "kb_chunk_overlap", "kb_default_enabled", "kb_score_threshold",
    "kb_rerank_enabled", "kb_rerank_provider", "kb_rerank_model",
    "kb_rerank_recall_size", "kb_rerank_score_threshold",
]

def load_kb_settings() -> dict:
    result = {}
    for key in KB_KEYS:
        val = get_setting(key)
        if val is not None:
            try:
                result[key] = json.loads(val)
            except Exception:
                result[key] = val
    return result

@router.get("/settings")
async def get_settings(user: dict = Depends(auth_dependency)):
    return load_kb_settings()

@router.put("/settings")
async def update_settings(data: KnowledgeBaseSettings, user: dict = Depends(auth_dependency)):
    for key, value in data.model_dump(exclude_unset=True).items():
        if key in KB_KEYS:
            set_setting(key, value)
    return {"message": "ok"}

@router.get("/stats")
async def stats(user: dict = Depends(auth_dependency)):
    return await get_collection_stats()

@router.post("/rebuild")
async def rebuild(user: dict = Depends(auth_dependency)):
    count = await rebuild_all_embeddings()
    return {"rebuilt": count}