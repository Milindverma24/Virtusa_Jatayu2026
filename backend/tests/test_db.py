"""Tests for SQLite database operations, cryptographic hash chaining, triggers, and confirmation endpoints."""

from pathlib import Path
import sqlite3
from fastapi.testclient import TestClient
import pytest

from app.db import (
    GENESIS_HASH,
    get_all_encounters,
    get_db_connection,
    get_records_for_encounter,
    init_db,
    insert_confirmed_record,
    verify_chain,
)
from app.main import app


def test_hash_chain_verifies_after_10_inserts(tmp_path: Path) -> None:
    """Hash chain must verify successfully across 10 sequential inserts."""
    db_file = tmp_path / "test_chain.db"
    init_db(db_file)

    for i in range(10):
        insert_confirmed_record(
            encounter_id="ENC-TEST001",
            raw_text=f"Note entry {i}",
            record_json={"entry_num": i},
            reviewed_by="Medic-01",
            db_path=db_file,
        )

    is_valid, broken_rec, broken_row, total = verify_chain(db_file)
    assert is_valid is True
    assert broken_rec is None
    assert total == 10


def test_editing_one_row_breaks_verification_at_that_row(tmp_path: Path) -> None:
    """Tampering with a row's content must break verification specifically at that row."""
    db_file = tmp_path / "test_tamper.db"
    init_db(db_file)

    records = []
    for i in range(4):
        rec = insert_confirmed_record(
            encounter_id="ENC-TAMPER",
            raw_text=f"Legitimate text {i}",
            record_json={"data": i},
            reviewed_by="Medic-01",
            db_path=db_file,
        )
        records.append(rec)

    # Initial check passes
    is_valid, _, _, _ = verify_chain(db_file)
    assert is_valid is True

    # Drop trigger and modify row 3 (index 2)
    conn = get_db_connection(db_file)
    conn.execute("DROP TRIGGER trig_audit_log_no_update;")
    conn.execute("UPDATE audit_log SET raw_text = 'Tampered text' WHERE id = 3;")
    conn.commit()
    conn.close()

    # Re-verify: must fail at row 3
    is_valid, broken_rec, broken_row, total = verify_chain(db_file)
    assert is_valid is False
    assert broken_row == 3
    assert broken_rec == records[2]["record_id"]


def test_deleting_row_breaks_chain(tmp_path: Path) -> None:
    """Deleting an audit row must immediately break cryptographic linkage."""
    db_file = tmp_path / "test_delete.db"
    init_db(db_file)

    for i in range(5):
        insert_confirmed_record(
            encounter_id="ENC-DEL",
            raw_text=f"Text {i}",
            record_json={"i": i},
            reviewed_by="Medic-01",
            db_path=db_file,
        )

    # Drop trigger and delete row 3
    conn = get_db_connection(db_file)
    conn.execute("DROP TRIGGER trig_audit_log_no_delete;")
    conn.execute("DELETE FROM audit_log WHERE id = 3;")
    conn.commit()
    conn.close()

    is_valid, broken_rec, broken_row, total = verify_chain(db_file)
    assert is_valid is False
    # Row 4's prev_hash pointed to deleted row 3, so row 4 breaks
    assert broken_row == 4


def test_update_trigger_blocks_content_update(tmp_path: Path) -> None:
    """Database trigger must abort any UPDATE on content columns."""
    db_file = tmp_path / "test_trigger.db"
    init_db(db_file)

    insert_confirmed_record(
        encounter_id="ENC-TRIG",
        raw_text="Original text",
        record_json={"item": "aspirin"},
        reviewed_by="Medic-01",
        db_path=db_file,
    )

    conn = get_db_connection(db_file)
    with pytest.raises(sqlite3.DatabaseError) as exc_info:
        conn.execute("UPDATE audit_log SET raw_text = 'Altered text' WHERE id = 1;")
    conn.close()

    assert "Illegal UPDATE on audit_log content column" in str(exc_info.value)


def test_update_trigger_allows_synced_column_update(tmp_path: Path) -> None:
    """Database trigger must permit updating the 'synced' column when pushed to cloud."""
    db_file = tmp_path / "test_synced.db"
    init_db(db_file)

    insert_confirmed_record(
        encounter_id="ENC-SYNC",
        raw_text="Original text",
        record_json={"item": "aspirin"},
        reviewed_by="Medic-01",
        db_path=db_file,
    )

    conn = get_db_connection(db_file)
    conn.execute("UPDATE audit_log SET synced = 1 WHERE id = 1;")
    conn.commit()

    cursor = conn.cursor()
    cursor.execute("SELECT synced FROM audit_log WHERE id = 1;")
    assert cursor.fetchone()[0] == 1
    conn.close()


def test_delete_trigger_blocks_delete(tmp_path: Path) -> None:
    """Database trigger must abort any DELETE statement."""
    db_file = tmp_path / "test_no_del.db"
    init_db(db_file)

    insert_confirmed_record(
        encounter_id="ENC-NODEL",
        raw_text="Preserved note",
        record_json={"item": "aspirin"},
        reviewed_by="Medic-01",
        db_path=db_file,
    )

    conn = get_db_connection(db_file)
    with pytest.raises(sqlite3.DatabaseError) as exc_info:
        conn.execute("DELETE FROM audit_log WHERE id = 1;")
    conn.close()

    assert "Illegal DELETE on audit_log" in str(exc_info.value)


def test_confirm_requires_responder_id(tmp_path: Path) -> None:
    """insert_confirmed_record must reject empty or whitespace-only reviewer ID."""
    db_file = tmp_path / "test_reviewer.db"
    with pytest.raises(ValueError) as exc:
        insert_confirmed_record(
            encounter_id="ENC-001",
            raw_text="Note",
            record_json={},
            reviewed_by="   ",
            db_path=db_file,
        )
    assert "Responder ID" in str(exc.value)


def test_correction_appends_new_row_linking_original(tmp_path: Path) -> None:
    """A correction must create a new row linking to corrects_record_id."""
    db_file = tmp_path / "test_corr.db"
    init_db(db_file)

    rec1 = insert_confirmed_record(
        encounter_id="ENC-CORR",
        raw_text="Original: Epi 1 mg IM",
        record_json={"drug": "epinephrine", "dose": 1.0},
        reviewed_by="Medic-01",
        db_path=db_file,
    )

    rec2 = insert_confirmed_record(
        encounter_id="ENC-CORR",
        raw_text="Correction: Epi 0.3 mg IM",
        record_json={"drug": "epinephrine", "dose": 0.3},
        reviewed_by="Medic-01",
        corrects_record_id=rec1["record_id"],
        db_path=db_file,
    )

    assert rec2["corrects_record_id"] == rec1["record_id"]
    is_valid, _, _, total = verify_chain(db_file)
    assert is_valid is True
    assert total == 2


# =========================================================================
# API ENDPOINT INTEGRATION TESTS
# =========================================================================

def test_api_confirm_endpoint(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /confirm stores draft and returns signed receipt."""
    db_file = tmp_path / "test_api_audit.db"
    monkeypatch.setattr("app.config.settings.DATABASE_PATH", db_file)

    client = TestClient(app)
    payload = {
        "encounter_id": "ENC-APITEST",
        "raw_text": "14:32 gave aspirin 324 mg PO chewed.",
        "bundle": {"resourceType": "Bundle"},
        "reviewed_by": "Medic-07",
    }
    response = client.post("/confirm", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["record_id"].startswith("REC-")
    assert data["encounter_id"] == "ENC-APITEST"
    assert data["prev_hash"] == GENESIS_HASH
    assert data["chain_verified"] is True

    # Check verify endpoint
    v_resp = client.get("/audit/verify")
    assert v_resp.status_code == 200
    v_data = v_resp.json()
    assert v_data["valid"] is True
    assert v_data["total_records"] == 1


def test_api_confirm_rejects_missing_reviewer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /confirm without reviewed_by must be rejected with 422 or 400."""
    db_file = tmp_path / "test_api_audit.db"
    monkeypatch.setattr("app.config.settings.DATABASE_PATH", db_file)

    client = TestClient(app)
    payload = {
        "encounter_id": "ENC-APITEST",
        "raw_text": "aspirin",
        "bundle": {},
        "reviewed_by": "",
    }
    response = client.post("/confirm", json=payload)
    assert response.status_code in [400, 422]


def test_api_correct_endpoint(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /correct/{id} creates linked correction row."""
    db_file = tmp_path / "test_api_audit.db"
    monkeypatch.setattr("app.config.settings.DATABASE_PATH", db_file)

    client = TestClient(app)
    # Confirm initial record
    init_res = client.post("/confirm", json={
        "encounter_id": "ENC-CORRTEST",
        "raw_text": "Initial note",
        "bundle": {},
        "reviewed_by": "Medic-01",
    }).json()

    orig_id = init_res["record_id"]

    # Submit correction
    corr_res = client.post(f"/correct/{orig_id}", json={
        "raw_text": "Corrected note",
        "bundle": {},
        "reviewed_by": "Medic-01",
    })
    assert corr_res.status_code == 200
    data = corr_res.json()
    assert data["corrects_record_id"] == orig_id


def test_api_encounters_endpoints(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """GET /encounters and GET /encounters/{id} return expected audit records."""
    db_file = tmp_path / "test_api_audit.db"
    monkeypatch.setattr("app.config.settings.DATABASE_PATH", db_file)

    client = TestClient(app)
    client.post("/confirm", json={
        "encounter_id": "ENC-LIST1",
        "raw_text": "Note 1",
        "bundle": {},
        "reviewed_by": "Medic-01",
    })
    client.post("/confirm", json={
        "encounter_id": "ENC-LIST1",
        "raw_text": "Note 2",
        "bundle": {},
        "reviewed_by": "Medic-01",
    })

    list_resp = client.get("/encounters")
    assert list_resp.status_code == 200
    encs = list_resp.json()
    assert any(e["encounter_id"] == "ENC-LIST1" and e["record_count"] == 2 for e in encs)

    detail_resp = client.get("/encounters/ENC-LIST1")
    assert detail_resp.status_code == 200
    recs = detail_resp.json()
    assert len(recs) == 2
