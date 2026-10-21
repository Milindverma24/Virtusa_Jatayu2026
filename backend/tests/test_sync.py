"""Tests for cloud sync worker and POST /sync endpoint."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
import httpx
import pytest

from app.db import init_db, insert_confirmed_record
from app.main import app
from app.sync import get_unsynced_records, mark_records_synced, sync_to_supabase


@pytest.fixture
def test_sync_db(tmp_path):
    db_file = tmp_path / "test_sync.db"
    init_db(db_file)
    # Insert two test records
    insert_confirmed_record(
        encounter_id="ENC-SYNC-1",
        raw_text="Aspirin 324 mg given",
        record_json={"medications": [{"drug": "aspirin", "dose": 324}]},
        reviewed_by="Medic-01",
        input_type="text",
        db_path=db_file,
    )
    insert_confirmed_record(
        encounter_id="ENC-SYNC-2",
        raw_text="Nitro 0.4 SL given",
        record_json={"medications": [{"drug": "nitroglycerin", "dose": 0.4}]},
        reviewed_by="Medic-01",
        input_type="text",
        db_path=db_file,
    )
    return db_file


def test_get_unsynced_and_mark_synced(test_sync_db):
    records = get_unsynced_records(test_sync_db)
    assert len(records) == 2
    assert all(r["synced"] == 0 for r in records)

    # Mark first record as synced
    rec_id = records[0]["record_id"]
    updated = mark_records_synced([rec_id], test_sync_db)
    assert updated == 1

    remaining = get_unsynced_records(test_sync_db)
    assert len(remaining) == 1
    assert remaining[0]["record_id"] != rec_id


def test_sync_unconfigured_skips_gracefully(test_sync_db):
    with patch("app.sync.settings.SUPABASE_URL", None), \
         patch("app.sync.settings.SUPABASE_KEY", None):
        res = sync_to_supabase(db_path=test_sync_db)
        assert res["status"] == "unconfigured"
        assert res["synced_count"] == 0


def test_sync_to_supabase_mocked(test_sync_db):
    mock_client = MagicMock(spec=httpx.Client)
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 201
    mock_client.post.return_value = mock_response

    with patch("app.sync.settings.SUPABASE_URL", "https://example.supabase.co"), \
         patch("app.sync.settings.SUPABASE_KEY", "test-key-123"), \
         patch("app.sync.settings.DEVICE_ID", "ambulance-alpha"):

        res = sync_to_supabase(client=mock_client, db_path=test_sync_db)
        assert res["status"] == "success"
        assert res["synced_count"] == 2
        assert res["device_id"] == "ambulance-alpha"

        # Verify call headers and payload
        call_kwargs = mock_client.post.call_args.kwargs
        headers = call_kwargs["headers"]
        assert headers["apikey"] == "test-key-123"
        assert "resolution=merge-duplicates" in headers["Prefer"]

        payload = call_kwargs["json"]
        assert len(payload) == 2
        assert payload[0]["device_id"] == "ambulance-alpha"
        assert "received_at" in payload[0]

        # Verify all records now marked synced in database
        remaining = get_unsynced_records(test_sync_db)
        assert len(remaining) == 0


def test_sync_endpoint():
    client = TestClient(app)
    with patch("app.main.sync_to_supabase") as mock_sync:
        mock_sync.return_value = {"synced_count": 3, "status": "success"}
        response = client.post("/sync")
        assert response.status_code == 200
        data = response.json()
        assert data["synced_count"] == 3
        assert data["status"] == "success"
