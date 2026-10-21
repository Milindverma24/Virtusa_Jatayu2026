"""Integration tests for /draft/text and /draft/reextract endpoints."""

from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

from app.config import settings
from app.main import app
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem


@pytest.fixture
def sample_extraction_example_a() -> ExtractionResult:
    return ExtractionResult(
        medications=[
            MedicationItem(
                time="14:32",
                drug="aspirin",
                dose_value=324.0,
                dose_unit="mg",
                route="PO",
                source_text="14:32 gave aspirin 324 mg PO chewed",
            ),
            MedicationItem(
                time="14:38",
                drug="nitroglycerin",
                dose_value=0.4,
                dose_unit="mg",
                route="SL",
                source_text="14:38 nitro point four under the tongue",
            ),
        ],
        procedures=[
            ProcedureItem(
                name="IV access",
                details="18G, left antecubital",
                source_text="IV 18 gauge left AC",
            )
        ],
    )


def test_draft_text_matches_architecture_shape(sample_extraction_example_a: ExtractionResult) -> None:
    """Verifies that /draft/text response matches ARCHITECTURE.md Section 4 shape exactly."""
    note_text = "14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC. 14:38 nitro point four under the tongue."

    with patch("app.main.extract_clinical_data", return_value=(sample_extraction_example_a, 120)):
        client = TestClient(app)
        response = client.post(
            "/draft/text",
            json={"text": note_text, "encounter_id": "ENC-4F2A91B7"},
        )

        assert response.status_code == 200
        data = response.json()

        # Check top-level keys
        assert data["draft_id"].startswith("DRF-")
        assert data["encounter_id"] == "ENC-4F2A91B7"
        assert data["input_type"] == "text"
        assert data["raw_text"] == note_text
        assert data["ocr_confidence"] is None
        assert data["low_confidence_lines"] == []

        # Check bundle
        bundle = data["bundle"]
        assert bundle["resourceType"] == "Bundle"
        assert bundle["type"] == "collection"
        assert len(bundle["entry"]) == 3

        # Check flags (nitro has unit_inferred since 'mg' was not in source words)
        flags = data["flags"]
        assert len(flags) >= 1
        nitro_flag = next(f for f in flags if f["code"] == "unit_inferred")
        assert nitro_flag["item_id"] == "ENC-4F2A91B7-med-2"
        assert nitro_flag["reason"] == "unit_inferred"
        assert nitro_flag["severity"] == "needs_review"

        # Check model metadata
        assert data["model"]["name"] == settings.LLM_MODEL
        assert data["model"]["prompt_version"] == "extract-v1.0"

        # Check timings
        assert data["timings_ms"]["transcribe"] == 0
        assert data["timings_ms"]["extract"] == 120
        assert data["timings_ms"]["validate"] >= 0


def test_draft_text_generates_encounter_id_if_omitted(sample_extraction_example_a: ExtractionResult) -> None:
    note_text = "14:32 gave aspirin 324 mg PO chewed."
    with patch("app.main.extract_clinical_data", return_value=(sample_extraction_example_a, 50)):
        client = TestClient(app)
        response = client.post("/draft/text", json={"text": note_text})
        assert response.status_code == 200
        data = response.json()
        assert data["encounter_id"].startswith("ENC-")


def test_draft_text_rejects_empty_input() -> None:
    client = TestClient(app)
    response = client.post("/draft/text", json={"text": "   "})
    assert response.status_code == 422


def test_draft_reextract_endpoint(sample_extraction_example_a: ExtractionResult) -> None:
    edited_text = "14:32 gave aspirin 324 mg PO chewed."
    with patch("app.main.extract_clinical_data", return_value=(sample_extraction_example_a, 75)):
        client = TestClient(app)
        response = client.post(
            "/draft/reextract",
            json={"text": edited_text, "encounter_id": "ENC-TEST999"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["encounter_id"] == "ENC-TEST999"
        assert data["raw_text"] == edited_text
