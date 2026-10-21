"""Unit tests for deterministic normalisation functions in normalise.py."""

from app.normalise import (
    normalise_drug_name,
    normalise_route,
    normalise_spoken_number,
    normalise_time,
    normalise_unit,
)


def test_normalise_route_cases() -> None:
    """Test mapping of spoken and abbreviated routes to AllowedRoute codes."""
    assert normalise_route("by mouth") == "PO"
    assert normalise_route("chewed") == "PO"
    assert normalise_route("oral") == "PO"
    assert normalise_route("under the tongue") == "SL"
    assert normalise_route("sublingual") == "SL"
    assert normalise_route("intranasal") == "IN"
    assert normalise_route("up nose") == "IN"
    assert normalise_route("nasal") == "IN"
    assert normalise_route("nebulised") == "NEB"
    assert normalise_route("neb") == "NEB"
    assert normalise_route("in the thigh") == "IM"
    assert normalise_route("intramuscular") == "IM"
    assert normalise_route("IV push") == "IV"
    assert normalise_route("intraosseous") == "IO"
    assert normalise_route("sub-q") == "SC"
    assert normalise_route("oxygen by mask/cannula") == "INH"
    assert normalise_route("nasal cannula") == "INH"
    assert normalise_route("unknown_route") is None
    assert normalise_route(None) is None


def test_normalise_unit_cases() -> None:
    """Test mapping of unit variations to standard AllowedUnit codes."""
    assert normalise_unit("milligrams") == "mg"
    assert normalise_unit("mg") == "mg"
    assert normalise_unit("micrograms") == "mcg"
    assert normalise_unit("mics") == "mcg"
    assert normalise_unit("grams") == "g"
    assert normalise_unit("ccs") == "mL"
    assert normalise_unit("mL") == "mL"
    assert normalise_unit("milliliters") == "mL"
    assert normalise_unit("units") == "units"
    assert normalise_unit("liters per minute") == "L/min"
    assert normalise_unit("l/min") == "L/min"
    assert normalise_unit("%") == "%"
    assert normalise_unit("unknown_unit") is None
    assert normalise_unit(None) is None


def test_normalise_spoken_number_cases() -> None:
    """Test spoken number parsing into numeric floats."""
    assert normalise_spoken_number("point four") == 0.4
    assert normalise_spoken_number("zero point three") == 0.3
    assert normalise_spoken_number("three twenty four") == 324.0
    assert normalise_spoken_number("one and a half") == 1.5
    assert normalise_spoken_number("half") == 0.5
    assert normalise_spoken_number("324") == 324.0
    assert normalise_spoken_number("0.4") == 0.4
    assert normalise_spoken_number("two hundred") == 200.0


def test_normalise_time_cases() -> None:
    """Test time normalisation to 24-hour HH:MM."""
    assert normalise_time("14:32") == "14:32"
    assert normalise_time("09:12") == "09:12"
    assert normalise_time("9:12") == "09:12"
    assert normalise_time("14 32") == "14:32"
    assert normalise_time("invalid_time") is None
    assert normalise_time(None) is None


def test_normalise_drug_name_aliases() -> None:
    """Test brand names and acronyms resolve to generic drug names."""
    assert normalise_drug_name("ASA") == "aspirin"
    assert normalise_drug_name("nitro") == "nitroglycerin"
    assert normalise_drug_name("NTG") == "nitroglycerin"
    assert normalise_drug_name("epi") == "epinephrine"
    assert normalise_drug_name("narcan") == "naloxone"
    assert normalise_drug_name("zofran") == "ondansetron"
    assert normalise_drug_name("versed") == "midazolam"
    assert normalise_drug_name("O2") == "oxygen"
    assert normalise_drug_name("ventolin") == "albuterol"
