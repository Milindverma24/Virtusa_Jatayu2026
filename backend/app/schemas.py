"""Pydantic v2 schemas for request validation, Ollama JSON schema constraint, and API responses."""

from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

# Allowed clinical routes and dosage units as strictly specified in PROMPTS.md
AllowedRoute = Literal[
    "IV",
    "IM",
    "IO",
    "PO",
    "SL",
    "IN",
    "NEB",
    "SC",
    "TOP",
    "ET",
    "INH",
]

AllowedUnit = Literal[
    "mg",
    "mcg",
    "g",
    "mL",
    "units",
    "L/min",
    "mg/kg",
    "mcg/kg",
    "%",
]


class MedicationItem(BaseModel):
    """Extracted medication item.

    Dose, unit, route, and time are intentionally optional to prevent
    the AI model from inventing or hallucinating missing clinical facts.
    """

    model_config = ConfigDict(extra="ignore")

    time: str | None = Field(
        default=None,
        pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$",
        description="24-hour HH:MM format if stated for this medication",
    )
    drug: str = Field(
        ...,
        description="Generic drug name in lowercase",
    )
    dose_value: float | None = Field(
        default=None,
        description="Numeric dosage value only",
    )
    dose_unit: AllowedUnit | None = Field(
        default=None,
        description="Standardized unit of measurement",
    )
    route: AllowedRoute | None = Field(
        default=None,
        description="Standardized administration route",
    )
    source_text: str = Field(
        ...,
        description="Exact verbatim excerpt from the note grounding this item",
    )


class ProcedureItem(BaseModel):
    """Extracted clinical procedure item."""

    model_config = ConfigDict(extra="ignore")

    time: str | None = Field(
        default=None,
        pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$",
        description="24-hour HH:MM format if stated for this procedure",
    )
    name: str = Field(
        ...,
        description="Standard concise name of the procedure",
    )
    details: str | None = Field(
        default=None,
        description="Specific anatomical site, size, or parameters",
    )
    source_text: str = Field(
        ...,
        description="Exact verbatim excerpt from the note grounding this item",
    )


class ExtractionResult(BaseModel):
    """Structured extraction payload returned by the LLM."""

    model_config = ConfigDict(extra="ignore")

    medications: list[MedicationItem] = Field(
        default_factory=list,
        description="List of medications administered",
    )
    procedures: list[ProcedureItem] = Field(
        default_factory=list,
        description="List of procedures performed",
    )


def get_extraction_json_schema() -> dict[str, Any]:
    """Returns the strict JSON schema passed to Ollama format parameter.

    Matches PROMPTS.md Section 4 explicitly.
    """
    return {
        "type": "object",
        "properties": {
          "medications": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "time": {
                  "type": "string",
                  "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$"
                },
                "drug": {"type": "string"},
                "dose_value": {"type": "number"},
                "dose_unit": {
                  "type": "string",
                  "enum": ["mg", "mcg", "g", "mL", "units", "L/min", "mg/kg", "mcg/kg", "%"]
                },
                "route": {
                  "type": "string",
                  "enum": ["IV", "IM", "IO", "PO", "SL", "IN", "NEB", "SC", "TOP", "ET", "INH"]
                },
                "source_text": {"type": "string"}
              },
              "required": ["drug", "source_text"]
            }
          },
          "procedures": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "time": {
                  "type": "string",
                  "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$"
                },
                "name": {"type": "string"},
                "details": {"type": "string"},
                "source_text": {"type": "string"}
              },
              "required": ["name", "source_text"]
            }
          }
        },
        "required": ["medications", "procedures"]
    }


class ValidationFlag(BaseModel):
    """Validation flag describing a potential clinical or transcription discrepancy."""

    item_index: int
    item_type: Literal["medication", "procedure"]
    code: str
    message: str
    severity: Literal["needs_review", "info"]
    source_text: str


class ValidationResult(BaseModel):
    """Result of running pure Python validation rules on extracted items."""

    flags: list[ValidationFlag] = Field(default_factory=list)
    needs_review_count: int = 0
    info_count: int = 0
    is_valid: bool = True


class ModelInfo(BaseModel):
    """AI model and prompt version metadata."""

    name: str
    prompt_version: str


class TimingsMs(BaseModel):
    """Execution latency breakdown in milliseconds."""

    model_config = ConfigDict(protected_namespaces=(), populate_by_name=True)

    transcribe: Optional[int] = 0
    extract: int
    validate_ms: int = Field(default=0, alias="validate", serialization_alias="validate")


class FlagResponseItem(BaseModel):
    """Validation flag formatted for draft response."""

    item_id: str
    reason: str
    code: str
    message: str
    severity: Literal["needs_review", "info"]


class ClinicalEntity(BaseModel):
    """Clinical entity extracted by n2c2 clinical model."""

    text: str
    category: Literal["treatment", "problem", "test", "other"]
    score: float
    start: int | None = None
    end: int | None = None


class ClinicalCrossCheckResult(BaseModel):
    """Cross-validation result comparing LLM output with n2c2 and MIMIC-III models."""

    verified_treatments: list[str] = Field(
        default_factory=list,
        description="Treatments confirmed by n2c2 NER model",
    )
    potential_missed_treatments: list[str] = Field(
        default_factory=list,
        description="High-confidence treatments found in text that LLM missed",
    )
    entities: list[ClinicalEntity] = Field(
        default_factory=list,
        description="All extracted clinical entities (treatments, problems, tests)",
    )
    agreement_score: float = Field(
        default=1.0,
        description="Clinical consensus score between 0.0 and 1.0",
    )
    mimic_embedding_dim: int | None = Field(
        default=768,
        description="Dimensionality of MIMIC-III ClinicalBERT embedding",
    )


class DraftRequest(BaseModel):
    """Request payload for /draft/text."""

    text: str = Field(..., min_length=1, max_length=20000, description="Raw clinical note text")
    encounter_id: Optional[str] = Field(default=None, description="Optional existing encounter identifier")


class DraftResponse(BaseModel):
    """Draft record response matching ARCHITECTURE.md section 4."""

    draft_id: str
    encounter_id: str
    input_type: Literal["text", "voice", "image"]
    raw_text: str
    ocr_confidence: Optional[float] = None
    low_confidence_lines: list[str] = Field(default_factory=list)
    bundle: dict[str, Any]
    flags: list[FlagResponseItem] = Field(default_factory=list)
    model: ModelInfo
    timings_ms: TimingsMs
    clinical_ner: Optional[ClinicalCrossCheckResult] = None


class HealthResponse(BaseModel):


    """Response model for /health endpoint."""

    status: Literal["healthy", "degraded", "unhealthy"]
    ollama_running: bool
    model_name: str
    model_available: bool
    database_connected: bool
    active_prompt_version: str
    details: dict[str, Any] = Field(default_factory=dict)


class ExtractRequest(BaseModel):
    """Request payload for text extraction."""

    text: str = Field(..., min_length=1, max_length=20000, description="Raw clinical note text")


class ConfirmRequest(BaseModel):
    """Payload to confirm a draft record into the permanent audit log."""

    encounter_id: str
    raw_text: str
    bundle: dict[str, Any]
    reviewed_by: str = Field(..., min_length=1, description="Mandatory responder ID signing off on record")
    draft_id: Optional[str] = None
    input_type: Literal["text", "voice", "image"] = "text"
    model_name: Optional[str] = "medgemma1.5"
    prompt_version: Optional[str] = "extract-v1.0"


class ConfirmResponse(BaseModel):
    """Confirmation receipt with cryptographic hash information."""

    record_id: str
    encounter_id: str
    created_at: str
    hash: str
    prev_hash: str
    reviewed_by: str
    corrects_record_id: Optional[str] = None
    chain_verified: bool = True


class CorrectionRequest(BaseModel):
    """Payload to append an amendment record correcting an earlier row."""

    raw_text: str
    bundle: dict[str, Any]
    reviewed_by: str = Field(..., min_length=1, description="Mandatory responder ID signing off on correction")
    input_type: Literal["text", "voice", "image"] = "text"
    model_name: Optional[str] = "medgemma1.5"
    prompt_version: Optional[str] = "extract-v1.0"


class AuditVerifyResponse(BaseModel):
    """Result of full hash-chain verification."""

    valid: bool
    total_records: int
    broken_record_id: Optional[str] = None
    broken_row_id: Optional[int] = None
    message: str


class EncounterSummary(BaseModel):
    """Summary of records grouped by clinical encounter."""

    encounter_id: str
    record_count: int
    started_at: str
    last_activity: str
    all_synced: bool

