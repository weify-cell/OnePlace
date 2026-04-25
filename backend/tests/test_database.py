# backend/tests/test_database.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.database.connection import get_db, reset_db

def test_get_db_returns_cursor():
    reset_db()
    db = get_db()
    assert db is not None
    result = db.execute("SELECT 1 as val").fetchone()
    assert result["val"] == 1