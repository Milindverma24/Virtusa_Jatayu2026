"""Unit and integration tests for validation rules in validate.py.

Includes passing and failing test cases for every validation code in PROMPTS.md,
as well as end-to-end tests for Examples B, C, and D.
"""

import json
from pathlib import Path
from app.config import settings
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem, ValidationFlag
from app.validate import validate_record


# 1. source_text_not_found
def test_code_source_text_not_found_triggers() -> None:
    note = "14:32 gave aspirin 324 mg PO chewed."
    # Fabricated / hallucinated source text
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", source_text="gave morphine 10 mg")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "source_text_not_found" for f in res.flags)
    assert res.is_valid is False


def test_code_source_text_not_found_passes() -> None:
    note = "14:32 gave aspirin 324 mg PO chewed."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="14:32", source_text="14:32 gave aspirin 324 mg PO chewed")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "source_text_not_found" for f in res.flags)


# 2. missing_dose
def test_code_missing_dose_triggers() -> None:
    note = "Gave narcan intranasal."
    item = MedicationItem(drug="naloxone", route="IN", source_text="Gave narcan intranasal")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "missing_dose" for f in res.flags)


def test_code_missing_dose_passes() -> None:
    note = "Gave narcan 2 mg intranasal."
    item = MedicationItem(drug="naloxone", dose_value=2.0, dose_unit="mg", route="IN", time="10:00", source_text="Gave narcan 2 mg intranasal")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "missing_dose" for f in res.flags)


# 3. missing_unit
def test_code_missing_unit_triggers() -> None:
    note = "Gave aspirin 324 chewed."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit=None, route="PO", source_text="aspirin 324 chewed")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "missing_unit" for f in res.flags)


def test_code_missing_unit_passes() -> None:
    note = "Gave aspirin 324 mg chewed."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="10:00", source_text="aspirin 324 mg chewed")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "missing_unit" for f in res.flags)


# 4. unit_inferred
def test_code_unit_inferred_triggers() -> None:
    # "mg" not spoken in note, model inferred mg
    note = "14:38 nitro point four under the tongue."
    item = MedicationItem(drug="nitroglycerin", dose_value=0.4, dose_unit="mg", route="SL", time="14:38", source_text="14:38 nitro point four under the tongue")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "unit_inferred" for f in res.flags)


def test_code_unit_inferred_passes() -> None:
    # "mg" explicitly spoken
    note = "14:38 nitro 0.4 mg under the tongue."
    item = MedicationItem(drug="nitroglycerin", dose_value=0.4, dose_unit="mg", route="SL", time="14:38", source_text="14:38 nitro 0.4 mg under the tongue")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "unit_inferred" for f in res.flags)


# 5. missing_route
def test_code_missing_route_triggers() -> None:
    note = "Gave aspirin 324 mg."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route=None, source_text="aspirin 324 mg")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "missing_route" for f in res.flags)


def test_code_missing_route_passes() -> None:
    note = "Gave aspirin 324 mg PO."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="10:00", source_text="aspirin 324 mg PO")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "missing_route" for f in res.flags)


# 6. missing_time (info only)
def test_code_missing_time_triggers() -> None:
    note = "Gave aspirin 324 mg PO."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time=None, source_text="aspirin 324 mg PO")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    flag = next(f for f in res.flags if f.code == "missing_time")
    assert flag.severity == "info"


def test_code_missing_time_passes() -> None:
    note = "14:32 gave aspirin 324 mg PO."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="14:32", source_text="14:32 gave aspirin 324 mg PO")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "missing_time" for f in res.flags)


# 7. dose_out_of_range
def test_code_dose_out_of_range_triggers() -> None:
    # 3240 mg is 10x max aspirin safe EMS dose [81, 325]
    note = "Gave aspirin 3240 mg PO."
    item = MedicationItem(drug="aspirin", dose_value=3240.0, dose_unit="mg", route="PO", time="10:00", source_text="aspirin 3240 mg PO")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "dose_out_of_range" for f in res.flags)


def test_code_dose_out_of_range_passes() -> None:
    note = "Gave aspirin 324 mg PO."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="10:00", source_text="aspirin 324 mg PO")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "dose_out_of_range" for f in res.flags)


# 8. unknown_drug
def test_code_unknown_drug_triggers() -> None:
    note = "Gave secret_med 50 mg IV."
    item = MedicationItem(drug="secret_med", dose_value=50.0, dose_unit="mg", route="IV", time="10:00", source_text="secret_med 50 mg IV")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "unknown_drug" for f in res.flags)


def test_code_unknown_drug_passes() -> None:
    note = "Gave ondansetron 4 mg IV."
    item = MedicationItem(drug="ondansetron", dose_value=4.0, dose_unit="mg", route="IV", time="10:00", source_text="ondansetron 4 mg IV")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "unknown_drug" for f in res.flags)


# 9. spoken_correction
def test_code_spoken_correction_triggers() -> None:
    note = "Epi 1 mg IM, sorry, point three mg IM to the thigh at 09:12."
    item = MedicationItem(drug="epinephrine", dose_value=0.3, dose_unit="mg", route="IM", time="09:12", source_text="Epi 1 mg IM, sorry, point three mg IM to the thigh at 09:12")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert any(f.code == "spoken_correction" for f in res.flags)


def test_code_spoken_correction_passes() -> None:
    note = "Epi 0.3 mg IM to the thigh at 09:12."
    item = MedicationItem(drug="epinephrine", dose_value=0.3, dose_unit="mg", route="IM", time="09:12", source_text="Epi 0.3 mg IM to the thigh at 09:12")
    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note)
    assert not any(f.code == "spoken_correction" for f in res.flags)


# 10. duplicate_item
def test_code_duplicate_item_triggers() -> None:
    note = "14:32 gave aspirin 324 mg PO. 14:32 gave aspirin 324 mg PO."
    item1 = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="14:32", source_text="14:32 gave aspirin 324 mg PO")
    item2 = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="14:32", source_text="14:32 gave aspirin 324 mg PO")
    res = validate_record(ExtractionResult(medications=[item1, item2], procedures=[]), note)
    assert any(f.code == "duplicate_item" for f in res.flags)


def test_code_duplicate_item_passes() -> None:
    note = "14:32 gave aspirin 324 mg PO. 14:38 nitro 0.4 mg SL."
    item1 = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="14:32", source_text="14:32 gave aspirin 324 mg PO")
    item2 = MedicationItem(drug="nitroglycerin", dose_value=0.4, dose_unit="mg", route="SL", time="14:38", source_text="14:38 nitro 0.4 mg SL")
    res = validate_record(ExtractionResult(medications=[item1, item2], procedures=[]), note)
    assert not any(f.code == "duplicate_item" for f in res.flags)


# 11. med7_disagrees
def test_code_med7_disagrees_triggers() -> None:
    note = "Gave aspirin 324 mg PO."
    item = MedicationItem(drug="aspirin", dose_value=324.0, dose_unit="mg", route="PO", time="10:00", source_text="aspirin 324 mg PO")

    def mock_med7(res: ExtractionResult, text: str) -> list[ValidationFlag]:
        return [
            ValidationFlag(
                item_index=0,
                item_type="medication",
                code="med7_disagrees",
                message="med7 model detected different dosage",
                severity="needs_review",
                source_text=item.source_text,
            )
        ]

    res = validate_record(ExtractionResult(medications=[item], procedures=[]), note, med7_checker=mock_med7)
    assert any(f.code == "med7_disagrees" for f in res.flags)


# =========================================================================
# WORKED EXAMPLES B, C, AND D TESTS
# =========================================================================

def test_example_b_negation_and_plan() -> None:
    """Example B: Negation and planned items are excluded; only oxygen is extracted."""
    note_file = settings.ROOT_DIR / "test-data" / "notes" / "note_002.txt"
    ans_file = settings.ROOT_DIR / "test-data" / "answers" / "note_002.json"

    note = note_file.read_text(encoding="utf-8")
    data = json.loads(ans_file.read_text(encoding="utf-8"))
    extraction = ExtractionResult.model_validate(data)

    # Must contain ONLY oxygen
    assert len(extraction.medications) == 1
    assert extraction.medications[0].drug == "oxygen"
    assert extraction.medications[0].dose_value == 4.0
    assert extraction.medications[0].dose_unit == "L/min"
    assert extraction.medications[0].route == "INH"
    assert len(extraction.procedures) == 0

    res = validate_record(extraction, note)
    # Oxygen has no explicit time in the note so missing_time info flag is present
    blocking_flags = [f for f in res.flags if f.severity == "needs_review"]
    assert len(blocking_flags) == 0
    assert any(f.code == "missing_time" and f.severity == "info" for f in res.flags)


def test_example_c_spoken_correction() -> None:
    """Example C: Spoken correction keeps corrected value and flags spoken_correction."""
    note_file = settings.ROOT_DIR / "test-data" / "notes" / "note_003.txt"
    ans_file = settings.ROOT_DIR / "test-data" / "answers" / "note_003.json"

    note = note_file.read_text(encoding="utf-8")
    data = json.loads(ans_file.read_text(encoding="utf-8"))
    extraction = ExtractionResult.model_validate(data)

    assert len(extraction.medications) == 1
    epi = extraction.medications[0]
    assert epi.drug == "epinephrine"
    assert epi.dose_value == 0.3
    assert epi.dose_unit == "mg"
    assert epi.route == "IM"
    assert epi.time == "09:12"

    res = validate_record(extraction, note)
    assert any(f.code == "spoken_correction" for f in res.flags)
    assert res.is_valid is False


def test_example_d_missing_information() -> None:
    """Example D: Narcan given without dose or time; flags missing_dose and missing_time."""
    note_file = settings.ROOT_DIR / "test-data" / "notes" / "note_004.txt"
    ans_file = settings.ROOT_DIR / "test-data" / "answers" / "note_004.json"

    note = note_file.read_text(encoding="utf-8")
    data = json.loads(ans_file.read_text(encoding="utf-8"))
    extraction = ExtractionResult.model_validate(data)

    assert len(extraction.medications) == 1
    narcan = extraction.medications[0]
    assert narcan.drug == "naloxone"
    assert narcan.dose_value is None
    assert narcan.dose_unit is None
    assert narcan.route == "IN"
    assert narcan.time is None

    res = validate_record(extraction, note)
    codes = {f.code for f in res.flags}
    assert "missing_dose" in codes
    assert "missing_time" in codes
    assert res.is_valid is False
