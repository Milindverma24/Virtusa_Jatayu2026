"""Offline clinical handover report generation module (HTML and PDF)."""

from datetime import datetime, timezone
import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.db import get_records_for_encounter, verify_chain

logger = logging.getLogger(__name__)

# Template environment setup
TEMPLATES_DIR = settings.BACKEND_DIR / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)


def _extract_items_from_bundle(bundle_json: str | dict) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Extracts clean medication and procedure lists from a confirmed FHIR Bundle."""
    if isinstance(bundle_json, str):
        try:
            bundle_data = json.loads(bundle_json)
        except json.JSONDecodeError:
            return [], []
    else:
        bundle_data = bundle_json

    medications: List[Dict[str, Any]] = []
    procedures: List[Dict[str, Any]] = []

    entries = bundle_data.get("entry", [])
    for entry in entries:
        resource = entry.get("resource", {})
        res_type = resource.get("resourceType")

        if res_type == "MedicationAdministration":
            # Extract time
            effective_dt = resource.get("effectiveDateTime")
            time_str = ""
            if effective_dt and "T" in effective_dt:
                time_str = effective_dt.split("T")[1][:5]
            elif effective_dt:
                time_str = effective_dt

            # Extract drug name
            code_obj = resource.get("medicationCodeableConcept", {})
            drug_name = code_obj.get("text") or (
                code_obj.get("coding", [{}])[0].get("display") if code_obj.get("coding") else "Unknown"
            )

            # Extract dose
            dosage = resource.get("dosage", {})
            dose_qty = dosage.get("dose", {})
            dose_val = dose_qty.get("value")
            dose_unit = dose_qty.get("unit") or ""

            # Extract route
            route_obj = dosage.get("route", {})
            route_str = route_obj.get("text") or (
                route_obj.get("coding", [{}])[0].get("display") if route_obj.get("coding") else ""
            )

            # Source text
            notes = resource.get("note", [{}])
            source_text = notes[0].get("text") if notes else ""

            # Clinical use / indication
            indication_str = ""
            reason_codes = resource.get("reasonCode", [])
            if reason_codes:
                indication_str = reason_codes[0].get("text", "")
            if not indication_str:
                for ext in resource.get("extension", []):
                    if ext.get("url") == "http://sanjeevani-lekh.org/fhir/indication":
                        indication_str = ext.get("valueString", "")
            if not indication_str:
                try:
                    from app.med_indications import get_medication_indication
                    indication_str = get_medication_indication(drug_name)
                except Exception:
                    pass

            medications.append({
                "time": time_str,
                "drug": drug_name,
                "dose_value": dose_val,
                "dose_unit": dose_unit,
                "route": route_str,
                "source_text": source_text,
                "indication": indication_str,
            })

        elif res_type == "Procedure":
            # Extract time
            performed_dt = resource.get("performedDateTime")
            time_str = ""
            if performed_dt and "T" in performed_dt:
                time_str = performed_dt.split("T")[1][:5]
            elif performed_dt:
                time_str = performed_dt

            # Extract procedure name
            code_obj = resource.get("code", {})
            proc_name = code_obj.get("text") or (
                code_obj.get("coding", [{}])[0].get("display") if code_obj.get("coding") else "Procedure"
            )

            # Details & source
            notes = resource.get("note", [{}])
            source_text = notes[0].get("text") if notes else ""

            procedures.append({
                "time": time_str,
                "name": proc_name,
                "details": source_text or "Performed",
                "source_text": source_text,
            })

    return medications, procedures


def get_encounter_report_context(encounter_id: str) -> Dict[str, Any]:
    """Compiles aggregated clinical data and audit chain context for an encounter."""
    records = get_records_for_encounter(encounter_id)
    chain_valid, _, _, _ = verify_chain()

    all_medications: List[Dict[str, Any]] = []
    all_procedures: List[Dict[str, Any]] = []
    reviewed_by_set: set[str] = set()
    raw_notes: List[str] = []
    clinical_summary = ""

    latest_record = None
    if records:
        latest_record = records[-1]

    for rec in records:
        if rec.get("reviewed_by"):
            reviewed_by_set.add(rec["reviewed_by"])
        text = rec.get("raw_text")
        if text and text.strip() and text.strip() not in raw_notes:
            raw_notes.append(text.strip())

        rec_json = rec.get("record_json", "{}")
        if isinstance(rec_json, str):
            try:
                parsed_rec = json.loads(rec_json)
                if parsed_rec.get("summary") and not clinical_summary:
                    clinical_summary = parsed_rec["summary"]
            except Exception:
                pass
        elif isinstance(rec_json, dict) and rec_json.get("summary") and not clinical_summary:
            clinical_summary = rec_json["summary"]

        meds, procs = _extract_items_from_bundle(rec_json)
        all_medications.extend(meds)
        all_procedures.extend(procs)

    if not clinical_summary and raw_notes:
        try:
            from app.extract import generate_clinical_summary
            clinical_summary = generate_clinical_summary(" ".join(raw_notes))
        except Exception:
            pass

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    return {
        "encounter_id": encounter_id,
        "generated_at": now_utc,
        "reviewed_by": ", ".join(sorted(reviewed_by_set)) if reviewed_by_set else None,
        "raw_notes": raw_notes,
        "clinical_summary": clinical_summary,
        "medications": all_medications,
        "procedures": all_procedures,
        "chain_valid": chain_valid,
        "records_count": len(records),
        "latest_record": latest_record,
    }


def render_html_report(encounter_id: str) -> str:
    """Renders the HTML clinical handover summary using Jinja2."""
    template = jinja_env.get_template("report.html")
    context = get_encounter_report_context(encounter_id)
    return template.render(**context)


def render_pdf_report(encounter_id: str) -> bytes:
    """Generates an offline PDF handover report using ReportLab."""
    context = get_encounter_report_context(encounter_id)
    buffer = io.BytesIO()

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#14171C"),
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#5B6472"),
    )
    heading_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#14171C"),
        spaceBefore=12,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "TableBody",
        parent=styles["Normal"],
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#14171C"),
    )
    mono_style = ParagraphStyle(
        "MonoBody",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#14171C"),
    )

    story: list[Any] = []

    # Title & Header
    story.append(Paragraph("SANJEEVANI LEKH · CLINICAL HANDOVER REPORT", title_style))
    reviewed_txt = f" · Confirmed by: {context['reviewed_by']}" if context['reviewed_by'] else ""
    chain_txt = "Chain Verified [PASS]" if context['chain_valid'] else "Chain Warning [WARN]"
    story.append(
        Paragraph(
            f"Encounter: <b>{encounter_id}</b> · Generated: {context['generated_at']}{reviewed_txt} · {chain_txt}",
            subtitle_style,
        )
    )
    story.append(Spacer(1, 14))

    # Original Voice & Field Notes Record
    if context.get("raw_notes"):
        story.append(Paragraph("ORIGINAL VOICE & FIELD NOTES RECORD", heading_style))
        for note in context["raw_notes"]:
            story.append(Paragraph(f'"{note}"', subtitle_style))
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 8))

    # AI Clinical Handover Summary (Ollama)
    if context.get("clinical_summary"):
        story.append(Paragraph("AI CLINICAL HANDOVER SUMMARY (OLLAMA)", heading_style))
        story.append(Paragraph(f"<b>Narrative:</b> {context['clinical_summary']}", body_style))
        story.append(Spacer(1, 10))

    # Medications Table
    story.append(Paragraph("MEDICATIONS ADMINISTERED", heading_style))
    med_data = [["Time", "Drug Name & Clinical Use", "Dose", "Route", "Source Words"]]
    if context["medications"]:
        for m in context["medications"]:
            dose_str = f"{m['dose_value']} {m['dose_unit'] or ''}".strip() if m['dose_value'] is not None else "—"
            indication_html = f"<br/><font color='#1F5EFF' size=8><b>Use:</b> {m['indication']}</font>" if m.get("indication") else ""
            drug_cell = Paragraph(f"<b>{m['drug'].title()}</b>{indication_html}", body_style)
            med_data.append([
                Paragraph(m["time"] or "—", mono_style),
                drug_cell,
                Paragraph(dose_str, mono_style),
                Paragraph(m["route"] or "—", mono_style),
                Paragraph(m["source_text"] or "—", subtitle_style),
            ])
    else:
        med_data.append(["—", "No medications recorded", "—", "—", "—"])

    med_table = Table(med_data, colWidths=[50, 190, 65, 50, 175])
    med_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F3F5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#5B6472")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDE2E8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(med_table)
    story.append(Spacer(1, 14))

    # Procedures Table
    story.append(Paragraph("PROCEDURES PERFORMED", heading_style))
    proc_data = [["Time", "Procedure Name", "Details"]]
    if context["procedures"]:
        for p in context["procedures"]:
            proc_data.append([
                Paragraph(p["time"] or "—", mono_style),
                Paragraph(p["name"].title(), body_style),
                Paragraph(p["details"] or "—", body_style),
            ])
    else:
        proc_data.append(["—", "No procedures recorded", "—"])

    proc_table = Table(proc_data, colWidths=[55, 200, 275])
    proc_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F3F5")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#5B6472")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDE2E8")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(proc_table)
    story.append(Spacer(1, 20))

    # Audit & Provenance Footer
    story.append(Paragraph("CRYPTOGRAPHIC AUDIT PROVENANCE", heading_style))
    latest = context.get("latest_record")
    if latest:
        rec_hash = latest.get("hash", "")
        prev_hash = latest.get("prev_hash", "")
        meta = (
            f"Record Hash: {rec_hash}<br/>"
            f"Previous Hash: {prev_hash}<br/>"
            f"Capture Source: {latest.get('input_type')} · Model: {latest.get('model_name')} · Prompt: {latest.get('prompt_version')}"
        )
        story.append(Paragraph(meta, mono_style))
    else:
        story.append(Paragraph("No audit entries yet recorded for this encounter.", subtitle_style))

    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "Notice: This summary is generated as an operational draft aid for paramedic handover. It is not an automated medical device record.",
            subtitle_style,
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
