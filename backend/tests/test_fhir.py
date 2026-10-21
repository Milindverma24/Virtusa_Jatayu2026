"""Unit tests for FHIR-lite Bundle generation in fhir.py."""

from app.fhir import generate_item_id, to_fhir_bundle
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem


def test_generate_item_id() -> None:
    enc_id = "ENC-4F2A91B7"
    assert generate_item_id(enc_id, "medication", 0) == "ENC-4F2A91B7-med-1"
    assert generate_item_id(enc_id, "medication", 1) == "ENC-4F2A91B7-med-2"
    assert generate_item_id(enc_id, "procedure", 0) == "ENC-4F2A91B7-proc-1"


def test_fhir_bundle_structure_example_a() -> None:
    enc_id = "ENC-4F2A91B7"
    meds = [
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
    ]
    procs = [
        ProcedureItem(
            name="IV access",
            details="18G, left antecubital",
            source_text="IV 18 gauge left AC",
        )
    ]

    extraction = ExtractionResult(medications=meds, procedures=procs)
    bundle = to_fhir_bundle(extraction, enc_id)

    assert bundle["resourceType"] == "Bundle"
    assert bundle["type"] == "collection"
    assert len(bundle["entry"]) == 3

    # First entry: Aspirin
    entry_0 = bundle["entry"][0]
    res_0 = entry_0["resource"]
    assert res_0["resourceType"] == "MedicationAdministration"
    assert res_0["id"] == "ENC-4F2A91B7-med-1"
    assert res_0["status"] == "completed"
    assert res_0["medicationCodeableConcept"]["text"] == "aspirin"
    assert res_0["effectiveDateTime"] == "14:32"
    assert res_0["dosage"]["route"]["text"] == "PO"
    assert res_0["dosage"]["dose"]["value"] == 324.0
    assert res_0["dosage"]["dose"]["unit"] == "mg"
    assert res_0["note"][0]["text"] == "14:32 gave aspirin 324 mg PO chewed"
    assert res_0["extension"][0]["valueString"] == "14:32 gave aspirin 324 mg PO chewed"

    # Second entry: Nitro
    entry_1 = bundle["entry"][1]
    res_1 = entry_1["resource"]
    assert res_1["id"] == "ENC-4F2A91B7-med-2"
    assert res_1["dosage"]["dose"]["value"] == 0.4

    # Third entry: Procedure
    entry_2 = bundle["entry"][2]
    res_2 = entry_2["resource"]
    assert res_2["resourceType"] == "Procedure"
    assert res_2["id"] == "ENC-4F2A91B7-proc-1"
    assert res_2["status"] == "completed"
    assert res_2["code"]["text"] == "IV access"
    assert res_2["note"][0]["text"] == "18G, left antecubital"
    assert res_2["extension"][0]["valueString"] == "IV 18 gauge left AC"


def test_fhir_bundle_handles_missing_fields() -> None:
    """Verifies that optional fields do not generate empty or invalid nested structures."""
    enc_id = "ENC-TEST1234"
    med = MedicationItem(drug="naloxone", source_text="Gave narcan intranasal")
    proc = ProcedureItem(name="c-collar", source_text="placed c-collar")

    bundle = to_fhir_bundle(ExtractionResult(medications=[med], procedures=[proc]), enc_id)
    assert len(bundle["entry"]) == 2

    med_res = bundle["entry"][0]["resource"]
    assert "effectiveDateTime" not in med_res
    assert "dosage" not in med_res

    proc_res = bundle["entry"][1]["resource"]
    assert "performedDateTime" not in proc_res
    assert "note" not in proc_res
