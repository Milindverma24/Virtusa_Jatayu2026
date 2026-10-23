"""Rule-based clinical entity extractor for ultra-fast, zero-lag extraction.

Used as a reliable offline fallback when local Ollama is disabled or deleted to save laptop resources.
Extracts medications, dosages, routes, procedures, and timestamps with zero CPU lag.
"""

import re
from typing import List
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem
from app.med_indications import get_medication_indication
from app.normalise import (
    normalise_drug_name,
    normalise_route,
    normalise_unit,
    normalise_spoken_number,
    normalise_time,
    ROUTE_MAPPINGS,
    UNIT_MAPPINGS,
)

# Common clinical medications and EMS drugs
COMMON_DRUGS = [
    "aspirin", "asa", "nitroglycerin", "nitro", "epinephrine", "epi",
    "morphine", "fentanyl", "narcan", "naloxone", "albuterol", "ventolin",
    "atrovent", "ipratropium", "ondansetron", "zofran", "amiodarone",
    "adenosine", "dextrose", "d50", "d10", "glucagon", "midazolam", "versed",
    "ketamine", "oxygen", "o2", "normal saline", "saline", "lactated ringers",
    "lorazepam", "ativan", "metoprolol", "heparin", "plavix", "clopidogrel",
    "insulin", "paracetamol", "acetaminophen", "tylenol", "ibuprofen", "advil",
    "diazepam", "valium", "haloperidol", "haldol", "diphenhydramine", "benadryl",
    "prednisone", "methylprednisolone", "solu-medrol", "dexamethasone",
]

# Common procedures
PROCEDURE_PATTERNS = [
    (r"\b(iv\s*(?:access|line|gauge|start|placed|in\s*place|18\s*g|20\s*g)?)\b", "IV access"),
    (r"\b(12[\s-]lead(?:\s*ecg|\s*ekg)?|ecg|ekg)\b", "12-lead ECG"),
    (r"\b(cpr|chest\s*compressions)\b", "CPR"),
    (r"\b(intubation|endotracheal\s*tube|ett|intubated)\b", "Endotracheal intubation"),
    (r"\b(bag\s*valve\s*mask|bvm|bagged)\b", "Bag valve mask ventilation"),
    (r"\b(defibrillation|defib|shock\s*delivered|defibrillated)\b", "Defibrillation"),
    (r"\b(synchronized\s*cardioversion|cardioversion)\b", "Synchronized cardioversion"),
    (r"\b(transcutaneous\s*pacing|pacing)\b", "Transcutaneous pacing"),
    (r"\b(tourniquet|tq\s*applied)\b", "Tourniquet application"),
    (r"\b(wound\s*packing|pressure\s*dressing)\b", "Wound management"),
    (r"\b(c-collar|cervical\s*collar|spinal\s*immobilization|backboard)\b", "Spinal motion restriction"),
    (r"\b(splint(?:ing|ed)?)\b", "Splint application"),
    (r"\b(suction(?:ing|ed)?)\b", "Airway suctioning"),
    (r"\b(non-rebreather|nrb|nasal\s*cannula)\b", "Oxygen therapy administration"),
    (r"\b(nebulizer|neb\s*treatment)\b", "Nebulizer administration"),
]


def extract_with_rules(text: str) -> ExtractionResult:
    """Extracts clinical entities using deterministic regex patterns.
    
    Zero lag, <1ms execution, no GPU required.
    """
    if not text or not text.strip():
        return ExtractionResult(medications=[], procedures=[])

    clean = text.strip()
    sentences = re.split(r"[.;\n]+", clean)

    medications: List[MedicationItem] = []
    procedures: List[ProcedureItem] = []

    # Regex for times like 14:32, 11:20 am, at 10:15
    time_regex = re.compile(r"\b(?:at\s*)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*(am|pm))?\b", re.IGNORECASE)

    # Regex for dose + unit, e.g., 324 mg, 0.4 mg, 15 L/min, 50 %, 200 ml, 4 puffs
    unit_keys = sorted(UNIT_MAPPINGS.keys(), key=len, reverse=True)
    unit_pattern = "|".join(re.escape(u) for u in unit_keys)
    dose_regex = re.compile(
        rf"\b(\d+(?:\.\d+)?|point\s+\w+|\w+\s+hundred|\w+)\s*({unit_pattern})\b",
        re.IGNORECASE
    )

    # Route pattern
    route_keys = sorted(ROUTE_MAPPINGS.keys(), key=len, reverse=True)
    route_pattern = "|".join(rf"\b{re.escape(r)}\b" for r in route_keys)
    route_regex = re.compile(route_pattern, re.IGNORECASE)

    # Check for medications
    for sent in sentences:
        sent_str = sent.strip()
        if not sent_str:
            continue

        sent_time_match = time_regex.search(sent_str)
        sent_time = None
        if sent_time_match:
            raw_t = sent_time_match.group(0).lower().replace("at", "").strip()
            sent_time = normalise_time(raw_t)

        sent_lower = sent_str.lower()

        # Check for medications in this sentence
        for drug in COMMON_DRUGS:
            drug_regex = rf"\b{re.escape(drug)}\b"
            if re.search(drug_regex, sent_lower):
                # Found drug! Extract dose, unit, route
                dose_val = None
                unit_val = None
                dose_match = dose_regex.search(sent_str)
                if dose_match:
                    raw_num = dose_match.group(1)
                    raw_unit = dose_match.group(2)
                    dose_val = normalise_spoken_number(raw_num)
                    unit_val = normalise_unit(raw_unit)
                else:
                    # Match numeric or spoken numbers even without explicit unit (e.g. "nitro point four")
                    for num_match in re.finditer(r"\b(point\s+\w+|zero\s+point\s+\w+|\d+(?:\.\d+)?)\b", sent_str, re.IGNORECASE):
                        match_text = num_match.group(1)
                        # Ensure we don't accidentally grab the hour/minute from time
                        if sent_time and (match_text in sent_time):
                            continue
                        val = normalise_spoken_number(match_text)
                        if val is not None:
                            dose_val = val
                            break

                route_val = None
                route_match = route_regex.search(sent_str)
                if route_match:
                    route_val = normalise_route(route_match.group(0))

                norm_drug = normalise_drug_name(drug)
                med = MedicationItem(
                    time=sent_time,
                    drug=norm_drug,
                    dose_value=dose_val,
                    dose_unit=unit_val,
                    route=route_val,
                    source_text=sent_str,
                    indication=get_medication_indication(norm_drug),
                )
                medications.append(med)
                break  # avoid multiple drug matches for same alias in same segment

        # Check for procedures in this sentence
        for pattern, proc_name in PROCEDURE_PATTERNS:
            if re.search(pattern, sent_lower):
                # Make sure it's not already classified as oxygen medication
                if proc_name == "Oxygen therapy administration" and any(m.drug == "oxygen" for m in medications):
                    continue
                proc = ProcedureItem(
                    time=sent_time,
                    name=proc_name,
                    details=sent_str,
                    source_text=sent_str,
                )
                # Avoid duplicates
                if not any(p.name == proc_name for p in procedures):
                    procedures.append(proc)

    # If nothing matched but text exists, add an observation/procedure record so data is not lost
    if not medications and not procedures and clean:
        procedures.append(
            ProcedureItem(
                time=None,
                name="Clinical Assessment / Field Note",
                details=clean,
                source_text=clean,
            )
        )

    return ExtractionResult(medications=medications, procedures=procedures)
