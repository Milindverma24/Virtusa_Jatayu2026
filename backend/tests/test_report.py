"""Tests for clinical handover HTML and PDF report generation."""

from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.report import render_html_report, render_pdf_report


def test_render_html_report_empty_encounter():
    html = render_html_report("ENC-TEST-EMPTY")
    assert "<!DOCTYPE html>" in html
    assert "ENC-TEST-EMPTY" in html
    assert "Clinical Handover" in html
    assert "No medications recorded" in html
    assert "No procedures recorded" in html


def test_render_pdf_report_empty_encounter():
    pdf_bytes = render_pdf_report("ENC-TEST-EMPTY")
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes.startswith(b"%PDF")


def test_encounter_report_endpoints():
    client = TestClient(app)

    # HTML Report endpoint
    res_html = client.get("/encounters/ENC-TEST-999/report")
    assert res_html.status_code == 200
    assert "text/html" in res_html.headers["content-type"]
    assert "ENC-TEST-999" in res_html.text

    # PDF Report endpoint
    res_pdf = client.get("/encounters/ENC-TEST-999/report.pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")
    assert "attachment" in res_pdf.headers.get("content-disposition", "") or "inline" in res_pdf.headers.get("content-disposition", "")
