"""Tests for clinical data extraction, schemas, retry logic, and Example A validation."""

import json
from pathlib import Path
from unittest.mock import MagicMock
import httpx
import pytest

from app.config import settings
from app.extract import (
    ExtractionError,
    OllamaServiceError,
    _parse_llm_json,
    extract_clinical_data,
    load_prompt,
)
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem


def test_prompts_loadable() -> None:
    """Prompt template files must exist and be readable."""
    prompt = load_prompt("extract_v1.txt")
    assert "You are a clinical data extraction tool" in prompt
    assert "=== RULES ===" in prompt

    retry_prompt = load_prompt("extract_retry_v1.txt")
    assert "Your previous reply was not valid" in retry_prompt


def test_schema_example_a() -> None:
    """Example A JSON from PROMPTS.md must validate against ExtractionResult."""
    answer_file = settings.ROOT_DIR / "test-data" / "answers" / "note_001.json"
    data = json.loads(answer_file.read_text(encoding="utf-8"))

    result = ExtractionResult.model_validate(data)
    assert len(result.medications) == 2
    assert len(result.procedures) == 1

    aspirin = result.medications[0]
    assert aspirin.time == "14:32"
    assert aspirin.drug == "aspirin"
    assert aspirin.dose_value == 324.0
    assert aspirin.dose_unit == "mg"
    assert aspirin.route == "PO"
    assert aspirin.source_text == "14:32 gave aspirin 324 mg PO chewed"

    nitro = result.medications[1]
    assert nitro.time == "14:38"
    assert nitro.drug == "nitroglycerin"
    assert nitro.dose_value == 0.4
    assert nitro.dose_unit == "mg"
    assert nitro.route == "SL"
    assert nitro.source_text == "14:38 nitro point four under the tongue"

    procedure = result.procedures[0]
    assert procedure.name == "IV access"
    assert procedure.details == "18G, left antecubital"
    assert procedure.source_text == "IV 18 gauge left AC"


def test_schema_optional_fields() -> None:
    """Dose, unit, route, and time must NOT be required in extraction schema.

    This prevents the AI model from guessing missing values.
    """
    # Item with only required fields (drug and source_text)
    med = MedicationItem(drug="naloxone", source_text="Gave narcan intranasal")
    assert med.drug == "naloxone"
    assert med.dose_value is None
    assert med.dose_unit is None
    assert med.route is None
    assert med.time is None

    # Procedure with only required fields (name and source_text)
    proc = ProcedureItem(name="cervical collar", source_text="applied c-collar")
    assert proc.name == "cervical collar"
    assert proc.details is None
    assert proc.time is None


def test_parse_llm_json_valid() -> None:
    """Valid JSON string should parse into ExtractionResult."""
    raw = json.dumps({
        "medications": [
            {"drug": "aspirin", "source_text": "aspirin 324"}
        ],
        "procedures": []
    })
    result = _parse_llm_json(raw)
    assert len(result.medications) == 1
    assert result.medications[0].drug == "aspirin"


def test_extract_retries_on_first_failure() -> None:
    """If the LLM returns invalid JSON on first attempt, it must retry once."""
    mock_client = MagicMock()

    # First attempt returns invalid text, second returns valid JSON
    bad_response = MagicMock()
    bad_response.message.content = "Invalid JSON output"

    good_response = MagicMock()
    good_response.message.content = json.dumps({
        "medications": [{"drug": "epinephrine", "source_text": "epi 1mg"}],
        "procedures": []
    })

    mock_client.chat.side_effect = [bad_response, good_response]

    result, elapsed_ms = extract_clinical_data("epi 1mg", client=mock_client)

    assert mock_client.chat.call_count == 2
    assert len(result.medications) == 1
    assert result.medications[0].drug == "epinephrine"
    assert elapsed_ms >= 0


def test_extract_fails_after_two_invalid_attempts() -> None:
    """If both attempts fail, ExtractionError must be raised."""
    mock_client = MagicMock()
    bad_response = MagicMock()
    bad_response.message.content = "Not JSON at all"
    mock_client.chat.side_effect = [bad_response, bad_response]

    with pytest.raises(ExtractionError):
        extract_clinical_data("some note", client=mock_client)


def test_extract_handles_empty_note() -> None:
    """Empty or whitespace notes should return empty extraction with zero latency."""
    result, elapsed_ms = extract_clinical_data("   ")
    assert len(result.medications) == 0
    assert len(result.procedures) == 0
    assert elapsed_ms == 0


def _is_medgemma_available() -> bool:
    """Helper to detect if medgemma1.5 is loaded in Ollama."""
    try:
        resp = httpx.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=1.0)
        if resp.status_code == 200:
            models = [m.get("name", "") for m in resp.json().get("models", [])]
            return any("medgemma" in m for m in models)
    except Exception:
        return False
    return False


@pytest.mark.llm
@pytest.mark.skipif(not _is_medgemma_available(), reason="medgemma1.5 not yet available in local Ollama")
def test_live_extraction_example_a() -> None:
    """End-to-end integration test with local Ollama using Example A."""
    note = "14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC. 14:38 nitro point four under the tongue."
    result, elapsed_ms = extract_clinical_data(note)

    assert len(result.medications) >= 2
    from app.normalise import normalise_drug_name
    drugs = {normalise_drug_name(m.drug) for m in result.medications}
    assert "aspirin" in drugs
    assert "nitroglycerin" in drugs
