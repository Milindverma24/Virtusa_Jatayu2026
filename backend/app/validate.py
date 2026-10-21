"""Pure Python clinical validation engine for Sanjeevani Lekh.

Enforces all 10 validation rules from PROMPTS.md Section 6 without any AI dependency.
"""

from pathlib import Path
import re
from typing import Callable, Optional

from app.normalise import load_drug_reference, normalise_drug_name
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem, ValidationFlag, ValidationResult

# Spoken correction trigger keywords
SPOKEN_CORRECTION_PHRASES = [
    "sorry",
    "i mean",
    "correction",
    "scratch that",
]

# Patterns for verifying if a unit was actually spoken or written in source_text
UNIT_PATTERNS: dict[str, re.Pattern] = {
    "mg": re.compile(r"\b(mg|milligram|milligrams)\b", re.IGNORECASE),
    "mcg": re.compile(r"\b(mcg|microgram|micrograms|mic|mics)\b", re.IGNORECASE),
    "g": re.compile(r"\b(g|gram|grams)\b", re.IGNORECASE),
    "mL": re.compile(r"\b(ml|milliliter|milliliters|millilitre|millilitres|cc|ccs)\b", re.IGNORECASE),
    "units": re.compile(r"\b(units?|u)\b", re.IGNORECASE),
    "L/min": re.compile(
        r"(\bl/min\b|\blpm\b|\bliters?\s*(per|/)\s*min(ute)?\b|\blitres?\s*(per|/)\s*min(ute)?\b)",
        re.IGNORECASE,
    ),
    "%": re.compile(r"(%|\bpercent\b)", re.IGNORECASE),
    "mg/kg": re.compile(r"\b(mg/kg|mg\s*per\s*kg)\b", re.IGNORECASE),
    "mcg/kg": re.compile(r"\b(mcg/kg|mcg\s*per\s*kg|mics?\s*per\s*kg)\b", re.IGNORECASE),
}


def normalize_for_search(text: str) -> str:
    """Removes punctuation and normalizes whitespace for exact source text matching."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return " ".join(cleaned.split())


def check_source_text_presence(source_text: str, note_text: str) -> bool:
    """Returns True if the source_text is present in the original clinical note."""
    norm_source = normalize_for_search(source_text)
    norm_note = normalize_for_search(note_text)
    return norm_source in norm_note if norm_source else False


def validate_medication(
    med: MedicationItem,
    index: int,
    note_text: str,
    drug_reference: dict[str, dict],
) -> list[ValidationFlag]:
    """Validates a single medication item against clinical and source grounding rules."""
    flags: list[ValidationFlag] = []

    # 1. source_text_not_found
    if not check_source_text_presence(med.source_text, note_text):
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="medication",
                code="source_text_not_found",
                message=f"Verbatim excerpt '{med.source_text}' not found in the original note",
                severity="needs_review",
                source_text=med.source_text,
            )
        )

    # 2. missing_dose (except flow given for oxygen)
    if med.dose_value is None:
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="medication",
                code="missing_dose",
                message=f"Missing dosage value for {med.drug}",
                severity="needs_review",
                source_text=med.source_text,
            )
        )

    # 3. missing_unit
    if med.dose_value is not None and not med.dose_unit:
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="medication",
                code="missing_unit",
                message=f"Dose given ({med.dose_value}) but unit of measurement is missing",
                severity="needs_review",
                source_text=med.source_text,
            )
        )

    # 4. unit_inferred (unit present in extracted item but NOT mentioned in source_text)
    if med.dose_unit and med.dose_unit in UNIT_PATTERNS:
        pattern = UNIT_PATTERNS[med.dose_unit]
        if not pattern.search(med.source_text):
            flags.append(
                ValidationFlag(
                    item_index=index,
                    item_type="medication",
                    code="unit_inferred",
                    message=f"Unit '{med.dose_unit}' inferred; not explicitly stated in source words",
                    severity="needs_review",
                    source_text=med.source_text,
                )
            )

    # 5. missing_route
    if not med.route:
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="medication",
                code="missing_route",
                message=f"Administration route is missing for {med.drug}",
                severity="needs_review",
                source_text=med.source_text,
            )
        )

    # 6. missing_time (info only, not blocking)
    if not med.time:
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="medication",
                code="missing_time",
                message=f"No administration time specified for {med.drug}",
                severity="info",
                source_text=med.source_text,
            )
        )

    # 7. unknown_drug & 8. dose_out_of_range
    canonical_drug = normalise_drug_name(med.drug)
    if canonical_drug not in drug_reference:
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="medication",
                code="unknown_drug",
                message=f"'{med.drug}' is not in reference formulary",
                severity="needs_review",
                source_text=med.source_text,
            )
        )
    else:
        drug_data = drug_reference[canonical_drug]
        ref_range = drug_data.get("range")
        if ref_range and med.dose_value is not None:
            min_dose, max_dose = ref_range[0], ref_range[1]
            if med.dose_value < min_dose or med.dose_value > max_dose:
                flags.append(
                    ValidationFlag(
                        item_index=index,
                        item_type="medication",
                        code="dose_out_of_range",
                        message=(
                            f"Dose {med.dose_value} {med.dose_unit or ''} outside standard range "
                            f"[{min_dose}, {max_dose}] for {canonical_drug}"
                        ),
                        severity="needs_review",
                        source_text=med.source_text,
                    )
                )

    # 9. spoken_correction
    source_lower = med.source_text.lower()
    for phrase in SPOKEN_CORRECTION_PHRASES:
        if phrase in source_lower:
            flags.append(
                ValidationFlag(
                    item_index=index,
                    item_type="medication",
                    code="spoken_correction",
                    message=f"Spoken correction detected in excerpt: '{phrase}'",
                    severity="needs_review",
                    source_text=med.source_text,
                )
            )
            break

    return flags


def validate_procedure(
    proc: ProcedureItem,
    index: int,
    note_text: str,
) -> list[ValidationFlag]:
    """Validates a single procedure item."""
    flags: list[ValidationFlag] = []

    # 1. source_text_not_found
    if not check_source_text_presence(proc.source_text, note_text):
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="procedure",
                code="source_text_not_found",
                message=f"Verbatim excerpt '{proc.source_text}' not found in the original note",
                severity="needs_review",
                source_text=proc.source_text,
            )
        )

    # 2. missing_time (info only)
    if not proc.time:
        flags.append(
            ValidationFlag(
                item_index=index,
                item_type="procedure",
                code="missing_time",
                message=f"No execution time specified for procedure '{proc.name}'",
                severity="info",
                source_text=proc.source_text,
            )
        )

    # 3. spoken_correction
    source_lower = proc.source_text.lower()
    for phrase in SPOKEN_CORRECTION_PHRASES:
        if phrase in source_lower:
            flags.append(
                ValidationFlag(
                    item_index=index,
                    item_type="procedure",
                    code="spoken_correction",
                    message=f"Spoken correction detected in excerpt: '{phrase}'",
                    severity="needs_review",
                    source_text=proc.source_text,
                )
            )
            break

    return flags


def validate_record(
    result: ExtractionResult,
    note_text: str,
    drug_reference_path: Optional[Path] = None,
    med7_checker: Optional[Callable[[ExtractionResult, str], list[ValidationFlag]]] = None,
) -> ValidationResult:
    """Executes all deterministic validation checks across medications and procedures.

    Args:
        result: ExtractionResult from the extraction stage.
        note_text: Original raw input note text.
        drug_reference_path: Optional path to drug_reference.json.
        med7_checker: Optional hook to run med7 cross-check.

    Returns:
        ValidationResult containing all flags and summary counts.
    """
    drug_ref = load_drug_reference(drug_reference_path)
    all_flags: list[ValidationFlag] = []

    # Validate individual medications
    for idx, med in enumerate(result.medications):
        all_flags.extend(validate_medication(med, idx, note_text, drug_ref))

    # Validate individual procedures
    for idx, proc in enumerate(result.procedures):
        all_flags.extend(validate_procedure(proc, idx, note_text))

    # Check for duplicate medication items
    seen_meds: dict[tuple, int] = {}
    for idx, med in enumerate(result.medications):
        sig = (
            normalise_drug_name(med.drug),
            med.dose_value,
            med.dose_unit,
            med.route,
            med.time,
        )
        if sig in seen_meds:
            all_flags.append(
                ValidationFlag(
                    item_index=idx,
                    item_type="medication",
                    code="duplicate_item",
                    message=f"Duplicate medication administration detected for {med.drug}",
                    severity="needs_review",
                    source_text=med.source_text,
                )
            )
        else:
            seen_meds[sig] = idx

    # Optional med7 cross-check if provided
    if med7_checker is not None:
        med7_flags = med7_checker(result, note_text)
        all_flags.extend(med7_flags)

    needs_review_count = sum(1 for f in all_flags if f.severity == "needs_review")
    info_count = sum(1 for f in all_flags if f.severity == "info")

    return ValidationResult(
        flags=all_flags,
        needs_review_count=needs_review_count,
        info_count=info_count,
        is_valid=(needs_review_count == 0),
    )
