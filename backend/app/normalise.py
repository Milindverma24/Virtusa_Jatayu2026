"""Clinical text normalisation rules for routes, units, times, spoken numbers, and drug aliases."""

import json
from pathlib import Path
import re
from typing import Optional

from app.config import settings
from app.schemas import AllowedRoute, AllowedUnit

# Route mapping from spoken/abbreviated terms to standard EMS codes
ROUTE_MAPPINGS: dict[str, AllowedRoute] = {
    "po": "PO",
    "by mouth": "PO",
    "oral": "PO",
    "chewed": "PO",
    "swallowed": "PO",
    "sl": "SL",
    "sublingual": "SL",
    "under the tongue": "SL",
    "in": "IN",
    "intranasal": "IN",
    "nasal": "IN",
    "up nose": "IN",
    "neb": "NEB",
    "nebulised": "NEB",
    "nebulized": "NEB",
    "nebulizer": "NEB",
    "im": "IM",
    "intramuscular": "IM",
    "in the thigh": "IM",
    "thigh": "IM",
    "deltoid": "IM",
    "iv": "IV",
    "intravenous": "IV",
    "iv push": "IV",
    "ivp": "IV",
    "io": "IO",
    "intraosseous": "IO",
    "sc": "SC",
    "sub-q": "SC",
    "subq": "SC",
    "subcutaneous": "SC",
    "top": "TOP",
    "topical": "TOP",
    "et": "ET",
    "endotracheal": "ET",
    "inh": "INH",
    "inhaled": "INH",
    "inhalation": "INH",
    "oxygen by mask/cannula": "INH",
    "nasal cannula": "INH",
    "cannula": "INH",
    "non-rebreather": "INH",
    "nrb": "INH",
    "mask": "INH",
    "blow-by": "INH",
}

# Unit mapping to standard FHIR/EMS units
UNIT_MAPPINGS: dict[str, AllowedUnit] = {
    "mg": "mg",
    "milligram": "mg",
    "milligrams": "mg",
    "mcg": "mcg",
    "microgram": "mcg",
    "micrograms": "mcg",
    "mic": "mcg",
    "mics": "mcg",
    "g": "g",
    "gram": "g",
    "grams": "g",
    "ml": "mL",
    "milliliter": "mL",
    "milliliters": "mL",
    "millilitre": "mL",
    "millilitres": "mL",
    "cc": "mL",
    "ccs": "mL",
    "units": "units",
    "unit": "units",
    "u": "units",
    "l/min": "L/min",
    "liters per minute": "L/min",
    "litres per minute": "L/min",
    "l per min": "L/min",
    "liters/min": "L/min",
    "lpm": "L/min",
    "mg/kg": "mg/kg",
    "mcg/kg": "mcg/kg",
    "%": "%",
    "percent": "%",
}

# Spoken number dictionaries
ONES: dict[str, int] = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
    "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19,
}

TENS: dict[str, int] = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}


def load_drug_reference(reference_path: Optional[Path] = None) -> dict[str, dict]:
    """Loads reference drugs, aliases, and dose ranges from disk."""
    path = reference_path or (settings.DATA_DIR / "drug_reference.json")
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def normalise_drug_name(raw_name: str, reference_path: Optional[Path] = None) -> str:
    """Normalises brand names, colloquialisms, and acronyms to standard generic names.

    E.g., "nitro" -> "nitroglycerin", "ASA" -> "aspirin", "narcan" -> "naloxone".
    """
    cleaned = raw_name.strip().lower()
    ref = load_drug_reference(reference_path)

    # Check exact match
    if cleaned in ref:
        return cleaned

    # Check aliases
    for canonical_name, data in ref.items():
        aliases = [a.lower() for a in data.get("aliases", [])]
        if cleaned in aliases:
            return canonical_name

    # Fallback to cleaned lowercase name
    return cleaned


def normalise_route(raw_route: Optional[str]) -> Optional[AllowedRoute]:
    """Normalises freeform or spoken route description to an AllowedRoute code."""
    if not raw_route:
        return None
    cleaned = raw_route.strip().lower()
    return ROUTE_MAPPINGS.get(cleaned)


def normalise_unit(raw_unit: Optional[str]) -> Optional[AllowedUnit]:
    """Normalises freeform or spoken unit description to standard AllowedUnit code."""
    if not raw_unit:
        return None
    cleaned = raw_unit.strip().lower()
    return UNIT_MAPPINGS.get(cleaned)


def normalise_spoken_number(text: str) -> Optional[float]:
    """Converts spoken numbers into float values.

    Handles expressions like:
    - 'point four' -> 0.4
    - 'three twenty four' -> 324.0
    - 'one and a half' -> 1.5
    - 'zero point three' -> 0.3
    """
    cleaned = text.strip().lower()

    # Try direct numeric parse first
    try:
        return float(cleaned)
    except ValueError:
        pass

    # Handle 'half' or 'and a half'
    if cleaned == "half":
        return 0.5
    if " and a half" in cleaned:
        base_part = cleaned.replace(" and a half", "").strip()
        base_val = normalise_spoken_number(base_part)
        return (base_val + 0.5) if base_val is not None else 1.5

    # Handle decimals: 'point four', 'zero point three'
    if "point" in cleaned:
        parts = cleaned.split("point")
        if len(parts) == 2:
            left_str = parts[0].strip()
            right_str = parts[1].strip()

            left_val = normalise_spoken_number(left_str) if left_str else 0.0
            if left_val is None:
                left_val = 0.0

            # Right side can be single digit or sequence of digits
            right_digits = []
            for word in right_str.split():
                if word in ONES:
                    right_digits.append(str(ONES[word]))
                elif word.isdigit():
                    right_digits.append(word)

            if right_digits:
                decimal_str = f"{int(left_val)}." + "".join(right_digits)
                try:
                    return float(decimal_str)
                except ValueError:
                    pass

    # Handle compound numbers: 'three twenty four' (300 + 24 = 324)
    # Common EMS pattern: digit (3) + tens (20) + ones (4)
    tokens = cleaned.split()
    total = 0
    current = 0

    i = 0
    while i < len(tokens):
        word = tokens[i]
        if word in ONES:
            val = ONES[word]
            # Check if followed by "hundred"
            if i + 1 < len(tokens) and tokens[i + 1] == "hundred":
                total += val * 100
                i += 2
                continue
            # E.g., 'three twenty four': 'three' in front of tens means 300
            elif i + 1 < len(tokens) and tokens[i + 1] in TENS:
                total += val * 100
                i += 1
                continue
            else:
                current += val
        elif word in TENS:
            current += TENS[word]
        elif word == "hundred":
            current = (current or 1) * 100
            total += current
            current = 0
        elif word == "thousand":
            current = (current or 1) * 1000
            total += current
            current = 0
        i += 1

    final_val = total + current
    return float(final_val) if final_val > 0 else None


def normalise_time(raw_time: Optional[str]) -> Optional[str]:
    """Ensures time is formatted as standard 24-hour HH:MM."""
    if not raw_time:
        return None

    cleaned = raw_time.strip()

    # Exact match HH:MM
    if re.match(r"^([01][0-9]|2[0-3]):[0-5][0-9]$", cleaned):
        return cleaned

    # Match H:MM -> 0H:MM
    match_single_hour = re.match(r"^([0-9]):([0-5][0-9])$", cleaned)
    if match_single_hour:
        return f"0{match_single_hour.group(1)}:{match_single_hour.group(2)}"

    # Match space separation "14 32"
    match_space = re.match(r"^([01][0-9]|2[0-3])\s+([0-5][0-9])$", cleaned)
    if match_space:
        return f"{match_space.group(1)}:{match_space.group(2)}"

    return None
