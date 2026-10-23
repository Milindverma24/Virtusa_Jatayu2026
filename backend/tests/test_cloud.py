"""Online (Groq) / offline (local) routing. Groq is mocked; nothing touches the network."""

import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import httpx
import pytest

from app import cloud
from app.config import settings
from app.extract import OllamaServiceError
from app.main import app

NOTE = "14:32 gave aspirin 324 mg PO chewed."

GROQ_JSON = json.dumps(
    {
        "medications": [
            {
                "time": "14:32",
                "drug": "aspirin",
                "dose_value": 324,
                "dose_unit": "mg",
                "route": "PO",
                "source_text": "14:32 gave aspirin 324 mg PO chewed",
            }
        ],
        "procedures": [],
    }
)


def _groq_response(content: str) -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"choices": [{"message": {"content": content}}]}
    return resp


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", "test-key")
    monkeypatch.setattr(settings, "PROCESSING_MODE", "auto")


def test_resolve_mode_without_key_is_offline(monkeypatch):
    monkeypatch.setattr(settings, "GROQ_API_KEY", None)
    assert cloud.resolve_mode("online") == cloud.OFFLINE
    assert cloud.resolve_mode(None) == cloud.OFFLINE


def test_resolve_mode_header_overrides_default(with_key):
    assert cloud.resolve_mode(None) == cloud.ONLINE
    assert cloud.resolve_mode("offline") == cloud.OFFLINE
    assert cloud.resolve_mode("ONLINE") == cloud.ONLINE


def test_server_offline_setting_is_respected(with_key, monkeypatch):
    monkeypatch.setattr(settings, "PROCESSING_MODE", "offline")
    assert cloud.resolve_mode(None) == cloud.OFFLINE
    assert cloud.resolve_mode("online") == cloud.ONLINE


def test_online_uses_groq(client, with_key):
    with patch("app.cloud.httpx.post", return_value=_groq_response(GROQ_JSON)) as post:
        res = client.post("/draft/text", json={"text": NOTE}, headers={"X-Processing-Mode": "online"})
    assert res.status_code == 200
    body = res.json()
    assert body["model"]["name"] == f"groq/{settings.GROQ_LLM_MODEL}"
    assert body["bundle"]["entry"][0]["resource"]["resourceType"] == "MedicationAdministration"
    assert post.called
    assert post.call_args.kwargs["headers"]["Authorization"] == "Bearer test-key"


def test_online_falls_back_to_local_when_groq_fails(client, with_key):
    with patch("app.cloud.httpx.post", side_effect=httpx.ConnectError("no network")), patch(
        "app.main.extract_clinical_data", side_effect=OllamaServiceError("down")
    ), patch("app.main.generate_clinical_summary", return_value="summary"):
        res = client.post("/draft/text", json={"text": NOTE}, headers={"X-Processing-Mode": "online"})
    assert res.status_code == 200
    assert res.json()["model"]["name"] == "rule-based"


def test_offline_header_never_calls_groq(client, with_key):
    with patch("app.cloud.httpx.post") as post, patch(
        "app.main.extract_clinical_data", side_effect=OllamaServiceError("down")
    ), patch("app.main.generate_clinical_summary", return_value="summary"):
        res = client.post("/draft/text", json={"text": NOTE}, headers={"X-Processing-Mode": "offline"})
    assert res.status_code == 200
    post.assert_not_called()


def test_groq_retries_once_on_invalid_json(with_key):
    bad = _groq_response("not json at all")
    good = _groq_response(GROQ_JSON)
    with patch("app.cloud.httpx.post", side_effect=[bad, good]) as post:
        result, _ = cloud.extract_clinical_data(NOTE)
    assert post.call_count == 2
    assert result.medications[0].drug == "aspirin"


def test_groq_invalid_json_twice_raises(with_key):
    with patch("app.cloud.httpx.post", return_value=_groq_response("nope")):
        with pytest.raises(cloud.CloudError):
            cloud.extract_clinical_data(NOTE)


def test_voice_online_uses_groq_transcript(client, with_key):
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"text": NOTE}
    with patch("app.cloud.httpx.post", side_effect=[resp, _groq_response(GROQ_JSON), _groq_response("Aspirin given.")]):
        res = client.post(
            "/draft/voice",
            files={"file": ("note.wav", b"RIFF0000WAVEfmt ", "audio/wav")},
            headers={"X-Processing-Mode": "online"},
        )
    assert res.status_code == 200
    body = res.json()
    assert body["input_type"] == "voice"
    assert body["raw_text"] == NOTE
    assert body["model"]["name"].startswith("groq/")
