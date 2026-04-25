# backend/app/routes/settings.py
from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import auth_dependency
from app.services.settings import get_all_settings, set_setting

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
async def get_settings(user: dict = Depends(auth_dependency)):
    return get_all_settings()

@router.put("/{key}")
async def put_setting(key: str, body: dict, user: dict = Depends(auth_dependency)):
    set_setting(key, body.get("value"))
    return {"ok": True}