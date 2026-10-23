"""Shared test setup: keep the suite offline regardless of a developer's local .env."""

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _offline_by_default(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", None)
    monkeypatch.setattr(settings, "PROCESSING_MODE", "offline")
