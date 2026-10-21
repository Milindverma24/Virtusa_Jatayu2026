"""Tests for configuration, database health, and the /health endpoint."""

from pathlib import Path
from fastapi.testclient import TestClient
import pytest

from app.config import settings
from app.db import check_db_health, get_db_connection
from app.main import app


def test_config_defaults() -> None:
    """Settings should load sensible offline defaults."""
    assert settings.HOST == "127.0.0.1"
    assert settings.LLM_MODEL == "minimax-m3.1-flash:cloud"
    assert settings.LLM_TEMPERATURE == 0.0
    assert settings.ACTIVE_PROMPT_VERSION == "extract-v1.0"
    assert settings.PROMPTS_DIR.exists()


def test_sqlite_health_check(tmp_path: Path) -> None:
    """Database health check must work with a clean SQLite instance."""
    test_db = tmp_path / "test_audit.db"
    assert check_db_health(test_db) is True

    # Check WAL and foreign keys enabled
    conn = get_db_connection(test_db)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys;")
    fk = cursor.fetchone()[0]
    cursor.execute("PRAGMA journal_mode;")
    jm = cursor.fetchone()[0]
    conn.close()

    assert fk == 1
    assert jm.lower() == "wal"


def test_health_endpoint() -> None:
    """The /health endpoint must return valid status structure."""
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        payload = response.json()

        assert "status" in payload
        assert "ollama_running" in payload
        assert "database_connected" in payload
        assert payload["database_connected"] is True
        assert payload["active_prompt_version"] == "extract-v1.0"
        assert payload["model_name"] == settings.LLM_MODEL
