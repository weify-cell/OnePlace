# backend/app/main.py
import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Load .env from project root
project_root = Path(__file__).parent.parent
load_dotenv(project_root / ".env")

PORT = int(os.getenv("PORT", 3000))
IS_PRODUCTION = os.getenv("NODE_ENV", "development") == "production"

# Initialize database and run migrations BEFORE creating the app
from app.database.migrations import run_migrations
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
from app.middleware.error import register_error_handlers
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
    app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, reload=not IS_PRODUCTION)
