# backend/app/database/connection.py
import sqlite3
import os
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

_connection: Optional[sqlite3.Connection] = None


def get_db_path() -> Path:
    """Resolve DB_PATH relative to project root (backend/app/database/ → backend/ → project root)."""
    project_root = Path(__file__).parent.parent.parent
    env_path = project_root / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.startswith("DB_PATH="):
                return project_root / line.split("=", 1)[1].strip()
    return project_root / "data" / "oneplace.db"


def get_db() -> sqlite3.Connection:
    """Return the singleton database connection. Thread-safe via check_same_thread=False."""
    global _connection
    if _connection is None:
        db_path = get_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _connection = sqlite3.connect(str(db_path), check_same_thread=False)
        _connection.row_factory = sqlite3.Row
    return _connection


def reset_db() -> None:
    """Reset the singleton connection (for testing)."""
    global _connection
    if _connection:
        _connection.close()
    _connection = None


@contextmanager
def get_cursor():
    """Context manager for temporary cursor with auto-commit."""
    db = get_db()
    cursor = db.cursor()
    try:
        yield cursor
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()