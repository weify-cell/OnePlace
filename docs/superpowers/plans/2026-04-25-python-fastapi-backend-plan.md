# Python FastAPI 后端重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OnePlace Express/TypeScript 后端完整重写为 Python/FastAPI，保持 API 完全兼容，前端无需修改。

**Architecture:** 标准 FastAPI 分层架构：`routes → services → database`。每条路由直接调用 service 层函数，不另加 controller 层。SQLite 通过 Python 内置 `sqlite3` 管理，复用现有 `.db` 文件和迁移 SQL 文件。

**Tech Stack:** FastAPI + uvicorn + uv + sqlite3 + pyjwt + bcrypt + Pydantic + qdrant-client + openai

---

## 文件结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                     # FastAPI 应用入口
│   ├── database/
│   │   ├── __init__.py
│   │   ├── connection.py           # SQLite 单例连接
│   │   └── migrations.py            # 启动时执行 SQL 迁移
│   ├── middleware/
│   │   ├── __init__.py
│   │   ├── auth.py                 # JWT 认证中间件
│   │   └── error.py                # 全局异常处理
│   ├── models/
│   │   ├── __init__.py
│   │   ├── auth.py                 # Login/SignupRequest, TokenResponse
│   │   ├── todo.py                 # Todo, TodoCreate, TodoUpdate, TodoQuery
│   │   ├── note.py                 # Note, NoteCreate, NoteUpdate, NoteQuery
│   │   ├── chat.py                 # Conversation, Message, ChatStreamRequest
│   │   ├── folder.py               # Folder, FolderCreate
│   │   ├── upload.py              # UploadResponse
│   │   └── settings.py             # SettingsValue, AIProvider
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── auth.py                 # /api/auth/*
│   │   ├── todos.py               # /api/todos/*
│   │   ├── notes.py               # /api/notes/*
│   │   ├── chat.py                # /api/conversations/*
│   │   ├── settings.py            # /api/settings/*
│   │   ├── folders.py            # /api/folders/*
│   │   ├── upload.py             # /api/upload/*
│   │   └── knowledge_base.py     # /api/knowledge-base/*
│   └── services/
│       ├── __init__.py
│       ├── auth.py                # JWT + bcrypt 逻辑
│       ├── todos.py
│       ├── notes.py               # 含 Tiptap JSON → 纯文本提取
│       ├── chat.py               # 含 SSE 流式输出
│       ├── settings.py
│       ├── folders.py
│       ├── upload.py
│       └── knowledge_base.py     # 向量检索 + embedding 排队
├── tests/
│   ├── __init__.py
│   ├── test_auth.py
│   ├── test_todos.py
│   ├── test_notes.py
│   ├── test_chat.py
│   └── conftest.py               # pytest fixtures
├── pyproject.toml
└── .env
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env`

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "oneplace-backend"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "python-multipart>=0.0.20",
    "pyjwt>=2.10.0",
    "bcrypt>=4.2.0",
    "python-dotenv>=1.0.0",
    "qdrant-client>=1.12.0",
    "openai>=1.58.0",
    "aiofiles>=24.0.0",
]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Create .env**

```env
PORT=3000
DB_PATH=./data/oneplace.db
JWT_SECRET=oneplace-default-secret-change-in-production
JWT_EXPIRES_IN=30d
```

- [ ] **Step 3: 创建目录结构**

Run: `mkdir -p backend/app/database backend/app/middleware backend/app/models backend/app/routes backend/app/services backend/tests`

- [ ] **Step 4: 创建空 __init__.py 文件**

Run: `touch backend/app/__init__.py backend/app/database/__init__.py backend/app/middleware/__init__.py backend/app/models/__init__.py backend/app/routes/__init__.py backend/app/services/__init__.py backend/tests/__init__.py`

---

## Task 2: 数据库连接与迁移

**Files:**
- Create: `backend/app/database/connection.py`
- Create: `backend/app/database/migrations.py`

- [ ] **Step 1: Write test for database connection**

```python
# tests/test_database.py
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.database.connection import get_db, reset_db

def test_get_db_returns_cursor():
    reset_db()
    db = get_db()
    assert db is not None
    result = db.execute("SELECT 1 as val").fetchone()
    assert result["val"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_database.py::test_get_db_returns_cursor -v`
Expected: `ERROR` (module not found)

- [ ] **Step 3: Write connection.py**

```python
# backend/app/database/connection.py
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from typing import Optional

_connection: Optional[sqlite3.Connection] = None

def get_db_path() -> Path:
    """Resolve DB_PATH relative to project root (2 levels up from app/database/)."""
    # backend/app/database/ → backend/ → project root
    project_root = Path(__file__).parent.parent.parent
    env_path = project_root / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("DB_PATH="):
                return project_root / line.split("=", 1)[1].strip()
    return project_root / "data" / "oneplace.db"

def get_db() -> sqlite3.Connection:
    """Return the singleton database connection."""
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
    """Context manager for temporary cursor."""
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
```

- [ ] **Step 4: Write migrations.py**

```python
# backend/app/database/migrations.py
import os
from pathlib import Path
from app.database.connection import get_db

MIGRATIONS_DIR = Path(__file__).parent / "migrations"
# Fallback: look relative to project root
if not MIGRATIONS_DIR.exists():
    project_root = Path(__file__).parent.parent.parent
    MIGRATIONS_DIR = project_root / "server" / "src" / "database" / "migrations"

def run_migrations() -> None:
    """Run all SQL migration files in order."""
    if not MIGRATIONS_DIR.exists():
        print(f"[WARN] Migrations directory not found: {MIGRATIONS_DIR}")
        return

    db = get_db()

    # Ensure _migrations table exists
    db.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
    """)

    applied = {row["name"] for row in db.execute("SELECT name FROM _migrations").fetchall()}

    migration_files = sorted(f for f in MIGRATIONS_DIR.glob("*.sql") if f.name not in applied)

    for migration_file in migration_files:
        print(f"[Migration] Running: {migration_file.name}")
        sql = migration_file.read_text(encoding="utf-8")
        db.executescript(sql)
        db.execute("INSERT OR IGNORE INTO _migrations (name) VALUES (?)", (migration_file.name,))
        db.commit()
        print(f"[Migration] Done: {migration_file.name}")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_database.py::test_get_db_returns_cursor -v`
Expected: `PASS`

- [ ] **Step 6: Commit**

Run: `git add backend/pyproject.toml backend/.env backend/app/database/ backend/tests/ && git commit -m "feat(backend): scaffold project structure with SQLite connection and migrations"`

---

## Task 3: Middleware (认证 + 错误处理)

**Files:**
- Create: `backend/app/middleware/auth.py`
- Create: `backend/app/middleware/error.py`

- [ ] **Step 1: Write test for auth middleware**

```python
# tests/test_auth_middleware.py
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
    with pytest.raises(jwt.InvalidTokenError):
        verify_token("invalid-token")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth_middleware.py -v`
Expected: `ERROR` (module not found)

- [ ] **Step 3: Write auth.py middleware**

```python
# backend/app/middleware/auth.py
import jwt
import os
from datetime import datetime, timezone
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
        from datetime import timedelta
        return datetime.now(timezone.utc) + timedelta(days=int(value[:-1]))
    elif value.endswith("h"):
        from datetime import timedelta
        return datetime.now(timezone.utc) + timedelta(hours=int(value[:-1]))
    else:
        from datetime import timedelta
        return datetime.now(timezone.utc) + timedelta(days=30)

def create_token() -> str:
    payload = {
        "sub": "user",
        "iat": datetime.now(timezone.utc),
        "exp": _get_expires_delta()
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

security = HTTPBearer(auto_error=False)

async def auth_dependency(credentials: HTTPAuthorizationCredentials = None) -> dict:
    """Dependency for routes that require authentication."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")
    return verify_token(credentials.credentials)
```

- [ ] **Step 4: Write error.py middleware**

```python
# backend/app/middleware/error.py
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import traceback

async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": exc.errors()})

async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

async def generic_exception_handler(request: Request, exc: Exception):
    # Log the error server-side only
    print(f"[Unhandled Exception] {request.method} {request.url}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )

def register_error_handlers(app):
    from fastapi import FastAPI
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, generic_exception_handler)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_auth_middleware.py -v`
Expected: `PASS`

- [ ] **Step 6: Commit**

Run: `git add backend/app/middleware/ && git commit -m "feat(backend): add JWT auth middleware and error handlers"`

---

## Task 4: Models (Pydantic)

**Files:**
- Create: `backend/app/models/auth.py`
- Create: `backend/app/models/todo.py`
- Create: `backend/app/models/note.py`
- Create: `backend/app/models/chat.py`
- Create: `backend/app/models/folder.py`
- Create: `backend/app/models/upload.py`
- Create: `backend/app/models/settings.py`

- [ ] **Step 1: Write all Pydantic models**

```python
# backend/app/models/auth.py
from pydantic import BaseModel

class LoginRequest(BaseModel):
    password: str

class SetupRequest(BaseModel):
    password: str

class TokenResponse(BaseModel):
    token: str
```

```python
# backend/app/models/todo.py
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    status: str = "todo"
    type: Optional[str] = None
    due_date: Optional[str] = None
    tags: List[str] = []

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    type: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None

class Todo(TodoBase):
    id: int
    is_deleted: bool
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class TodoListResponse(BaseModel):
    items: List[Todo]
    total: int
    page: int
    pageSize: int

class TodoCounts(BaseModel):
    all: int
    todo: int
    in_progress: int
    done: int
    cancelled: int
```

```python
# backend/app/models/note.py
from pydantic import BaseModel
from typing import Optional, List

class NoteBase(BaseModel):
    title: str = "无标题"
    content: str = ""
    tags: List[str] = []
    folder_id: Optional[int] = None
    is_pinned: bool = False
    is_archived: bool = False
    is_knowledge_base: bool = False
    content_format: str = "markdown"

class NoteCreate(BaseModel):
    folder_id: Optional[int] = None

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None
    folder_id: Optional[int | None] = None
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    is_knowledge_base: Optional[bool] = None
    content_format: Optional[str] = None

class Note(NoteBase):
    id: int
    content_text: str = ""
    is_deleted: bool = False
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class NoteListResponse(BaseModel):
    items: List[Note]
    total: int
    page: int
    pageSize: int
```

```python
# backend/app/models/chat.py
from pydantic import BaseModel
from typing import Optional, List

class ConversationCreate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None

class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None
    kb_enabled: Optional[bool] = None

class Conversation(BaseModel):
    id: int
    title: str
    model: str
    provider: str
    kb_enabled: bool = False
    kb_scope: str = "all"
    is_deleted: bool = False
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class Message(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    tokens_used: Optional[int] = None
    is_error: bool = False
    created_at: str
    class Config:
        from_attributes = True

class ChatStreamRequest(BaseModel):
    message: str
    system_prompt: Optional[str] = None
```

```python
# backend/app/models/folder.py
from pydantic import BaseModel
from typing import Optional

class FolderCreate(BaseModel):
    name: str

class Folder(BaseModel):
    id: int
    name: str
    is_deleted: bool = False
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True
```

```python
# backend/app/models/upload.py
from pydantic import BaseModel

class UploadResponse(BaseModel):
    url: str
    filename: str
```

```python
# backend/app/models/settings.py
from pydantic import BaseModel
from typing import Any, Optional

class SettingsValue(BaseModel):
    key: str
    value: Any

class AIProvider(BaseModel):
    apiKey: Optional[str] = None
    baseURL: Optional[str] = None
```

- [ ] **Step 2: Commit**

Run: `git add backend/app/models/ && git commit -m "feat(backend): add Pydantic models for all entities"`

---

## Task 5: Services (auth, todos, notes)

**Files:**
- Create: `backend/app/services/auth.py`
- Create: `backend/app/services/todos.py`
- Create: `backend/app/services/notes.py`

- [ ] **Step 1: Write test for auth service**

```python
# tests/test_auth_service.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.database.connection import reset_db
from app.services.auth import needs_setup, setup_password, login

def test_needs_setup_initially():
    reset_db()
    # Fresh DB — no password set
    assert needs_setup() == True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth_service.py::test_needs_setup_initially -v`
Expected: `ERROR`

- [ ] **Step 3: Write auth service**

```python
# backend/app/services/auth.py
import bcrypt
from app.database.connection import get_db

def get_password_hash() -> str:
    db = get_db()
    row = db.execute("SELECT value FROM settings WHERE key = ?", ("password_hash",)).fetchone()
    if not row:
        return ""
    try:
        import json
        return json.loads(row["value"])
    except Exception:
        return ""

def set_password_hash(hash: str) -> None:
    db = get_db()
    import json
    db.execute("""
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    """, ("password_hash", json.dumps(hash)))

def needs_setup() -> bool:
    h = get_password_hash()
    return not h

async def setup_password(password: str) -> str:
    from app.middleware.auth import create_token
    if not needs_setup():
        raise ValueError("密码已设置，请使用登录接口")
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    set_password_hash(hashed)
    return create_token()

async def login(password: str) -> str:
    from app.middleware.auth import create_token
    h = get_password_hash()
    if not h:
        raise ValueError("密码未设置")
    valid = bcrypt.checkpw(password.encode(), h.encode())
    if not valid:
        raise ValueError("密码错误")
    return create_token()
```

- [ ] **Step 4: Write todos service**

```python
# backend/app/services/todos.py
import json
from typing import Optional, List
from app.database.connection import get_db

def row_to_todo(row) -> dict:
    return {
        **dict(row),
        "tags": json.loads(row["tags"] or "[]"),
        "is_deleted": row["is_deleted"] == 1,
    }

def get_todos(status=None, priority=None, type_=None, tag=None, search=None, page=1, page_size=20):
    db = get_db()
    conditions = ["t.is_deleted = 0"]
    params = []
    if status:
        conditions.append("t.status = ?")
        params.append(status)
    if priority:
        conditions.append("t.priority = ?")
        params.append(priority)
    if type_:
        conditions.append("t.type = ?")
        params.append(type_)
    if search:
        conditions.append("(t.title LIKE ? OR t.description LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if tag:
        conditions.append("EXISTS (SELECT 1 FROM json_each(t.tags) WHERE value = ?)")
        params.append(tag)

    where = " AND ".join(conditions)

    if status == "done":
        order_by = "CASE WHEN t.completed_at IS NULL THEN 1 ELSE 0 END, t.completed_at DESC"
    else:
        order_by = "CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC"

    total = db.execute(f"SELECT COUNT(*) as cnt FROM todos t WHERE {where}", params).fetchone()["cnt"]
    rows = db.execute(
        f"SELECT * FROM todos t WHERE {where} ORDER BY {order_by} LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size]
    ).fetchall()

    return {"items": [row_to_todo(r) for r in rows], "total": total, "page": page, "pageSize": page_size}

def get_todo_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM todos WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_todo(row) if row else None

def create_todo(data: dict) -> dict:
    db = get_db()
    result = db.execute("""
        INSERT INTO todos (title, description, priority, status, type, due_date, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("title", ""),
        data.get("description"),
        data.get("priority", "medium"),
        data.get("status", "todo"),
        data.get("type"),
        data.get("due_date"),
        json.dumps(data.get("tags", []))
    ))
    return get_todo_by_id(result.lastrowid)

def update_todo(id: int, data: dict) -> Optional[dict]:
    db = get_db()
    existing = get_todo_by_id(id)
    if not existing:
        return None

    updates = []
    params = []
    for field in ["title", "description", "priority", "type", "due_date"]:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])
    if "tags" in data:
        updates.append("tags = ?")
        params.append(json.dumps(data["tags"]))
    if "status" in data:
        updates.append("status = ?")
        params.append(data["status"])
        if data["status"] == "done":
            updates.append("completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
        else:
            updates.append("completed_at = NULL")

    if not updates:
        return existing

    updates.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    params.append(id)
    db.execute(f"UPDATE todos SET {', '.join(updates)} WHERE id = ?", params)
    return get_todo_by_id(id)

def delete_todo(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE todos SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    return result.rowcount > 0

def get_all_todo_tags() -> List[str]:
    db = get_db()
    rows = db.execute("""
        SELECT DISTINCT je.value as tag
        FROM todos t, json_each(t.tags) je
        WHERE t.is_deleted = 0
        ORDER BY tag
    """).fetchall()
    return [r["tag"] for r in rows]

def get_todo_counts() -> dict:
    db = get_db()
    def cnt(query):
        return db.execute(query).fetchone()["count"]
    return {
        "all": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0"),
        "todo": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'todo'"),
        "in_progress": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'in_progress'"),
        "done": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'done'"),
        "cancelled": cnt("SELECT COUNT(*) FROM todos WHERE is_deleted = 0 AND status = 'cancelled'"),
    }

def get_pending_count() -> int:
    db = get_db()
    return db.execute("SELECT COUNT(*) as cnt FROM todos WHERE is_deleted = 0 AND status = 'todo'").fetchone()["cnt"]

def get_urgent_count() -> int:
    db = get_db()
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    three_days = (today + timedelta(days=3)).isoformat()
    return db.execute("""
        SELECT COUNT(*) as cnt FROM todos
        WHERE is_deleted = 0 AND status NOT IN ('done', 'cancelled')
        AND due_date IS NOT NULL AND due_date <= ?
    """, (three_days,)).fetchone()["cnt"]
```

- [ ] **Step 5: Write notes service**

```python
# backend/app/services/notes.py
import json
from typing import Optional, List
from app.database.connection import get_db

def extract_text(content: str, content_format: str = "tiptap") -> str:
    """Extract plain text from Tiptap JSON or markdown."""
    if content_format == "markdown":
        return (content
            .replace("![alt](url)", "")
            .replace("[text](url)", r"\1")
            .replace("#", "").replace("*", "").replace("_", "").replace("`", "").replace("[", "").replace("]", "")
            .replace("\n+", " "))
    try:
        doc = json.loads(content)
        texts = []
        def traverse(node):
            if node.get("text"):
                texts.append(node["text"])
            for child in (node.get("content") or []):
                traverse(child)
        traverse(doc)
        return " ".join(texts)
    except Exception:
        return content

def row_to_note(row) -> dict:
    return {
        **dict(row),
        "tags": json.loads(row["tags"] or "[]"),
        "is_pinned": row["is_pinned"] == 1,
        "is_archived": row["is_archived"] == 1,
        "is_deleted": row["is_deleted"] == 1,
        "is_knowledge_base": row.get("is_knowledge_base", 0) == 1,
        "content_format": row.get("content_format", "markdown"),
    }

def get_notes(tag=None, search=None, folder_id=None, is_archived=False, is_pinned=None,
              is_knowledge_base=False, page=1, page_size=20):
    db = get_db()
    conditions = ["is_deleted = 0", f"is_archived = {1 if is_archived else 0}"]
    params = []
    if is_pinned is not None:
        conditions.append(f"is_pinned = {1 if is_pinned else 0}")
    if search:
        conditions.append("(title LIKE ? OR content_text LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if tag:
        conditions.append("EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)")
        params.append(tag)
    if folder_id == "none":
        conditions.append("folder_id IS NULL")
    elif folder_id is not None:
        conditions.append("folder_id = ?")
        params.append(folder_id)

    where = " AND ".join(conditions)
    total = db.execute(f"SELECT COUNT(*) as cnt FROM notes WHERE {where}", params).fetchone()["cnt"]
    rows = db.execute(
        f"SELECT * FROM notes WHERE {where} ORDER BY is_pinned DESC, updated_at DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size]
    ).fetchall()
    return {"items": [row_to_note(r) for r in rows], "total": total, "page": page, "pageSize": page_size}

def get_note_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM notes WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_note(row) if row else None

def create_note(folder_id: int | None = None) -> dict:
    db = get_db()
    result = db.execute(
        "INSERT INTO notes (title, content, content_text, tags, folder_id, content_format) VALUES (?, ?, ?, ?, ?, ?)",
        ("无标题", "", "", "[]", folder_id, "markdown")
    )
    return get_note_by_id(result.lastrowid)

def update_note(id: int, data: dict) -> Optional[dict]:
    db = get_db()
    existing = get_note_by_id(id)
    if not existing:
        return None

    updates = []
    params = []
    if "title" in data:
        updates.append("title = ?")
        params.append(data["title"])
    if "content" in data:
        fmt = data.get("content_format", existing["content_format"])
        updates.extend(["content = ?", "content_text = ?"])
        params.extend([data["content"], extract_text(data["content"], fmt)])
    if "tags" in data:
        updates.append("tags = ?")
        params.append(json.dumps(data["tags"]))
    if "is_pinned" in data:
        updates.append("is_pinned = ?")
        params.append(1 if data["is_pinned"] else 0)
    if "is_archived" in data:
        updates.append("is_archived = ?")
        params.append(1 if data["is_archived"] else 0)
    if "is_knowledge_base" in data:
        updates.append("is_knowledge_base = ?")
        params.append(1 if data["is_knowledge_base"] else 0)
    if "folder_id" in data:
        updates.append("folder_id = ?")
        params.append(data["folder_id"])
    if "content_format" in data:
        updates.append("content_format = ?")
        params.append(data["content_format"])

    if not updates:
        return existing

    updates.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    params.append(id)
    db.execute(f"UPDATE notes SET {', '.join(updates)} WHERE id = ?", params)

    # Trigger embedding task if kb flag changed
    if data.get("is_knowledge_base") or (data.get("is_knowledge_base") is None and existing.get("is_knowledge_base")):
        from app.services.knowledge_base import enqueue_embedding_task
        enqueue_embedding_task({"noteId": id, "action": "upsert", "timestamp": 0})

    return get_note_by_id(id)

def delete_note(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE notes SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    if result.rowcount > 0:
        from app.services.knowledge_base import enqueue_embedding_task
        enqueue_embedding_task({"noteId": id, "action": "delete", "timestamp": 0})
    return result.rowcount > 0

def get_all_note_tags() -> List[str]:
    db = get_db()
    rows = db.execute("""
        SELECT DISTINCT je.value as tag
        FROM notes n, json_each(n.tags) je
        WHERE n.is_deleted = 0
        ORDER BY tag
    """).fetchall()
    return [r["tag"] for r in rows]
```

- [ ] **Step 6: Run tests**

Run: `cd backend && uv run pytest tests/test_auth_service.py -v`
Expected: `PASS`

- [ ] **Step 7: Commit**

Run: `git add backend/app/services/auth.py backend/app/services/todos.py backend/app/services/notes.py && git commit -m "feat(backend): implement auth, todos, and notes services"`

---

## Task 6: Services (chat, settings, folders, upload, knowledge_base)

**Files:**
- Create: `backend/app/services/settings.py`
- Create: `backend/app/services/folders.py`
- Create: `backend/app/services/chat.py`
- Create: `backend/app/services/upload.py`
- Create: `backend/app/services/knowledge_base.py`

- [ ] **Step 1: Write settings service**

```python
# backend/app/services/settings.py
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
```

- [ ] **Step 2: Write folders service**

```python
# backend/app/services/folders.py
from typing import Optional, List
from app.database.connection import get_db

def row_to_folder(row) -> dict:
    return {**dict(row), "is_deleted": row["is_deleted"] == 1}

def get_folders() -> List[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM folders WHERE is_deleted = 0 ORDER BY name").fetchall()
    return [row_to_folder(r) for r in rows]

def get_folder_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM folders WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_folder(row) if row else None

def create_folder(name: str) -> dict:
    db = get_db()
    result = db.execute("INSERT INTO folders (name) VALUES (?)", (name,))
    return get_folder_by_id(result.lastrowid)

def update_folder(id: int, name: str) -> Optional[dict]:
    db = get_db()
    db.execute(
        "UPDATE folders SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (name, id)
    )
    return get_folder_by_id(id)

def delete_folder(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE folders SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    return result.rowcount > 0
```

- [ ] **Step 3: Write chat service (with SSE streaming)**

```python
# backend/app/services/chat.py
import json
from typing import Optional, List, AsyncGenerator
from app.database.connection import get_db
from app.services.settings import get_setting_value

def row_to_conversation(row) -> dict:
    return {
        **dict(row),
        "is_deleted": row["is_deleted"] == 1,
        "kb_enabled": row.get("kb_enabled", 0) == 1,
    }

def row_to_message(row) -> dict:
    return {
        **dict(row),
        "is_error": row["is_error"] == 1,
    }

def get_conversations() -> List[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM conversations WHERE is_deleted = 0 ORDER BY updated_at DESC").fetchall()
    return [row_to_conversation(r) for r in rows]

def create_conversation(title: str = "新对话", model: str = None, provider: str = None) -> dict:
    db = get_db()
    model = model or get_setting_value("default_model", "qwen-turbo")
    provider = provider or get_setting_value("default_provider", "qwen")
    kb_default = 1 if get_setting_value("kb_default_enabled", False) else 0
    result = db.execute(
        "INSERT INTO conversations (title, model, provider, kb_enabled) VALUES (?, ?, ?, ?)",
        (title, model, provider, kb_default)
    )
    return db.execute("SELECT * FROM conversations WHERE id = ?", (result.lastrowid,)).fetchone()

def get_conversation_by_id(id: int) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM conversations WHERE id = ? AND is_deleted = 0", (id,)).fetchone()
    return row_to_conversation(row) if row else None

def update_conversation(id: int, data: dict) -> Optional[dict]:
    db = get_db()
    updates = []
    params = []
    for field in ["title", "model", "provider"]:
        if field in data:
            updates.append(f"{field} = ?")
            params.append(data[field])
    if "kb_enabled" in data:
        updates.append("kb_enabled = ?")
        params.append(1 if data["kb_enabled"] else 0)
    if not updates:
        return get_conversation_by_id(id)
    updates.append("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    params.append(id)
    db.execute(f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?", params)
    return get_conversation_by_id(id)

def delete_conversation(id: int) -> bool:
    db = get_db()
    result = db.execute(
        "UPDATE conversations SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0",
        (id,)
    )
    return result.rowcount > 0

def get_messages(conversation_id: int) -> List[dict]:
    db = get_db()
    rows = db.execute(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
        (conversation_id,)
    ).fetchall()
    return [row_to_message(r) for r in rows]

def create_message(conversation_id: int, role: str, content: str, tokens_used: int = None, is_error: bool = False) -> dict:
    db = get_db()
    result = db.execute(
        "INSERT INTO messages (conversation_id, role, content, tokens_used, is_error) VALUES (?, ?, ?, ?, ?)",
        (conversation_id, role, content, tokens_used, 1 if is_error else 0)
    )
    return db.execute("SELECT * FROM messages WHERE id = ?", (result.lastrowid,)).fetchone()

def _build_sse_event(event: str, data: dict | str) -> str:
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"

async def stream_chat(conversation_id: int, user_message: str, system_prompt: str = None) -> AsyncGenerator[str, None]:
    """
    Stream chat response using SSE format compatible with the frontend.
    Events: start, delta, done, error
    """
    from openai import OpenAI
    from app.services.ai_providers import get_ai_client

    conversation = get_conversation_by_id(conversation_id)
    if not conversation:
        yield _build_sse_event("error", {"detail": "Conversation not found"})
        return

    # Insert user message
    create_message(conversation_id, "user", user_message)

    # Build messages list
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    for msg in get_messages(conversation_id):
        messages.append({"role": msg["role"], "content": msg["content"]})

    try:
        client = get_ai_client(conversation["provider"])
        yield _build_sse_event("start", {})

        response_content = ""
        # Use client.chat.completions.with_streaming_response if available,
        # otherwise fall back to synchronous streaming
        stream = client.chat.completions.create(
            model=conversation["model"],
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                response_content += delta
                yield _build_sse_event("delta", {"content": delta})

        # Save assistant message
        create_message(conversation_id, "assistant", response_content)
        yield _build_sse_event("done", {"content": response_content})

    except Exception as e:
        create_message(conversation_id, "assistant", str(e), is_error=True)
        yield _build_sse_event("error", {"detail": str(e)})
```

- [ ] **Step 4: Write ai_providers helper (needed by chat service)**

```python
# backend/app/services/ai_providers.py
from openai import OpenAI
from app.services.settings import get_setting_value

AI_PROVIDERS = {
    "qwen": {"baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    "deepseek": {"baseURL": "https://api.deepseek.com/v1"},
    "openai": {"baseURL": "https://api.openai.com/v1"},
    "custom": {"baseURL": ""},
}

EMBEDDING_DIMENSIONS = {
    "text-embedding-v2": 1536,
    "text-embedding-v3": 1536,
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    "deepseek-embedder": 1024,
}

def get_ai_client(provider: str) -> OpenAI:
    provider_config = AI_PROVIDERS.get(provider, AI_PROVIDERS["qwen"])
    ai_providers: dict = get_setting_value("ai_providers", {})
    provider_settings = ai_providers.get(provider, {})
    api_key = provider_settings.get("apiKey") or "sk-placeholder"
    base_url = provider if provider == "custom" else provider_config.get("baseURL", "")
    return OpenAI(api_key=api_key, base_url=base_url)

def get_embedding_client(provider: str):
    return get_ai_client(provider)
```

- [ ] **Step 5: Write upload service**

```python
# backend/app/services/upload.py
import os
import uuid
import aiofiles
from pathlib import Path
from fastapi import UploadFile
from app.services.settings import get_setting_value

UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"

def ensure_uploads_dir() -> None:
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

async def save_uploaded_file(file: UploadFile) -> dict:
    ensure_uploads_dir()
    ext = Path(file.filename).suffix.lower() or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = UPLOADS_DIR / filename
    content = await file.read()
    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)
    return {"url": f"/uploads/{filename}", "filename": filename}

def delete_file(filename: str) -> bool:
    filepath = UPLOADS_DIR / filename
    if filepath.exists():
        filepath.unlink()
        return True
    return False

def file_exists(filename: str) -> bool:
    return (UPLOADS_DIR / filename).exists()

def parse_images_from_content(content: str) -> list[str]:
    import re
    return re.findall(r"!\[.*?\]\(/uploads/([^)]+)\)", content)

def get_note_images(note_id: int, content: str) -> list[dict]:
    used = parse_images_from_content(content)
    return [
        {"filename": f, "url": f"/uploads/{f}", "used_in_content": True}
        for f in used if file_exists(f)
    ]
```

- [ ] **Step 6: Write knowledge_base service**

```python
# backend/app/services/knowledge_base.py
import asyncio
import json
from typing import List
from app.database.connection import get_db
from app.services.settings import get_setting_value

# In-memory embedding task queue (same behavior as TS version)
_embedding_queue: list = []
_processing = False

def enqueue_embedding_task(task: dict) -> None:
    _embedding_queue.append(task)
    asyncio.create_task(_process_embedding_queue())

async def _process_embedding_queue() -> None:
    global _processing
    if _processing:
        return
    _processing = True
    while _embedding_queue:
        task = _embedding_queue.pop(0)
        try:
            await _process_task(task)
        except Exception as e:
            print(f"[Embedding Queue] Error: {e}")
    _processing = False

async def _process_task(task: dict) -> None:
    from app.services.ai_providers import get_embedding_client
    from app.services.vector import upsert_chunks, delete_chunks_by_note_id

    note_id = task["noteId"]
    action = task["action"]

    if action == "delete":
        await delete_chunks_by_note_id(note_id)
        return

    # Fetch note
    db = get_db()
    row = db.execute("SELECT * FROM notes WHERE id = ? AND is_deleted = 0", (note_id,)).fetchone()
    if not row:
        return

    title = row["title"]
    content = row["content_text"] or ""
    tags = json.loads(row["tags"] or "[]")
    folder_id = row["folder_id"]
    created_at = row["created_at"]

    if not content.strip():
        return

    # Split into chunks (simple ~500 char chunks)
    chunks = []
    chunk_size = 500
    for i in range(0, len(content), chunk_size):
        chunk_text = content[i:i+chunk_size]
        chunk_id = f"{note_id}_{i // chunk_size}"
        chunks.append({
            "id": chunk_id,
            "text": chunk_text,
            "note_id": note_id,
            "title": title,
            "content": chunk_text,
            "tags": tags,
            "folder_id": folder_id,
            "created_at": created_at,
        })

    if not chunks:
        return

    provider = get_setting_value("embedding_provider", "qwen")
    model = get_setting_value("embedding_model", "text-embedding-v2")

    try:
        client = get_embedding_client(provider)
        vectors = []
        for chunk in chunks:
            resp = client.embeddings.create(model=model, input=chunk["text"])
            vectors.append(resp.data[0].embedding)

        await upsert_chunks([
            {"id": c["id"], "vector": v, "payload": {k: c[k] for k in ["note_id", "title", "content", "tags", "folder_id", "created_at"]}}
            for c, v in zip(chunks, vectors)
        ])
    except Exception as e:
        print(f"[Knowledge Base] Embedding failed: {e}")
```

- [ ] **Step 7: Write vector service (Qdrant integration)**

```python
# backend/app/services/vector.py
import httpx
from typing import List
from app.services.settings import get_setting_value

async def qdrant_request(path: str, method: str = "GET", body: dict = None) -> dict:
    url = get_setting_value("qdrant_url", "http://localhost:6333")
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.request(method, f"{url}{path}", json=body)
        if not resp.is_success:
            raise Exception(f"Qdrant {method} {path} failed: {resp.status_code} {resp.text}")
        return resp.json()

async def upsert_chunks(chunks: List[dict]) -> None:
    if not chunks:
        return
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    for i in range(0, len(chunks), 9):
        batch = chunks[i:i+9]
        await qdrant_request(f"/collections/{collection}/points", "PUT", {
            "points": [{"id": c["id"], "vector": c["vector"], "payload": c["payload"]} for c in batch]
        })

async def search_chunks(query_vector: List[float], top_k: int) -> List[dict]:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    threshold = get_setting_value("kb_score_threshold", 0.5)
    result = await qdrant_request(f"/collections/{collection}/points/search", "POST", {
        "vector": query_vector,
        "limit": top_k,
        "score_threshold": threshold,
        "with_payload": True,
    })
    return [
        {
            "chunk_id": r["payload"]["chunk_id"],
            "note_id": r["payload"]["note_id"],
            "title": r["payload"]["title"],
            "content": r["payload"]["content"],
            "tags": r["payload"].get("tags", []),
            "score": r["score"],
        }
        for r in (result.get("result") or [])
    ]

async def delete_chunks_by_note_id(note_id: int) -> None:
    collection = get_setting_value("qdrant_collection", "notes_knowledge_base")
    await qdrant_request(f"/collections/{collection}/points/delete", "POST", {
        "filter": {"must": [{"key": "note_id", "match": {"value": note_id}}]}
    })
```

- [ ] **Step 8: Commit**

Run: `git add backend/app/services/settings.py backend/app/services/folders.py backend/app/services/chat.py backend/app/services/upload.py backend/app/services/knowledge_base.py backend/app/services/ai_providers.py backend/app/services/vector.py && git commit -m "feat(backend): implement remaining services (chat SSE, settings, folders, upload, knowledge base)"`

---

## Task 7: Routes (所有 API 端点)

**Files:**
- Create: `backend/app/routes/auth.py`
- Create: `backend/app/routes/todos.py`
- Create: `backend/app/routes/notes.py`
- Create: `backend/app/routes/chat.py`
- Create: `backend/app/routes/settings.py`
- Create: `backend/app/routes/folders.py`
- Create: `backend/app/routes/upload.py`
- Create: `backend/app/routes/knowledge_base.py`

- [ ] **Step 1: Write auth routes**

```python
# backend/app/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from app.middleware.auth import auth_dependency
from app.services.auth import needs_setup, setup_password, login
from app.models.auth import LoginRequest, SetupRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/setup", response_model=TokenResponse)
async def api_setup(req: SetupRequest, user: dict = Depends(auth_dependency)):
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

@router.get("/check")
async def api_check(user: dict = Depends(auth_dependency)):
    return {"ok": True}
```

- [ ] **Step 2: Write todos routes**

```python
# backend/app/routes/todos.py
from fastapi import APIRouter, Depends, Query
from app.middleware.auth import auth_dependency
from app.services.todos import (
    get_todos, get_todo_by_id, create_todo, update_todo,
    delete_todo, get_all_todo_tags, get_todo_counts,
    get_pending_count, get_urgent_count,
)
from app.models.todo import TodoCreate, TodoUpdate, Todo, TodoListResponse, TodoCounts

router = APIRouter(prefix="/api/todos", tags=["todos"])

@router.get("", response_model=TodoListResponse)
async def list_todos(
    status: str = None, priority: str = None, type_: str = None,
    tag: str = None, search: str = None,
    page: int = Query(1), pageSize: int = Query(20),
    user: dict = Depends(auth_dependency),
):
    return get_todos(status=status, priority=priority, type_=type_, tag=tag, search=search, page=page, page_size=pageSize)

@router.post("", response_model=Todo)
async def create(data: TodoCreate, user: dict = Depends(auth_dependency)):
    return create_todo(data.model_dump())

@router.get("/tags", response_model=list[str])
async def list_tags(user: dict = Depends(auth_dependency)):
    return get_all_todo_tags()

@router.get("/counts", response_model=TodoCounts)
async def counts(user: dict = Depends(auth_dependency)):
    return get_todo_counts()

@router.get("/pending-count")
async def pending_count(user: dict = Depends(auth_dependency)):
    return {"count": get_pending_count()}

@router.get("/urgent-count")
async def urgent_count(user: dict = Depends(auth_dependency)):
    return {"count": get_urgent_count()}

@router.get("/{todo_id}", response_model=Todo)
async def get_one(todo_id: int, user: dict = Depends(auth_dependency)):
    result = get_todo_by_id(todo_id)
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.put("/{todo_id}", response_model=Todo)
async def update(todo_id: int, data: TodoUpdate, user: dict = Depends(auth_dependency)):
    result = update_todo(todo_id, data.model_dump(exclude_unset=True))
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{todo_id}")
async def delete(todo_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_todo(todo_id)
    if not deleted:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}
```

- [ ] **Step 3: Write notes routes**

```python
# backend/app/routes/notes.py
from fastapi import APIRouter, Depends, Query
from app.middleware.auth import auth_dependency
from app.services.notes import (
    get_notes, get_note_by_id, create_note, update_note,
    delete_note, get_all_note_tags,
)
from app.models.note import NoteCreate, NoteUpdate, Note, NoteListResponse

router = APIRouter(prefix="/api/notes", tags=["notes"])

@router.get("", response_model=NoteListResponse)
async def list_notes(
    tag: str = None, search: str = None,
    folder_id: str = Query(None),  # can be "none" or int
    is_archived: bool = False, is_pinned: bool = None,
    page: int = Query(1), pageSize: int = Query(20),
    user: dict = Depends(auth_dependency),
):
    # folder_id "none" -> string, otherwise parse int
    f_id = folder_id
    if folder_id and folder_id != "none":
        try:
            f_id = int(folder_id)
        except ValueError:
            f_id = None
    return get_notes(tag=tag, search=search, folder_id=f_id, is_archived=is_archived, is_pinned=is_pinned, page=page, page_size=pageSize)

@router.post("", response_model=Note)
async def create(data: NoteCreate, user: dict = Depends(auth_dependency)):
    return create_note(folder_id=data.folder_id)

@router.get("/tags", response_model=list[str])
async def list_tags(user: dict = Depends(auth_dependency)):
    return get_all_note_tags()

@router.get("/{note_id}", response_model=Note)
async def get_one(note_id: int, user: dict = Depends(auth_dependency)):
    result = get_note_by_id(note_id)
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.put("/{note_id}", response_model=Note)
async def update(note_id: int, data: NoteUpdate, user: dict = Depends(auth_dependency)):
    result = update_note(note_id, data.model_dump(exclude_unset=True))
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{note_id}")
async def delete(note_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_note(note_id)
    if not deleted:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}
```

- [ ] **Step 4: Write chat routes (with SSE streaming)**

```python
# backend/app/routes/chat.py
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from app.middleware.auth import auth_dependency
from app.services.chat import (
    get_conversations, create_conversation, get_conversation_by_id,
    update_conversation, delete_conversation, get_messages, stream_chat,
)
from app.models.chat import ConversationCreate, ConversationUpdate, Conversation, Message, ChatStreamRequest

router = APIRouter(prefix="/api/conversations", tags=["chat"])

@router.get("", response_model=list[Conversation])
async def list_convs(user: dict = Depends(auth_dependency)):
    return get_conversations()

@router.post("", response_model=Conversation)
async def create(data: ConversationCreate, user: dict = Depends(auth_dependency)):
    return create_conversation(title=data.title, model=data.model, provider=data.provider)

@router.get("/{conv_id}", response_model=Conversation)
async def get_one(conv_id: int, user: dict = Depends(auth_dependency)):
    result = get_conversation_by_id(conv_id)
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.put("/{conv_id}", response_model=Conversation)
async def update(conv_id: int, data: ConversationUpdate, user: dict = Depends(auth_dependency)):
    result = update_conversation(conv_id, data.model_dump(exclude_unset=True))
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{conv_id}")
async def delete(conv_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_conversation(conv_id)
    if not deleted:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}

@router.get("/{conv_id}/messages", response_model=list[Message])
async def messages(conv_id: int, user: dict = Depends(auth_dependency)):
    return get_messages(conv_id)

@router.post("/{conv_id}/stream")
async def stream(conv_id: int, data: ChatStreamRequest, user: dict = Depends(auth_dependency)):
    return StreamingResponse(
        stream_chat(conv_id, data.message, data.system_prompt),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 5: Write settings, folders, upload, knowledge_base routes**

```python
# backend/app/routes/settings.py
from fastapi import APIRouter, Depends
from app.middleware.auth import auth_dependency
from app.services.settings import get_all_settings, set_setting
from app.models.settings import SettingsValue

router = APIRouter(prefix="/api/settings", tags=["settings"])

@router.get("")
async def get_settings(user: dict = Depends(auth_dependency)):
    return get_all_settings()

@router.put("/{key}")
async def put_setting(key: str, body: dict, user: dict = Depends(auth_dependency)):
    set_setting(key, body.get("value"))
    return {"ok": True}
```

```python
# backend/app/routes/folders.py
from fastapi import APIRouter, Depends
from app.middleware.auth import auth_dependency
from app.services.folders import get_folders, get_folder_by_id, create_folder, update_folder, delete_folder
from app.models.folder import FolderCreate, Folder

router = APIRouter(prefix="/api/folders", tags=["folders"])

@router.get("", response_model=list[Folder])
async def list_(user: dict = Depends(auth_dependency)):
    return get_folders()

@router.post("", response_model=Folder)
async def create(data: FolderCreate, user: dict = Depends(auth_dependency)):
    return create_folder(data.name)

@router.put("/{folder_id}", response_model=Folder)
async def update(folder_id: int, data: FolderCreate, user: dict = Depends(auth_dependency)):
    result = update_folder(folder_id, data.name)
    if not result:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return result

@router.delete("/{folder_id}")
async def delete(folder_id: int, user: dict = Depends(auth_dependency)):
    deleted = delete_folder(folder_id)
    if not deleted:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return {"ok": True}
```

```python
# backend/app/routes/upload.py
from fastapi import APIRouter, Depends, UploadFile, File
from app.middleware.auth import auth_dependency
from app.services.upload import save_uploaded_file, delete_file, file_exists, get_note_images
from app.models.upload import UploadResponse

router = APIRouter(prefix="/api/upload", tags=["upload"])

@router.post("", response_model=UploadResponse)
async def upload(file: UploadFile = File(...), user: dict = Depends(auth_dependency)):
    return await save_uploaded_file(file)

@router.delete("/{filename}")
async def delete(filename: str, user: dict = Depends(auth_dependency)):
    deleted = delete_file(filename)
    return {"ok": deleted}

@router.get("/note-images/{note_id}")
async def note_images(note_id: int, content: str = "", user: dict = Depends(auth_dependency)):
    return get_note_images(note_id, content)
```

```python
# backend/app/routes/knowledge_base.py
from fastapi import APIRouter, Depends
from app.middleware.auth import auth_dependency
from app.services.knowledge_base import get_collection_stats, rebuild_all_embeddings
from app.services.vector import get_collection_info

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])

@router.get("/stats")
async def stats(user: dict = Depends(auth_dependency)):
    info = await get_collection_info()
    return {"points_count": info["points_count"]}

@router.post("/rebuild")
async def rebuild(user: dict = Depends(auth_dependency)):
    count = await rebuild_all_embeddings()
    return {"rebuilt": count}
```

- [ ] **Step 6: Add get_collection_stats and rebuild_all_embeddings to knowledge_base service**

Add these helper functions to `backend/app/services/knowledge_base.py`:

```python
# Add to knowledge_base.py

async def get_collection_stats() -> dict:
    try:
        info = await get_collection_info()
        return {"points_count": info["points_count"]}
    except Exception:
        return {"points_count": 0}

async def rebuild_all_embeddings() -> int:
    """Re-embed all notes marked as knowledge_base."""
    db = get_db()
    rows = db.execute("SELECT id FROM notes WHERE is_deleted = 0 AND is_knowledge_base = 1").fetchall()
    for row in rows:
        enqueue_embedding_task({"noteId": row["id"], "action": "upsert", "timestamp": 0})
    return len(rows)
```

- [ ] **Step 7: Commit**

Run: `git add backend/app/routes/ && git commit -m "feat(backend): implement all API routes"`

---

## Task 8: Main.py 入口

**Files:**
- Create: `backend/app/main.py`

- [ ] **Step 1: Write main.py**

```python
# backend/app/main.py
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database.migrations import run_migrations
from app.middleware.error import register_error_handlers

# Load .env from project root
project_root = Path(__file__).parent.parent
load_dotenv(project_root / ".env")

PORT = int(os.getenv("PORT", 3000))
IS_PRODUCTION = os.getenv("NODE_ENV", "development") == "production"

# Initialize DB and run migrations
run_migrations()

app = FastAPI(title="OnePlace API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173"] if not IS_PRODUCTION else True,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register error handlers
register_error_handlers(app)

# Health check
@app.get("/api/health")
async def health():
    from app.database.connection import get_db
    try:
        db = get_db()
        db.execute("SELECT 1").fetchone()
        return {"status": "ok", "db": "connected"}
    except Exception:
        return {"status": "error", "db": "disconnected"}

# Import and include routers
from app.routes.auth import router as auth_router
from app.routes.todos import router as todos_router
from app.routes.notes import router as notes_router
from app.routes.chat import router as chat_router
from app.routes.settings import router as settings_router
from app.routes.folders import router as folders_router
from app.routes.upload import router as upload_router
from app.routes.knowledge_base import router as knowledge_base_router

app.include_router(auth_router)
app.include_router(todos_router)
app.include_router(notes_router)
app.include_router(chat_router)
app.include_router(settings_router)
app.include_router(folders_router)
app.include_router(upload_router)
app.include_router(knowledge_base_router)

# Static file serving for uploads
uploads_path = project_root / "uploads"
if uploads_path.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, reload=not IS_PRODUCTION)
```

- [ ] **Step 2: Verify app starts without import errors**

Run: `cd backend && uv run python -c "from app.main import app; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

Run: `git add backend/app/main.py && git commit -m "feat(backend): add FastAPI main.py entry point"`

---

## Task 9: conftest.py 和基础测试

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Write conftest.py**

```python
# backend/tests/conftest.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import reset_db

@pytest.fixture(autouse=True)
def fresh_db():
    reset_db()
    yield
```

- [ ] **Step 2: Commit**

Run: `git add backend/tests/conftest.py && git commit -m "test(backend): add pytest conftest with fresh DB fixture"`

---

## 执行顺序总结

| Task | 内容 | 依赖 |
|------|------|------|
| 1 | 项目脚手架 | - |
| 2 | 数据库连接 + 迁移 | Task 1 |
| 3 | Middleware | Task 1 |
| 4 | Pydantic Models | Task 1 |
| 5 | Services (auth/todos/notes) | Task 2, 3 |
| 6 | Services (chat/settings/folders/upload/kb) | Task 3, 4 |
| 7 | Routes | Task 5, 6 |
| 8 | Main.py | Task 7 |
| 9 | 测试配置 | Task 2 |
