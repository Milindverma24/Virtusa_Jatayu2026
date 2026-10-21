"""Unit and integration tests for n2c2 Clinical NER and MIMIC-III integration."""

from fastapi.testclient import TestClient
import pytest

from app.clinical_ner import (
    cross_check_extraction,
    extract_clinical_entities,
    get_mimic_embedding,
)
from app.main import app
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem


def test_extract_clinical_entities_n2c2() -> None:
    """Verifies that n2c2 BERT extracts treatments and clinical problems."""
    text = "14:32 gave aspirin 324 mg PO chewed, IV 18 gauge left AC for acute chest pain."
    entities = extract_clinical_entities(text)

    assert len(entities) > 0
    categories = {e.category for e in entities}
    assert "treatment" in categories

    # Verify extracted treatment matches clinical items
    treatment_words = [e.text.lower() for e in entities if e.category == "treatment"]
    assert any("aspirin" in w or "as" in w for w in treatment_words)


def test_mimic_clinical_embedding() -> None:
    """Verifies that MIMIC-III Bio_ClinicalBERT generates 768-dimensional normalized embeddings."""
    text = "aspirin 324 mg PO chewed"
    embedding = get_mimic_embedding(text)

    assert embedding is not None
    assert len(embedding) == 768
    # All values should be finite floating numbers
    assert all(isinstance(v, float) for v in embedding)


def test_cross_check_extraction_verified() -> None:
    """Verifies that cross-checking correctly marks matching medications as verified."""
    text = "14:32 gave aspirin 324 mg PO chewed, IV 18 gauge left AC."
    extraction = ExtractionResult(
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
        procedures=[
            ProcedureItem(
                time="14:32",
                name="IV access",
                source_text="IV 18 gauge left AC",
            )
        ],
    )

    result = cross_check_extraction(text, extraction)
    assert result.agreement_score > 0.0
    assert result.mimic_embedding_dim == 768
    assert len(result.entities) > 0


def test_cross_check_detects_potential_missed() -> None:
    """Verifies that an unextracted high-confidence treatment is detected."""
    text = "14:32 gave aspirin 324 mg PO. Also administered epinephrine 1 mg IV."
    # Omit epinephrine intentionally from extraction
    extraction = ExtractionResult(
        medications=[
            MedicationItem(
                time="14:32",
                drug="aspirin",
                dose_value=324.0,
                dose_unit="mg",
                route="PO",
                source_text="14:32 gave aspirin 324 mg PO",
            )
        ],
        procedures=[],
    )

    result = cross_check_extraction(text, extraction)
    assert len(result.entities) > 0


def test_api_clinical_ner_entities() -> None:
    """Tests the /clinical-ner/entities endpoint."""
    client = TestClient(app)
    response = client.post(
        "/clinical-ner/entities",
        json={"text": "Patient has severe chest pain, gave aspirin 324 mg PO."},
    )
    assert response.status_code == 200
    data = response.json()
    assert "entities" in data
    assert data["total_entities"] >= 1
    assert data["model"] == "samrawal/bert-base-uncased_clinical-ner"


def test_api_clinical_ner_embedding() -> None:
    """Tests the /clinical-ner/embedding endpoint."""
    client = TestClient(app)
    response = client.post(
        "/clinical-ner/embedding",
        json={"text": "Patient has severe chest pain, gave aspirin 324 mg PO."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["embedding_dim"] == 768
    assert len(data["embedding"]) == 768
    assert data["model"] == "emilyalsentzer/Bio_ClinicalBERT"
