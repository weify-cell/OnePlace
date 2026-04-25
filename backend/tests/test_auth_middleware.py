# backend/tests/test_auth_middleware.py
import pytest
import jwt
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.middleware.auth import create_token, verify_token

def test_create_and_verify_token():
    token = create_token()
    payload = verify_token(token)
    assert payload["sub"] == "user"
    assert "exp" in payload

def test_verify_invalid_token_raises():
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        verify_token("invalid-token")
    assert exc_info.value.status_code == 401