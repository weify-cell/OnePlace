# backend/app/middleware/auth.py
import jwt
import os
from datetime import datetime, timezone, timedelta
from functools import wraps
from fastapi import Request, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

JWT_SECRET = os.getenv("JWT_SECRET", "oneplace-default-secret")
JWT_EXPIRES_IN = os.getenv("JWT_EXPIRES_IN", "30d")
ALGORITHM = "HS256"

def _get_expires_delta() -> datetime:
    """Parse JWT_EXPIRES_IN like '30d' into a datetime."""
    value = JWT_EXPIRES_IN.strip()
    if value.endswith("d"):
        return datetime.now(timezone.utc) + timedelta(days=int(value[:-1]))
    elif value.endswith("h"):
        return datetime.now(timezone.utc) + timedelta(hours=int(value[:-1]))
    else:
        return datetime.now(timezone.utc) + timedelta(days=30)

def create_token() -> str:
    """Create a JWT token with sub='user' and expiry."""
    payload = {
        "sub": "user",
        "iat": datetime.now(timezone.utc),
        "exp": _get_expires_delta()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)

def verify_token(token: str) -> dict:
    """Verify and decode a JWT token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# FastAPI security scheme (auto_error=False so we can handle missing tokens ourselves)
security = HTTPBearer(auto_error=False)

async def auth_dependency(
    request: Request,
) -> dict:
    """FastAPI dependency for routes that require authentication. Extracts Bearer token from Authorization header directly."""
    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")
    return verify_token(parts[1])