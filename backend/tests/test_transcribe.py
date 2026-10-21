"""Tests for audio transcription module and /draft/voice endpoint."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import pytest

from app.config import settings
from app.main import app
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem
from app.transcribe import TranscriptionError, clean_whisper_output, transcribe_audio


def test_clean_whisper_output():
    raw = """
read_audio_data: reading audio data from 'test.wav' ...
system_info: n_threads = 4
[00:00:00.000 --> 00:00:05.000] 14:32 gave aspirin 324 mg PO chewed.
whisper_print_timings: load time = 100 ms
"""
    cleaned = clean_whisper_output(raw)
    assert cleaned == "14:32 gave aspirin 324 mg PO chewed."


def test_transcribe_audio_missing_file():
    with pytest.raises(TranscriptionError, match="Audio file not found"):
        transcribe_audio("/path/to/nonexistent/file.wav")


def test_transcribe_audio_live():
    sample_wav = settings.ROOT_DIR / "whisper.cpp" / "samples" / "jfk.wav"
    if not sample_wav.exists() or not settings.WHISPER_CLI_PATH.exists():
        pytest.skip("whisper.cpp or sample audio not available")

    text, elapsed_ms = transcribe_audio(sample_wav)
    assert "fellow Americans" in text
    assert elapsed_ms > 0


def test_draft_voice_endpoint_mocked():
    client = TestClient(app)

    mock_extract = ExtractionResult(
        medications=[
            MedicationItem(
                time="14:32",
                drug="aspirin",
                dose_value=324.0,
                dose_unit="mg",
                route="PO",
                source_text="14:32 gave aspirin 324 mg PO chewed",
            )
        ],
        procedures=[],
    )

    with patch("app.main.transcribe_audio") as mock_transcribe, \
         patch("app.main.extract_clinical_data") as mock_ext:
        mock_transcribe.return_value = ("14:32 gave aspirin 324 mg PO chewed", 450)
        mock_ext.return_value = (mock_extract, 1200)

        fake_audio_bytes = b"RIFF....WAVEfmt ...."
        response = client.post(
            "/draft/voice",
            files={"file": ("dictation.wav", fake_audio_bytes, "audio/wav")},
            data={"encounter_id": "ENC-TEST-VOICE"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["input_type"] == "voice"
        assert data["encounter_id"] == "ENC-TEST-VOICE"
        assert "aspirin" in data["raw_text"]
        assert data["timings_ms"]["transcribe"] == 450
        assert data["timings_ms"]["extract"] == 1200
        assert data["timings_ms"]["validate"] >= 1
        assert data["bundle"]["resourceType"] == "Bundle"


def test_draft_voice_empty_file_rejected():
    client = TestClient(app)
    response = client.post(
        "/draft/voice",
        files={"file": ("empty.wav", b"", "audio/wav")},
    )
    assert response.status_code == 422
