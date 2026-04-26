# backend/app/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from app.middleware.auth import auth_dependency
from app.services.auth import needs_setup, setup_password, login
from app.models.auth import LoginRequest, SetupRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/setup", response_model=TokenResponse)
async def api_setup(req: SetupRequest):
    try:
        token = await setup_password(req.password)
        return TokenResponse(token=token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post("/login", response_model=TokenResponse)
async def api_login(req: LoginRequest):
    try:
        token = await login(req.password)
        return TokenResponse(token=token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

@router.post("/check")
async def api_check(user: dict = Depends(auth_dependency)):
    return {"ok": True}