# Python FastAPI 后端重构设计

## 概述

将 OnePlace 的 Express/TypeScript 后端完整重写为 Python/FastAPI，保持 API 完全兼容，前端无需修改。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 框架 | FastAPI | ASGI，自动 OpenAPI 文档 |
| 包管理 | uv | Python 包管理 + 运行时 |
| 数据库 | sqlite3（Python 内置）| 复用现有 `.db` 文件 |
| 认证 | pyjwt + bcrypt | 兼容现有 JWT 30 天过期 |
| 验证 | Pydantic | 请求/响应数据校验 |
| 向量 | qdrant-client | 复用现有向量服务 |
| AI | openai SDK | 复用现有 AI 路由 |
| SSE | FastAPI StreamingResponse | 替代 Express SSE |
| CORS | FastAPI CORSMiddleware | 配置与原版一致 |

## 项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI 应用入口
│   ├── database/
│   │   ├── connection.py       # SQLite 单例连接
│   │   └── migrations.py        # 启动时执行 SQL 迁移
│   ├── middleware/
│   │   ├── auth.py              # JWT 认证
│   │   └── error.py             # 全局异常处理
│   ├── models/                  # Pydantic 模型
│   │   ├── auth.py
│   │   ├── todo.py
│   │   ├── note.py
│   │   ├── chat.py
│   │   ├── folder.py
│   │   ├── upload.py
│   │   └── settings.py
│   ├── routes/
│   │   ├── auth.py              # /api/auth/*
│   │   ├── todos.py             # /api/todos/*
│   │   ├── notes.py             # /api/notes/*
│   │   ├── chat.py              # /api/conversations/*
│   │   ├── settings.py          # /api/settings/*
│   │   ├── folders.py           # /api/folders/*
│   │   ├── upload.py            # /api/upload/*
│   │   └── knowledge_base.py    # /api/knowledge-base/*
│   └── services/                # 业务逻辑
│       ├── auth.py
│       ├── todos.py
│       ├── notes.py
│       ├── chat.py
│       ├── settings.py
│       ├── folders.py
│       ├── upload.py
│       └── knowledge_base.py
├── tests/
├── pyproject.toml
└── .env
```

**与现有 TS 结构的对应关系：**
- `server/src/` → `backend/app/`
- `routes/*.ts` → `routes/*.py`
- `services/*.ts` → `services/*.py`
- `controllers/*.ts` → 直接合并到 routes（FastAPI 风格不需要独立 controller 层）

## API 兼容性

所有端点保持路径、请求/响应格式与现有完全一致，前端无需任何修改。

### 路由对照表

| 现有路由 | 新路由 |
|---------|--------|
| `POST /api/auth/setup` | `POST /api/auth/setup` |
| `POST /api/auth/login` | `POST /api/auth/login` |
| `GET /api/todos` | `GET /api/todos` |
| `POST /api/todos` | `POST /api/todos` |
| `PUT /api/todos/:id` | `PUT /api/todos/:id` |
| `DELETE /api/todos/:id` | `DELETE /api/todos/:id`（软删除）|
| `GET /api/notes` | `GET /api/notes` |
| `POST /api/notes` | `POST /api/notes` |
| `PUT /api/notes/:id` | `PUT /api/notes/:id` |
| `DELETE /api/notes/:id` | `DELETE /api/notes/:id`（软删除）|
| `GET /api/conversations` | `GET /api/conversations` |
| `POST /api/conversations` | `POST /api/conversations` |
| `PUT /api/conversations/:id` | `PUT /api/conversations/:id` |
| `DELETE /api/conversations/:id` | `DELETE /api/conversations/:id`（软删除）|
| `POST /api/conversations/:id/stream` | `POST /api/conversations/:id/stream`（SSE）|
| `/api/settings/*` | `/api/settings/*` |
| `/api/folders/*` | `/api/folders/*` |
| `/api/upload/*` | `/api/upload/*` |
| `/api/knowledge-base/*` | `/api/knowledge-base/*` |

## 核心设计决策

### 1. 路由 → Service 分层

每条路由直接调用 service 层函数，不另加 controller 层。路由函数仅负责：路径参数解析、调用 service、返回响应。

### 2. SQLite 连接管理

- 模块级单例，懒加载（与原 TS 行为一致）
- `DB_PATH` 通过 `Path(__file__).parent.parent.parent` 向上解析获取项目根目录
- 不使用 `process.cwd()`（避免工作目录差异）

### 3. JWT 认证

- 使用 `pyjwt`，与现有 JWT 格式完全兼容
- `sub: "user"` claims 保持一致
- `expiresIn: 30d` 保持一致
- 前端 `localStorage.oneplace_token` 无需修改

### 4. SSE 流式输出（Chat）

- FastAPI `StreamingResponse` 推送与原 TS 等价的 event 格式：
  - `event: start`
  - `event: delta`
  - `event: done`
  - `event: error`
- 前端 stream 解析逻辑无需修改

### 5. 软删除

所有查询强制携带 `WHERE is_deleted = 0` 条件，`DELETE` 操作执行 `UPDATE is_deleted = 1`。

### 6. JSON 标签

标签存储为 JSON 数组字符串，使用 SQLite `json_each()` 函数查询，语法与 TS 版本完全一致。

### 7. Tiptap JSON → 纯文本提取

`notes.service` 中 `extract_text()` 函数将 Tiptap JSON 解析为纯文本，用于 `content_text` 字段（全文搜索），与原 TS 实现一致。

### 8. 向量嵌入排队

`knowledge_base.service` 的 embedding 任务通过内存队列处理（与原 TS 一致），调用 `embedText` 和 `searchChunks`。

## 数据库迁移策略

复用现有 SQL 文件（`001_initial_schema.sql` 等），将 better-sqlite3 语法翻译为 Python `sqlite3`：

- `strftime('%Y-%m-%dT%H:%M:%fZ','now')` — 完全一致
- `json_each()` — SQLite 内置，完全兼容
- `ON CONFLICT DO UPDATE` — SQLite UPSERT 语法，两端一致

## 启动与运行

```bash
# 安装依赖
uv sync

# 开发模式
uv run uvicorn app.main:app --reload --port 3000

# 生产模式
uv run uvicorn app.main:app --host 0.0.0.0 --port 3000
```

## 环境变量

```bash
PORT=3000
DB_PATH=./data/oneplace.db    # 相对于项目根目录
JWT_SECRET=...                 # 必须修改
JWT_EXPIRES_IN=30d
```

## pyproject.toml 依赖

```toml
[project]
requires-python = ">=3.11"
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "python-multipart",
    "pyjwt",
    "bcrypt",
    "python-dotenv",
    "qdrant-client",
    "openai",
    "aiofiles",
]
```
