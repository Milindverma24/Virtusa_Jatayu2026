"""Tests for ultra-fast, zero-lag rule-based clinical entity extractor."""

from app.rule_extractor import extract_with_rules


def test_rule_extractor_medications() -> None:
    text = "14:32 gave aspirin 324 mg PO chewed. 14:38 nitro point four under the tongue."
    res = extract_with_rules(text)

    assert len(res.medications) == 2
    aspirin = res.medications[0]
    assert aspirin.drug == "aspirin"
    assert aspirin.dose_value == 324.0
    assert aspirin.dose_unit == "mg"
    assert aspirin.route == "PO"
    assert aspirin.time == "14:32"

    nitro = res.medications[1]
    assert nitro.drug == "nitroglycerin"
    assert nitro.dose_value == 0.4
    assert nitro.route == "SL"
    assert nitro.time == "14:38"


def test_rule_extractor_procedures() -> None:
    text = "Started IV 18 gauge left AC. Patient placed on 12-lead ECG. CPR performed."
    res = extract_with_rules(text)

    proc_names = [p.name for p in res.procedures]
    assert "IV access" in proc_names
    assert "12-lead ECG" in proc_names
    assert "CPR" in proc_names


def test_rule_extractor_oxygen() -> None:
    text = "Administered oxygen 15 L/min via non-rebreather mask at 11:20."
    res = extract_with_rules(text)

    assert any(m.drug == "oxygen" for m in res.medications)
    o2 = next(m for m in res.medications if m.drug == "oxygen")
    assert o2.dose_value == 15.0
    assert o2.dose_unit == "L/min"
    assert o2.route == "INH"
    assert o2.time == "11:20"


def test_rule_extractor_general_narrative() -> None:
    text = "Patient was conscious and alert on scene."
    res = extract_with_rules(text)

    assert len(res.procedures) == 1
    assert "Clinical Assessment" in res.procedures[0].name
