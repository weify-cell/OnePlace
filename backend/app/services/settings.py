import json
from typing import Any
from app.database.connection import get_db

def get_setting(key: str) -> str | None:
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None

def get_setting_value(key: str, default: Any) -> Any:
    raw = get_setting(key)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return raw if raw else default

def set_setting(key: str, value: Any) -> None:
    db = get_db()
    db.execute("""
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, (key, json.dumps(value)))
    db.commit()

def get_all_settings() -> dict:
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings WHERE key != 'password_hash'").fetchall()
    result = {}
    for row in rows:
        try:
            result[row["key"]] = json.loads(row["value"])
        except Exception:
            result[row["key"]] = row["value"]
    return result