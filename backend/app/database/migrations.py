# backend/app/database/migrations.py
from pathlib import Path
from app.database.connection import get_db

# Look for migrations in project root (server/src/database/migrations/)
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "server" / "src" / "database" / "migrations"


def run_migrations() -> None:
    """Run all unapplied SQL migration files in filename order."""
    if not MIGRATIONS_DIR.exists():
        print(f"[WARN] Migrations directory not found: {MIGRATIONS_DIR}")
        return

    db = get_db()

    # Ensure _migrations tracking table exists
    db.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        )
    """)

    applied = {row["name"] for row in db.execute("SELECT name FROM _migrations").fetchall()}

    # If _migrations table has entries, sync all known migration names
    # (Node.js backend ran migrations before Python — skip them all)
    if applied:
        known_migrations = [f.name for f in sorted(MIGRATIONS_DIR.glob("*.sql"))]
        for name in known_migrations:
            db.execute("INSERT OR IGNORE INTO _migrations (name) VALUES (?)", (name,))
        db.commit()
        print(f"[Migration] Skipping {len(known_migrations)} migrations already applied by Node.js backend")
        return

    migration_files = sorted(f for f in MIGRATIONS_DIR.glob("*.sql") if f.name not in applied)

    for migration_file in migration_files:
        print(f"[Migration] Running: {migration_file.name}")
        sql = migration_file.read_text(encoding="utf-8")
        db.executescript(sql)
        db.execute("INSERT OR IGNORE INTO _migrations (name) VALUES (?)", (migration_file.name,))
        db.commit()
        print(f"[Migration] Done: {migration_file.name}")