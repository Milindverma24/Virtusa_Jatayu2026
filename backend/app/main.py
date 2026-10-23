"""FastAPI application entry point for Sanjeevani Lekh.

Routes only; delegates business logic to specialized modules.
"""

from contextlib import asynccontextmanager
import logging
import time
import os
from pathlib import Path
import tempfile
from typing import Any, AsyncGenerator
import uuid

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import httpx

from app.clinical_ner import cross_check_extraction, extract_clinical_entities, get_mimic_embedding
from app.config import settings
from app.db import (
    check_db_health,
    get_all_encounters,
    get_records_for_encounter,
    init_db,
    insert_confirmed_record,
    verify_chain,
)
from app.extract import ExtractionError, OllamaServiceError, extract_clinical_data, generate_clinical_summary
from app.rule_extractor import extract_with_rules
from app.fhir import generate_item_id, to_fhir_bundle
from app.ocr import OCRError, perform_ocr
from app.report import render_html_report, render_pdf_report
from app.sync import SyncError, sync_to_supabase
from app.transcribe import TranscriptionError, transcribe_audio
from app.schemas import (
    AuditVerifyResponse,
    ConfirmRequest,
    ConfirmResponse,
    CorrectionRequest,
    DraftRequest,
    DraftResponse,
    EncounterSummary,
    ExtractRequest,
    ExtractionResult,
    FlagResponseItem,
    HealthResponse,
    ModelInfo,
    TimingsMs,
)
from app.validate import validate_record

# Configure logging (NEVER log clinical text)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("sanjeevani_lekh")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle."""
    logger.info("Starting Sanjeevani Lekh on %s:%d", settings.HOST, settings.PORT)
    init_db()
    db_ok = check_db_health()
    logger.info("Initial SQLite database health check: %s", "OK" if db_ok else "FAILED")
    yield
    logger.info("Shutting down Sanjeevani Lekh backend")


app = FastAPI(
    title="Sanjeevani Lekh API",
    description="Offline voice-to-structured clinical note generator for first responders",
    version="1.0.0",
    lifespan=lifespan,
)

# Restrict CORS strictly to localhost origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Check service, Ollama, and database status",
)
async def health_check() -> HealthResponse:
    """Verifies that SQLite database and Ollama model are available locally."""
    db_healthy = check_db_health()
    ollama_running = False
    model_available = False
    details: dict[str, str | bool] = {}

    try:
        async with httpx.AsyncClient(timeout=2.0) as http_client:
            resp = await http_client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            if resp.status_code == 200:
                ollama_running = True
                data = resp.json()
                models = [m.get("name", "") for m in data.get("models", [])]
                model_prefix = settings.LLM_MODEL.split(":")[0]
                model_available = any(
                    m == settings.LLM_MODEL
                    or m.startswith(f"{settings.LLM_MODEL}:")
                    or m.startswith(f"{model_prefix}:")
                    for m in models
                )
                details["available_models"] = ", ".join(models) if models else "none"
            else:
                details["ollama_status_code"] = str(resp.status_code)
    except Exception as exc:
        details["ollama_error"] = type(exc).__name__

    if not db_healthy or not ollama_running:
        overall_status = "unhealthy"
    elif not model_available:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return HealthResponse(
        status=overall_status,
        ollama_running=ollama_running,
        model_name=settings.LLM_MODEL,
        model_available=model_available,
        database_connected=db_healthy,
        active_prompt_version=settings.ACTIVE_PROMPT_VERSION,
        details=details,
    )


def _process_text_to_draft(
    raw_text: str,
    encounter_id: str | None = None,
    client: Any = None,
    input_type: str = "text",
    transcribe_ms: int = 0,
    ocr_confidence: float | None = None,
    low_confidence_lines: list[str] | None = None,
) -> DraftResponse:
    """Core pipeline: text -> extract -> validate -> fhir -> DraftResponse."""
    clean_text = raw_text.strip()
    if not clean_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Clinical note text cannot be empty",
        )

    enc_id = encounter_id or f"ENC-{uuid.uuid4().hex[:8].upper()}"
    draft_id = f"DRF-{uuid.uuid4().hex[:8].upper()}"

    # Step 1: Extraction
    try:
        extraction_result, extract_ms = extract_clinical_data(clean_text, client=client)
    except (OllamaServiceError, ExtractionError) as exc:
        logger.warning(
            "Local LLM unavailable (%s): using zero-lag rule-based clinical extractor.",
            type(exc).__name__,
        )
        fb_start = time.perf_counter()
        extraction_result = extract_with_rules(clean_text)
        extract_ms = max(int((time.perf_counter() - fb_start) * 1000), 1)

    # Step 2: Validation
    v_start = time.perf_counter()
    validation_res = validate_record(extraction_result, clean_text)
    validate_ms = max(1, int((time.perf_counter() - v_start) * 1000))

    # Step 3: FHIR-lite mapping
    bundle = to_fhir_bundle(extraction_result, enc_id)

    # Step 4: Map flags to response items with item_ids
    flag_items: list[FlagResponseItem] = []
    for f in validation_res.flags:
        item_id = generate_item_id(enc_id, f.item_type, f.item_index)
        flag_items.append(
            FlagResponseItem(
                item_id=item_id,
                reason=f.code,
                code=f.code,
                message=f.message,
                severity=f.severity,
            )
        )

    # Step 5: Generate professional clinical summary using Ollama
    clinical_summary = generate_clinical_summary(clean_text, client=client)
    if clinical_summary:
        bundle["summary"] = clinical_summary

    # Step 6: n2c2 Clinical NER & MIMIC-III cross-validation
    clinical_check = None
    if settings.ENABLE_CLINICAL_NER:
        try:
            clinical_check = cross_check_extraction(clean_text, extraction_result)
            if clinical_check.potential_missed_treatments:
                for missed in clinical_check.potential_missed_treatments:
                    flag_items.append(
                        FlagResponseItem(
                            item_id=f"{enc_id}-ner-suggestion",
                            reason="n2c2_treatment_detected",
                            code="n2c2_treatment_detected",
                            message=f"n2c2 clinical model identified '{missed}' in notes (potential omitted treatment)",
                            severity="info",
                        )
                    )
        except Exception as ner_err:
            logger.warning("Clinical NER cross-check skipped: %s", ner_err)

    return DraftResponse(
        draft_id=draft_id,
        encounter_id=enc_id,
        input_type=input_type,
        raw_text=raw_text,
        ocr_confidence=ocr_confidence,
        low_confidence_lines=low_confidence_lines or [],
        bundle=bundle,
        flags=flag_items,
        model=ModelInfo(
            name=settings.LLM_MODEL,
            prompt_version=settings.ACTIVE_PROMPT_VERSION,
        ),
        timings_ms=TimingsMs(
            transcribe=transcribe_ms,
            extract=extract_ms,
            validate=validate_ms,
        ),
        clinical_ner=clinical_check,
        summary=clinical_summary,
    )


@app.post(
    "/draft/text",
    response_model=DraftResponse,
    summary="Process typed text into a structured draft record",
)
async def draft_from_text(payload: DraftRequest) -> DraftResponse:
    """Ingests typed clinical text note and returns structured FHIR-lite draft with flags."""
    return _process_text_to_draft(payload.text, payload.encounter_id, input_type="text")


@app.post(
    "/draft/voice",
    response_model=DraftResponse,
    summary="Process audio recording into a structured draft record",
)
async def draft_from_voice(
    file: UploadFile = File(...),
    encounter_id: str | None = Form(None),
) -> DraftResponse:
    """Transcribes audio file with whisper.cpp and runs extraction pipeline."""
    suffix = Path(file.filename).suffix if file.filename else ".wav"
    if not suffix:
        suffix = ".wav"

    temp_fd, temp_path = tempfile.mkstemp(suffix=suffix)
    os.close(temp_fd)

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Uploaded audio file is empty",
            )
        Path(temp_path).write_bytes(content)

        try:
            raw_text, transcribe_ms = transcribe_audio(temp_path)
        except TranscriptionError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Speech transcription failed: {exc}",
            ) from exc

        return _process_text_to_draft(
            raw_text=raw_text,
            encounter_id=encounter_id,
            input_type="voice",
            transcribe_ms=transcribe_ms,
        )
    finally:
        # Crucial requirement: Delete temp files after processing
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError as err:
                logger.warning("Failed to delete temp audio file %s: %s", temp_path, err)


@app.post(
    "/draft/image",
    response_model=DraftResponse,
    summary="Process photo of monitor or field note into a structured draft record",
)
async def draft_from_image(
    file: UploadFile = File(...),
    encounter_id: str | None = Form(None),
) -> DraftResponse:
    """Performs offline OCR on image file and runs extraction pipeline."""
    suffix = Path(file.filename).suffix if file.filename else ".png"
    if not suffix:
        suffix = ".png"

    temp_fd, temp_path = tempfile.mkstemp(suffix=suffix)
    os.close(temp_fd)

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Uploaded image file is empty",
            )
        Path(temp_path).write_bytes(content)

        try:
            raw_text, ocr_conf, low_conf_lines, ocr_ms = perform_ocr(temp_path)
        except OCRError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Image text recognition failed: {exc}",
            ) from exc

        return _process_text_to_draft(
            raw_text=raw_text,
            encounter_id=encounter_id,
            input_type="image",
            transcribe_ms=ocr_ms,
            ocr_confidence=ocr_conf,
            low_confidence_lines=low_conf_lines,
        )
    finally:
        # Crucial requirement: Delete temp files after processing
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError as err:
                logger.warning("Failed to delete temp image file %s: %s", temp_path, err)


@app.post(
    "/draft/reextract",
    response_model=DraftResponse,
    summary="Re-extract draft from edited note text",
)
async def reextract_from_text(payload: DraftRequest) -> DraftResponse:
    """Re-runs the extraction and validation pipeline on edited raw text."""
    return _process_text_to_draft(payload.text, payload.encounter_id, input_type="text")


@app.post(
    "/confirm",
    response_model=ConfirmResponse,
    summary="Confirm a reviewed record into the append-only audit chain",
)
async def confirm_record(payload: ConfirmRequest) -> ConfirmResponse:
    """Stores human-confirmed record in the SQLite hash chain with responder ID."""
    if not payload.reviewed_by or not payload.reviewed_by.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Responder ID (reviewed_by) is required to confirm a record.",
        )

    try:
        inserted = insert_confirmed_record(
            encounter_id=payload.encounter_id,
            raw_text=payload.raw_text,
            record_json=payload.bundle,
            reviewed_by=payload.reviewed_by,
            input_type=payload.input_type,
            model_name=payload.model_name or settings.LLM_MODEL,
            prompt_version=payload.prompt_version or settings.ACTIVE_PROMPT_VERSION,
        )
    except Exception as exc:
        logger.error("Failed to commit confirmed record: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit confirmed record to audit chain",
        ) from exc

    is_valid, _, _, _ = verify_chain()

    return ConfirmResponse(
        record_id=inserted["record_id"],
        encounter_id=inserted["encounter_id"],
        created_at=inserted["created_at"],
        hash=inserted["hash"],
        prev_hash=inserted["prev_hash"],
        reviewed_by=inserted["reviewed_by"],
        corrects_record_id=inserted["corrects_record_id"],
        chain_verified=is_valid,
    )


@app.post(
    "/correct/{record_id}",
    response_model=ConfirmResponse,
    summary="Append a correction linked to an existing record",
)
async def correct_record(record_id: str, payload: CorrectionRequest) -> ConfirmResponse:
    """Appends an amendment record pointing back to the corrected row."""
    # Find the original record's encounter_id
    records = get_records_for_encounter(record_id.split("-")[1] if "-" in record_id else "")
    orig = next((r for r in records if r["record_id"] == record_id), None)

    encounter_id = orig["encounter_id"] if orig else f"ENC-{uuid.uuid4().hex[:8].upper()}"

    inserted = insert_confirmed_record(
        encounter_id=encounter_id,
        raw_text=payload.raw_text,
        record_json=payload.bundle,
        reviewed_by=payload.reviewed_by,
        input_type=payload.input_type,
        model_name=payload.model_name or settings.LLM_MODEL,
        prompt_version=payload.prompt_version or settings.ACTIVE_PROMPT_VERSION,
        corrects_record_id=record_id,
    )

    is_valid, _, _, _ = verify_chain()

    return ConfirmResponse(
        record_id=inserted["record_id"],
        encounter_id=inserted["encounter_id"],
        created_at=inserted["created_at"],
        hash=inserted["hash"],
        prev_hash=inserted["prev_hash"],
        reviewed_by=inserted["reviewed_by"],
        corrects_record_id=record_id,
        chain_verified=is_valid,
    )


@app.get(
    "/audit/verify",
    response_model=AuditVerifyResponse,
    summary="Verify cryptographic integrity of the entire audit chain",
)
async def verify_audit_chain() -> AuditVerifyResponse:
    """Verifies SHA-256 hash chaining across all audit records."""
    is_valid, broken_record, broken_row, total = verify_chain()

    if is_valid:
        msg = f"Audit chain intact. All {total} cryptographic records verified."
    else:
        msg = f"Audit chain broken at row #{broken_row} (record {broken_record}). Cryptographic mismatch detected."

    return AuditVerifyResponse(
        valid=is_valid,
        total_records=total,
        broken_record_id=broken_record,
        broken_row_id=broken_row,
        message=msg,
    )


@app.get(
    "/encounters",
    response_model=list[EncounterSummary],
    summary="List all recorded encounters",
)
async def list_encounters() -> list[EncounterSummary]:
    """Returns encounter list with record counts and sync status."""
    raw_encs = get_all_encounters()
    return [
        EncounterSummary(
            encounter_id=e["encounter_id"],
            record_count=e["record_count"],
            started_at=e["started_at"],
            last_activity=e["last_activity"],
            all_synced=bool(e["all_synced"]),
        )
        for e in raw_encs
    ]


@app.get(
    "/encounters/{id}",
    summary="Get all confirmed records for a specific encounter",
)
async def get_encounter_records(id: str) -> list[dict[str, Any]]:
    """Returns all audit rows for a given encounter ID."""
    rows = get_records_for_encounter(id)
    return rows


@app.get(
    "/encounters/{id}/report",
    summary="Render clinical handover report as offline HTML",
)
async def get_encounter_html_report(id: str) -> Response:
    """Returns rendered printable HTML handover summary for hospital transfer."""
    html_content = render_html_report(id)
    return Response(content=html_content, media_type="text/html")


@app.get(
    "/encounters/{id}/report.pdf",
    summary="Download clinical handover report as PDF",
)
async def get_encounter_pdf_report(id: str) -> Response:
    """Returns rendered PDF handover summary for printing or archiving."""
    pdf_bytes = render_pdf_report(id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=handover_{id}.pdf"},
    )


@app.post(
    "/extract",
    response_model=ExtractionResult,
    summary="Direct clinical note extraction endpoint",
)
async def extract_note(payload: ExtractRequest) -> ExtractionResult:
    """Extracts medications and procedures from clinical note text."""
    try:
        result, _ = extract_clinical_data(payload.text)
        return result
    except OllamaServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Local Ollama service is not running or unreachable. Ensure Ollama is running at http://127.0.0.1:11434",
        ) from exc
    except ExtractionError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to extract valid clinical schema after retry",
        ) from exc


@app.post(
    "/sync",
    summary="Push pending confirmed records to Supabase cloud",
)
async def trigger_sync() -> dict[str, Any]:
    """Pushes unsynced audit rows to Supabase with idempotent deduplication."""
    try:
        return sync_to_supabase()
    except SyncError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


@app.post(
    "/clinical-ner/entities",
    summary="Extract clinical concepts using n2c2 NER model",
)
async def extract_concepts(payload: ExtractRequest) -> dict[str, Any]:
    """Extracts treatments, problems, and tests using fine-tuned n2c2 BERT."""
    entities = extract_clinical_entities(payload.text)
    return {
        "text": payload.text,
        "model": settings.N2C2_MODEL_NAME,
        "total_entities": len(entities),
        "entities": [e.model_dump() for e in entities],
    }


@app.post(
    "/clinical-ner/embedding",
    summary="Generate clinical embedding using MIMIC-III Bio_ClinicalBERT",
)
async def get_embedding(payload: ExtractRequest) -> dict[str, Any]:
    """Generates a 768-dimensional clinical representation using MIMIC-III Bio_ClinicalBERT."""
    embedding = get_mimic_embedding(payload.text)
    if embedding is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MIMIC-III embedding model unavailable",
        )
    return {
        "model": settings.MIMIC_MODEL_NAME,
        "embedding_dim": len(embedding),
        "embedding": embedding,
    }


# Mount static assets for local-ui if dist exists
dist_dir = settings.ROOT_DIR / "local-ui" / "dist"
if dist_dir.exists():
    app.mount("/assets", StaticFiles(directory=dist_dir / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        file_path = dist_dir / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(dist_dir / "index.html")
