# backend/tests/conftest.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.database.connection import reset_db

@pytest.fixture(autouse=True)
def fresh_db():
    """Reset database before each test to ensure isolation."""
    reset_db()
    yield
