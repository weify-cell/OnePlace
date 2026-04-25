# backend/app/routes/knowledge_base.py
from fastapi import APIRouter, Depends
from app.middleware.auth import auth_dependency
from app.services.knowledge_base import get_collection_stats, rebuild_all_embeddings

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])

@router.get("/stats")
async def stats(user: dict = Depends(auth_dependency)):
    return await get_collection_stats()

@router.post("/rebuild")
async def rebuild(user: dict = Depends(auth_dependency)):
    count = await rebuild_all_embeddings()
    return {"rebuilt": count}