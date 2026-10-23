"""Offline clinical handover report generation (HTML and PDF).

The report is a plain prehospital handover form: who, when, what was given and done,
the verbatim field note, an integrity line, and a sign-off box for the receiving clinician.
It deliberately contains no machine-written narrative; every line is from the confirmed record.
"""

from datetime import datetime, timezone
import io
import json
import logging
from typing import Any, Dict, List, Tuple

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.db import get_records_for_encounter, verify_chain

logger = logging.getLogger(__name__)

TEMPLATES_DIR = settings.BACKEND_DIR / "templates"
jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "xml"]),
)

_LABEL_FOR_INPUT = {"voice": "Voice", "text": "Typed", "image": "Photo of note"}


def _clock(value: str | None) -> str:
    """HH:MM from an ISO datetime, or the value itself when it is already a time."""
    if not value:
        return ""
    if "T" in value:
        return value.split("T")[1][:5]
    return value


def _label(obj: dict[str, Any]) -> str:
    """Display text of a FHIR CodeableConcept."""
    if not obj:
        return ""
    if obj.get("text"):
        return obj["text"]
    coding = obj.get("coding") or [{}]
    return coding[0].get("display", "") or ""


def _extract_items_from_bundle(bundle_json: str | dict) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Extracts medication and procedure lists from a confirmed FHIR-lite Bundle."""
    if isinstance(bundle_json, str):
        try:
            bundle_data = json.loads(bundle_json)
        except json.JSONDecodeError:
            return [], []
    else:
        bundle_data = bundle_json

    medications: List[Dict[str, Any]] = []
    procedures: List[Dict[str, Any]] = []

    for entry in bundle_data.get("entry", []):
        resource = entry.get("resource", {})
        res_type = resource.get("resourceType")
        notes = resource.get("note") or [{}]
        source_text = notes[0].get("text") or ""

        if res_type == "MedicationAdministration":
            dosage = resource.get("dosage", {})
            dose = dosage.get("dose", {})
            medications.append({
                "time": _clock(resource.get("effectiveDateTime")),
                "drug": _label(resource.get("medicationCodeableConcept", {})) or "Unknown",
                "dose_value": dose.get("value"),
                "dose_unit": dose.get("unit") or "",
                "route": _label(dosage.get("route", {})),
                "source_text": source_text,
            })
        elif res_type == "Procedure":
            procedures.append({
                "time": _clock(resource.get("performedDateTime")),
                "name": _label(resource.get("code", {})) or "Procedure",
                "details": source_text,
            })

    return medications, procedures


def _format_dose(med: Dict[str, Any]) -> str:
    value = med.get("dose_value")
    if value is None:
        return "not recorded"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return f"{value} {med.get('dose_unit') or ''}".strip()


def _cap(text: Any) -> str:
    """Capitalise the first letter only, so abbreviations such as IV stay intact."""
    value = str(text or "")
    return value[:1].upper() + value[1:]


def _by_time(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Chronological order; items without a time keep their original position at the end."""
    return sorted(items, key=lambda i: (not i.get("time"), i.get("time") or ""))


def get_encounter_report_context(encounter_id: str) -> Dict[str, Any]:
    """Compiles the confirmed clinical data and audit-chain facts for an encounter."""
    records = get_records_for_encounter(encounter_id)
    chain_valid, _, _, _ = verify_chain()

    medications: List[Dict[str, Any]] = []
    procedures: List[Dict[str, Any]] = []
    reviewers: list[str] = []
    notes: list[str] = []
    sources: list[str] = []
    engines: list[str] = []

    for rec in records:
        reviewer = rec.get("reviewed_by")
        if reviewer and reviewer not in reviewers:
            reviewers.append(reviewer)
        text = (rec.get("raw_text") or "").strip()
        if text and text not in notes:
            notes.append(text)
        src = _LABEL_FOR_INPUT.get(rec.get("input_type") or "", "")
        if src and src not in sources:
            sources.append(src)
        engine = rec.get("model_name")
        if engine and engine not in engines:
            engines.append(engine)
        meds, procs = _extract_items_from_bundle(rec.get("record_json", "{}"))
        medications.extend(meds)
        procedures.extend(procs)

    for med in medications:
        med["dose_display"] = _format_dose(med)

    first = records[0] if records else None
    latest = records[-1] if records else None
    record_date = ""
    if first and first.get("created_at"):
        record_date = str(first["created_at"])[:10]

    return {
        "encounter_id": encounter_id,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "record_date": record_date,
        "reviewed_by": ", ".join(reviewers) if reviewers else "",
        "raw_notes": notes,
        "medications": _by_time(medications),
        "procedures": _by_time(procedures),
        "chain_valid": chain_valid,
        "records_count": len(records),
        "corrections_count": sum(1 for r in records if r.get("corrects_record_id")),
        "record_ids": [r.get("record_id", "") for r in records],
        "capture": ", ".join(sources),
        "engines": ", ".join(engines),
        "latest_hash": (latest or {}).get("hash", ""),
        "latest_record": latest,
    }


def render_html_report(encounter_id: str) -> str:
    """Renders the handover form as printable HTML."""
    template = jinja_env.get_template("report.html")
    return template.render(**get_encounter_report_context(encounter_id))


def render_pdf_report(encounter_id: str) -> bytes:
    """Generates the handover form as a PDF with ReportLab (built-in fonts, black on white)."""
    ctx = get_encounter_report_context(encounter_id)

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (
        HRFlowable,
        KeepTogether,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    INK = colors.HexColor("#111111")
    GREY = colors.HexColor("#666666")
    RULE = colors.HexColor("#BBBBBB")
    PAPER = colors.HexColor("#F6F6F6")

    base = ParagraphStyle("base", fontName="Helvetica", fontSize=10, leading=13.5, textColor=INK)
    label = ParagraphStyle("label", parent=base, fontSize=7.5, leading=9, textColor=GREY)
    small = ParagraphStyle("small", parent=base, fontSize=8.5, leading=11, textColor=GREY)
    mono = ParagraphStyle("mono", parent=base, fontName="Courier", fontSize=8, leading=10.5)
    h1 = ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=19, leading=23)
    h2 = ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=8.5, leading=11, spaceBefore=16, spaceAfter=3)
    cell = ParagraphStyle("cell", parent=base, fontSize=10, leading=13)
    cell_b = ParagraphStyle("cell_b", parent=cell, fontName="Helvetica-Bold")
    head = ParagraphStyle("head", parent=base, fontName="Helvetica-Bold", fontSize=7.5, leading=9, textColor=GREY)
    quote = ParagraphStyle("quote", parent=base, fontSize=10, leading=14.5)

    def esc(value: Any) -> str:
        return (str(value or "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def section(title: str) -> list[Any]:
        return [Paragraph(title.upper(), h2), HRFlowable(width="100%", thickness=0.8, color=INK, spaceAfter=4)]

    def grid(rows: list[list[Any]], widths: list[float]) -> Table:
        t = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, RULE),
            ("LINEBELOW", (0, 1), (-1, -1), 0.3, colors.HexColor("#DDDDDD")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        return t

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.8 * inch,
        rightMargin=0.8 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.8 * inch,
        title=f"Clinical handover {ctx['encounter_id']}",
        author="Sanjeevani Lekh",
    )
    width = letter[0] - 1.6 * inch - 12  # minus the frame's 6pt padding on each side, so tables align with headings
    story: list[Any] = []

    # Header
    story.append(Paragraph("SANJEEVANI LEKH", ParagraphStyle("brand", parent=label, fontName="Helvetica-Bold", fontSize=8, textColor=GREY)))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Clinical Handover", h1))
    story.append(Spacer(1, 8))

    info = [
        [Paragraph("ENCOUNTER", label), Paragraph("DATE", label), Paragraph("CONFIRMED BY", label), Paragraph("CAPTURE", label)],
        [
            Paragraph(esc(ctx["encounter_id"]), cell_b),
            Paragraph(esc(ctx["record_date"] or "-"), cell),
            Paragraph(esc(ctx["reviewed_by"] or "-"), cell),
            Paragraph(esc(ctx["capture"] or "-"), cell),
        ],
    ]
    info_t = Table(info, colWidths=[width * 0.34, width * 0.2, width * 0.26, width * 0.2])
    info_t.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 0.8, INK),
        ("LINEBELOW", (0, -1), (-1, -1), 0.3, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(info_t)

    # Medications
    story += section("Medications administered")
    med_rows: list[list[Any]] = [[Paragraph(h, head) for h in ("TIME", "MEDICATION", "DOSE", "ROUTE")]]
    for m in ctx["medications"]:
        med_rows.append([
            Paragraph(esc(m["time"] or "-"), cell),
            Paragraph(esc(_cap(m["drug"])), cell_b),
            Paragraph(esc(m["dose_display"]), cell),
            Paragraph(esc(m["route"] or "-"), cell),
        ])
    if len(med_rows) == 1:
        med_rows.append([Paragraph("-", cell), Paragraph("No medications recorded", cell), "", ""])
    story.append(grid(med_rows, [width * 0.13, width * 0.45, width * 0.24, width * 0.18]))

    # Procedures
    story += section("Procedures")
    proc_rows: list[list[Any]] = [[Paragraph(h, head) for h in ("TIME", "PROCEDURE", "AS DOCUMENTED")]]
    for p in ctx["procedures"]:
        proc_rows.append([
            Paragraph(esc(p["time"] or "-"), cell),
            Paragraph(esc(_cap(p["name"])), cell_b),
            Paragraph(esc(p["details"] or "-"), cell),
        ])
    if len(proc_rows) == 1:
        proc_rows.append([Paragraph("-", cell), Paragraph("No procedures recorded", cell), ""])
    story.append(grid(proc_rows, [width * 0.13, width * 0.37, width * 0.5]))

    # Verbatim note
    if ctx["raw_notes"]:
        story += section("Field note (verbatim)")
        box = Table([[[Paragraph(esc(n), quote) for n in ctx["raw_notes"]]]], colWidths=[width])
        box.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PAPER),
            ("BOX", (0, 0), (-1, -1), 0.4, RULE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(box)

    # Integrity + sign-off kept together so the form never splits across pages
    integrity: list[Any] = section("Record integrity")
    if ctx["latest_hash"]:
        status = "verified" if ctx["chain_valid"] else "NOT VERIFIED - the audit chain failed its check"
        count = f"{ctx['records_count']} record{'s' if ctx['records_count'] != 1 else ''}"
        if ctx["corrections_count"]:
            count += f", including {ctx['corrections_count']} correction{'s' if ctx['corrections_count'] != 1 else ''}"
        integrity.append(Paragraph(f"Audit chain {status}. {count}.", base))
        integrity.append(Spacer(1, 4))
        integrity.append(Paragraph(f"Record ID: {esc(', '.join(ctx['record_ids']))}", mono))
        integrity.append(Paragraph(f"SHA-256 of last record: {esc(ctx['latest_hash'])}", mono))
        if ctx["engines"]:
            integrity.append(Paragraph(f"Extraction: {esc(ctx['engines'])}", mono))
    else:
        integrity.append(Paragraph("No confirmed records exist for this encounter.", base))

    signoff_rows = [
        [Paragraph("RECEIVED BY (NAME AND ROLE)", label), Paragraph("SIGNATURE", label), Paragraph("TIME", label)],
        ["", "", ""],
    ]
    signoff = Table(signoff_rows, colWidths=[width * 0.46, width * 0.34, width * 0.2], rowHeights=[12, 30])
    signoff.setStyle(TableStyle([
        ("LINEBELOW", (0, 1), (0, 1), 0.6, INK),
        ("LINEBELOW", (1, 1), (1, 1), 0.6, INK),
        ("LINEBELOW", (2, 1), (2, 1), 0.6, INK),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
    ]))
    story.append(KeepTogether(integrity + [Spacer(1, 18), signoff]))
    story.append(Spacer(1, 14))
    story.append(Paragraph(
        "Prepared from field documentation confirmed by the responder named above. "
        "Not a certified medical record.",
        small,
    ))

    class NumberedCanvas(rl_canvas.Canvas):
        """Adds 'Page x of y' and the encounter footer to every page."""

        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            self._pages: list[dict] = []

        def showPage(self) -> None:
            self._pages.append(dict(self.__dict__))
            self._startPage()

        def save(self) -> None:
            total = len(self._pages)
            for state in self._pages:
                self.__dict__.update(state)
                self.setFont("Helvetica", 7.5)
                self.setFillColor(GREY)
                y = 0.5 * inch
                self.drawString(0.8 * inch, y, f"{ctx['encounter_id']}  |  Generated {ctx['generated_at']}")
                self.drawRightString(letter[0] - 0.8 * inch, y, f"Page {self._pageNumber} of {total}")
                super().showPage()
            super().save()

    doc.build(story, canvasmaker=NumberedCanvas)
    return buffer.getvalue()
