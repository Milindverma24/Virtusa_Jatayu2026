"""Tests for optical character recognition module and /draft/image endpoint."""

import io
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
import pytest

from app.main import app
from app.ocr import OCRError, perform_ocr
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem


def create_test_image_bytes(text: str = "Aspirin 324 mg") -> bytes:
    img = Image.new("RGB", (300, 80), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 30), text, fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_perform_ocr_missing_file():
    with pytest.raises(OCRError, match="Image file not found"):
        perform_ocr("/path/to/nonexistent/image.png")


def test_perform_ocr_synthetic_image(tmp_path):
    img_path = tmp_path / "med_note.png"
    img_path.write_bytes(create_test_image_bytes("14:32 Aspirin 324 mg PO"))

    text, conf, low_conf, elapsed_ms = perform_ocr(img_path)
    assert len(text) > 0
    assert "Aspirin" in text or "324" in text
    assert 0.0 <= conf <= 1.0
    assert elapsed_ms > 0


def test_draft_image_endpoint_mocked():
    client = TestClient(app)

    mock_extract = ExtractionResult(
        medications=[
            MedicationItem(
                time="14:32",
                drug="aspirin",
                dose_value=324.0,
                dose_unit="mg",
                route="PO",
                source_text="14:32 Aspirin 324 mg PO",
            )
        ],
        procedures=[],
    )

    with patch("app.main.perform_ocr") as mock_ocr, \
         patch("app.main.extract_clinical_data") as mock_ext:
        mock_ocr.return_value = ("14:32 Aspirin 324 mg PO", 0.95, [], 380)
        mock_ext.return_value = (mock_extract, 950)

        img_bytes = create_test_image_bytes("14:32 Aspirin 324 mg PO")
        response = client.post(
            "/draft/image",
            files={"file": ("vitals_monitor.png", img_bytes, "image/png")},
            data={"encounter_id": "ENC-TEST-IMG"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["input_type"] == "image"
        assert data["encounter_id"] == "ENC-TEST-IMG"
        assert data["ocr_confidence"] == 0.95
        assert data["low_confidence_lines"] == []
        assert data["timings_ms"]["transcribe"] == 380
        assert data["timings_ms"]["extract"] == 950
        assert data["timings_ms"]["validate"] >= 1
        assert data["bundle"]["resourceType"] == "Bundle"


def test_draft_image_empty_file_rejected():
    client = TestClient(app)
    response = client.post(
        "/draft/image",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert response.status_code == 422
