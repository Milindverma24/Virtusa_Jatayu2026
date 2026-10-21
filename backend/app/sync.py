"""Cloud sync worker pushing confirmed audit records to Supabase."""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class SyncError(Exception):
    """Raised when synchronization with Supabase fails."""


def get_unsynced_records(db_path: Optional[Path | str] = None) -> List[Dict[str, Any]]:
    """Retrieves all confirmed records that have not yet been synced (synced = 0)."""
    target_path = Path(db_path or settings.DATABASE_PATH)
    if not target_path.exists():
        return []

    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log WHERE synced = 0 ORDER BY id ASC")
        rows = [dict(r) for r in cursor.fetchall()]
        return rows
    finally:
        conn.close()


def mark_records_synced(record_ids: List[str], db_path: Optional[Path | str] = None) -> int:
    """Updates synced flag to 1 for the specified record IDs."""
    if not record_ids:
        return 0

    target_path = Path(db_path or settings.DATABASE_PATH)
    conn = sqlite3.connect(target_path)
    try:
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in record_ids)
        # Note: SQLite triggers explicitly allow UPDATE on the 'synced' column only
        cursor.execute(
            f"UPDATE audit_log SET synced = 1 WHERE record_id IN ({placeholders})",
            record_ids,
        )
        updated_count = cursor.rowcount
        conn.commit()
        return updated_count
    finally:
        conn.close()


def sync_to_supabase(
    client: Optional[httpx.Client] = None,
    db_path: Optional[Path | str] = None,
) -> Dict[str, Any]:
    """Syncs pending records to Supabase with idempotent duplicate avoidance.

    The Supabase audit_log table has primary key (device_id, record_id).
    Using 'Prefer: resolution=merge-duplicates' ensures retries never duplicate data.

    Returns:
        Summary dict containing synced_count and status.
    """
    records = get_unsynced_records(db_path=db_path)
    if not records:
        return {
            "synced_count": 0,
            "status": "up_to_date",
            "message": "All records are already synced.",
        }

    supabase_url = settings.SUPABASE_URL
    supabase_key = settings.SUPABASE_KEY

    if not supabase_url or not supabase_key:
        logger.warning("Supabase URL or Key not set; skipping cloud sync")
        return {
            "synced_count": 0,
            "status": "unconfigured",
            "message": "Supabase credentials not configured in environment",
        }

    # Prepare batch rows with device_id and received_at
    now_iso = datetime.now(timezone.utc).isoformat()
    device_id = settings.DEVICE_ID

    payload: List[Dict[str, Any]] = []
    for r in records:
        # Parse JSON if stored as string to ensure valid jsonb in Postgres
        rec_json = r.get("record_json")
        if isinstance(rec_json, str):
            try:
                rec_json = json.loads(rec_json)
            except json.JSONDecodeError:
                pass

        payload.append({
            "device_id": device_id,
            "record_id": r["record_id"],
            "encounter_id": r["encounter_id"],
            "created_at": r["created_at"],
            "input_type": r["input_type"],
            "raw_text": r["raw_text"],
            "record_json": rec_json,
            "model_name": r["model_name"],
            "prompt_version": r["prompt_version"],
            "reviewed_by": r["reviewed_by"],
            "corrects_record_id": r["corrects_record_id"],
            "prev_hash": r["prev_hash"],
            "hash": r["hash"],
            "received_at": now_iso,
        })

    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/audit_log"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    http_client = client or httpx.Client(timeout=15.0)
    try:
        response = http_client.post(endpoint, headers=headers, json=payload)
    except Exception as exc:
        logger.error("Failed to connect to Supabase: %s", exc)
        raise SyncError(f"Cloud connection error: {exc}") from exc

    if response.status_code in (200, 201, 204):
        synced_ids = [r["record_id"] for r in records]
        mark_records_synced(synced_ids, db_path=db_path)
        logger.info("Successfully synced %d records to Supabase", len(synced_ids))
        return {
            "synced_count": len(synced_ids),
            "status": "success",
            "device_id": device_id,
            "message": f"Successfully synced {len(synced_ids)} records to cloud.",
        }
    else:
        logger.error("Supabase REST error (%d): %s", response.status_code, response.text)
        raise SyncError(f"Supabase returned HTTP {response.status_code}: {response.text}")
