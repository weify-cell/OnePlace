# backend/tests/test_todos_service.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.database.connection import reset_db, get_db
from app.services.todos import create_todo, get_todos, get_todo_by_id, update_todo, delete_todo, get_todo_counts

def setup_schema():
    """Create tables needed for todos service tests."""
    db = get_db()
    db.execute("DROP TABLE IF EXISTS todos")
    db.execute("DROP TABLE IF EXISTS settings")
    db.execute("""
        CREATE TABLE todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          priority TEXT NOT NULL DEFAULT 'medium',
          status TEXT NOT NULL DEFAULT 'todo',
          type TEXT DEFAULT NULL,
          due_date TEXT DEFAULT NULL,
          completed_at TEXT DEFAULT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          is_deleted INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
    """)
    db.execute("""
        CREATE TABLE settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
    """)
    db.commit()

@pytest.fixture(autouse=True)
def fresh_db():
    reset_db()
    setup_schema()
    yield

def test_create_and_get_todo():
    todo = create_todo({"title": "Test todo", "priority": "high"})
    assert todo["title"] == "Test todo"
    assert todo["priority"] == "high"
    assert todo["is_deleted"] == False

def test_get_todos_empty():
    result = get_todos()
    assert result["items"] == []
    assert result["total"] == 0

def test_get_todo_counts():
    create_todo({"title": "t1", "status": "todo"})
    create_todo({"title": "t2", "status": "done"})
    counts = get_todo_counts()
    assert counts["todo"] == 1
    assert counts["done"] == 1
    assert counts["all"] == 2

def test_delete_todo():
    todo = create_todo({"title": "To delete"})
    deleted = delete_todo(todo["id"])
    assert deleted == True
    assert get_todo_by_id(todo["id"]) is None