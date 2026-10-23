"""FHIR-lite mapper converting extracted clinical data into a FHIR R4 Bundle.

Creates MedicationAdministration and Procedure resources matching ARCHITECTURE.md.
"""

from typing import Any
import uuid

from app.schemas import ExtractionResult, MedicationItem, ProcedureItem


def generate_item_id(encounter_id: str, item_type: str, index: int) -> str:
    """Generates a standardized clinical item ID (e.g., 'ENC-4F2A91B7-med-1')."""
    prefix = "med" if item_type == "medication" else "proc"
    return f"{encounter_id}-{prefix}-{index + 1}"


def map_medication_to_fhir(med: MedicationItem, item_id: str) -> dict[str, Any]:
    """Maps MedicationItem to FHIR MedicationAdministration resource."""
    resource: dict[str, Any] = {
        "resourceType": "MedicationAdministration",
        "id": item_id,
        "status": "completed",
        "medicationCodeableConcept": {
            "text": med.drug,
        },
        "note": [
            {"text": med.source_text}
        ],
        "extension": [
            {
                "url": "http://sanjeevani-lekh.org/fhir/source_text",
                "valueString": med.source_text,
            }
        ],
    }

    if med.indication:
        resource["reasonCode"] = [{"text": med.indication}]
        resource["extension"].append({
            "url": "http://sanjeevani-lekh.org/fhir/indication",
            "valueString": med.indication,
        })

    if med.time:
        resource["effectiveDateTime"] = med.time

    dosage: dict[str, Any] = {}
    if med.route:
        dosage["route"] = {
            "text": med.route,
        }
    if med.dose_value is not None:
        dosage["dose"] = {
            "value": med.dose_value,
            "unit": med.dose_unit or "",
            "system": "http://unitsofmeasure.org",
            "code": med.dose_unit or "",
        }
    if dosage:
        resource["dosage"] = dosage

    return {
        "fullUrl": f"urn:uuid:{uuid.uuid4()}",
        "resource": resource,
    }


def map_procedure_to_fhir(proc: ProcedureItem, item_id: str) -> dict[str, Any]:
    """Maps ProcedureItem to FHIR Procedure resource."""
    resource: dict[str, Any] = {
        "resourceType": "Procedure",
        "id": item_id,
        "status": "completed",
        "code": {
            "text": proc.name,
        },
        "extension": [
            {
                "url": "http://sanjeevani-lekh.org/fhir/source_text",
                "valueString": proc.source_text,
            }
        ],
    }

    if proc.time:
        resource["performedDateTime"] = proc.time

    if proc.details:
        resource["note"] = [
            {"text": proc.details}
        ]

    return {
        "fullUrl": f"urn:uuid:{uuid.uuid4()}",
        "resource": resource,
    }


def to_fhir_bundle(result: ExtractionResult, encounter_id: str) -> dict[str, Any]:
    """Converts structured extraction results into a FHIR-lite collection Bundle.

    Args:
        result: ExtractionResult containing medications and procedures.
        encounter_id: Clinical encounter identifier for grouping.

    Returns:
        A dictionary representation of the FHIR collection bundle.
    """
    entries: list[dict[str, Any]] = []

    for idx, med in enumerate(result.medications):
        item_id = generate_item_id(encounter_id, "medication", idx)
        entries.append(map_medication_to_fhir(med, item_id))

    for idx, proc in enumerate(result.procedures):
        item_id = generate_item_id(encounter_id, "procedure", idx)
        entries.append(map_procedure_to_fhir(proc, item_id))

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": entries,
    }
