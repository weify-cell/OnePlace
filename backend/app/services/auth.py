# backend/app/services/auth.py
import bcrypt
import json
from app.database.connection import get_db
from app.middleware.auth import create_token

def get_password_hash() -> str:
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key = ?", ("password_hash",)).fetchone()
    if not row:
        return ""
    try:
        return json.loads(row["value"])
    except Exception:
        return ""

def set_password_hash(hash: str) -> None:
    db = get_db()
    db.execute("""
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, ("password_hash", json.dumps(hash)))

def needs_setup() -> bool:
    h = get_password_hash()
    return not h

async def setup_password(password: str) -> str:
    if not needs_setup():
        raise ValueError("密码已设置，请使用登录接口")
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    set_password_hash(hashed)
    return create_token()

async def login(password: str) -> str:
    h = get_password_hash()
    if not h:
        raise ValueError("密码未设置")
    valid = bcrypt.checkpw(password.encode(), h.encode())
    if not valid:
        raise ValueError("密码错误")
    return create_token()