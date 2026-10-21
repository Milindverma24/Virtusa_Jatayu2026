"""Database access module for Sanjeevani Lekh.

This is the only module that interacts directly with SQLite.
Implements an append-only audit log with SHA-256 cryptographic hash chaining
and trigger-enforced immutability.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
from typing import Any, Optional

from app.config import settings

GENESIS_HASH = "GENESIS"


def get_db_connection(db_path: Optional[Path | str] = None) -> sqlite3.Connection:
    """Creates a configured connection to the SQLite database.

    Enforces foreign keys, WAL mode, and Row factory.
    """
    target_path = Path(db_path) if db_path is not None else settings.DATABASE_PATH
    target_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db(db_path: Optional[Path | str] = None) -> None:
    """Initializes the audit_log table and immutability triggers."""
    with get_db_connection(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT UNIQUE NOT NULL,
                encounter_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                input_type TEXT NOT NULL,
                raw_text TEXT NOT NULL,
                record_json TEXT NOT NULL,
                model_name TEXT NOT NULL,
                prompt_version TEXT NOT NULL,
                reviewed_by TEXT NOT NULL,
                corrects_record_id TEXT NULL,
                prev_hash TEXT NOT NULL,
                hash TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0
            );
        """)

        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_encounter ON audit_log (encounter_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_synced ON audit_log (synced);")

        # Trigger: Block any UPDATE on content columns (only 'synced' is mutable)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS trig_audit_log_no_update
            BEFORE UPDATE ON audit_log
            FOR EACH ROW
            BEGIN
                SELECT CASE
                    WHEN (
                        OLD.id != NEW.id OR
                        OLD.record_id != NEW.record_id OR
                        OLD.encounter_id != NEW.encounter_id OR
                        OLD.created_at != NEW.created_at OR
                        OLD.input_type != NEW.input_type OR
                        OLD.raw_text != NEW.raw_text OR
                        OLD.record_json != NEW.record_json OR
                        OLD.model_name != NEW.model_name OR
                        OLD.prompt_version != NEW.prompt_version OR
                        OLD.reviewed_by != NEW.reviewed_by OR
                        (OLD.corrects_record_id IS NOT NEW.corrects_record_id) OR
                        OLD.prev_hash != NEW.prev_hash OR
                        OLD.hash != NEW.hash
                    )
                    THEN RAISE(ABORT, 'Illegal UPDATE on audit_log content column. Audit log is append-only; only synced may change.')
                END;
            END;
        """)

        # Trigger: Strictly block any DELETE on audit_log
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS trig_audit_log_no_delete
            BEFORE DELETE ON audit_log
            FOR EACH ROW
            BEGIN
                SELECT RAISE(ABORT, 'Illegal DELETE on audit_log. Audit log is strictly append-only.');
            END;
        """)
        conn.commit()


def check_db_health(db_path: Optional[Path | str] = None) -> bool:
    """Verifies that the SQLite database is reachable and initialized."""
    try:
        init_db(db_path)
        with get_db_connection(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1;")
            result = cursor.fetchone()
            return result is not None and result[0] == 1
    except Exception:
        return False


def compute_content_hash(content: dict[str, Any], prev_hash: str) -> str:
    """Computes SHA-256 hash over deterministic JSON of content columns plus prev_hash.

    Args:
        content: Dictionary containing all content fields.
        prev_hash: SHA-256 hex string of the preceding row, or 'GENESIS'.

    Returns:
        Hex-encoded SHA-256 digest string.
    """
    payload = {
        "record_id": content["record_id"],
        "encounter_id": content["encounter_id"],
        "created_at": content["created_at"],
        "input_type": content["input_type"],
        "raw_text": content["raw_text"],
        "record_json": content["record_json"],
        "model_name": content["model_name"],
        "prompt_version": content["prompt_version"],
        "reviewed_by": content["reviewed_by"],
        "corrects_record_id": content.get("corrects_record_id"),
        "prev_hash": prev_hash,
    }
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def get_latest_hash(conn: sqlite3.Connection) -> str:
    """Retrieves the hash of the most recent audit row, or 'GENESIS' if empty."""
    cursor = conn.cursor()
    cursor.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1;")
    row = cursor.fetchone()
    return row["hash"] if row else GENESIS_HASH


def insert_confirmed_record(
    encounter_id: str,
    raw_text: str,
    record_json: dict[str, Any] | str,
    reviewed_by: str,
    input_type: str = "text",
    model_name: str = "medgemma1.5",
    prompt_version: str = "extract-v1.0",
    corrects_record_id: Optional[str] = None,
    db_path: Optional[Path | str] = None,
) -> dict[str, Any]:
    """Inserts a human-confirmed record into the append-only audit hash chain.

    Args:
        encounter_id: Clinical call identifier.
        raw_text: Unmodified original clinical note text.
        record_json: Validated FHIR-lite Bundle as dict or JSON string.
        reviewed_by: Responder ID (mandatory human sign-off).
        input_type: 'text', 'voice', or 'image'.
        model_name: Name of AI model used for draft.
        prompt_version: Version identifier of prompt used.
        corrects_record_id: Optional pointer to an earlier record being corrected.
        db_path: Optional database path override.

    Returns:
        Dictionary containing inserted record details, record_id, and hash.
    """
    cleaned_reviewer = reviewed_by.strip()
    if not cleaned_reviewer:
        raise ValueError("Responder ID (reviewed_by) is strictly required to confirm a record.")

    json_str = json.dumps(record_json, sort_keys=True) if isinstance(record_json, dict) else record_json

    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cursor = conn.cursor()

        # Count existing records for this encounter to generate sequential record_id
        cursor.execute("SELECT COUNT(*) FROM audit_log WHERE encounter_id = ?;", (encounter_id,))
        count = cursor.fetchone()[0]
        record_id = f"REC-{encounter_id.replace('ENC-', '')}-{count + 1:02d}"

        created_at = datetime.now(timezone.utc).isoformat()
        prev_hash = get_latest_hash(conn)

        content = {
            "record_id": record_id,
            "encounter_id": encounter_id,
            "created_at": created_at,
            "input_type": input_type,
            "raw_text": raw_text,
            "record_json": json_str,
            "model_name": model_name,
            "prompt_version": prompt_version,
            "reviewed_by": cleaned_reviewer,
            "corrects_record_id": corrects_record_id,
        }

        row_hash = compute_content_hash(content, prev_hash)

        cursor.execute(
            """
            INSERT INTO audit_log (
                record_id, encounter_id, created_at, input_type, raw_text,
                record_json, model_name, prompt_version, reviewed_by,
                corrects_record_id, prev_hash, hash, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0);
            """,
            (
                record_id,
                encounter_id,
                created_at,
                input_type,
                raw_text,
                json_str,
                model_name,
                prompt_version,
                cleaned_reviewer,
                corrects_record_id,
                prev_hash,
                row_hash,
            ),
        )
        conn.commit()

        return {
            "record_id": record_id,
            "encounter_id": encounter_id,
            "created_at": created_at,
            "hash": row_hash,
            "prev_hash": prev_hash,
            "reviewed_by": cleaned_reviewer,
            "corrects_record_id": corrects_record_id,
        }


def verify_chain(db_path: Optional[Path | str] = None) -> tuple[bool, Optional[str], Optional[int], int]:
    """Verifies the integrity of the cryptographic SHA-256 hash chain.

    Walks all rows in sequential order, verifying each row's previous hash link
    and recomputing each row's SHA-256 hash.

    Returns:
        Tuple: (is_valid, broken_record_id, broken_row_id, total_records)
    """
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_log ORDER BY id ASC;")
        rows = cursor.fetchall()

        if not rows:
            return True, None, None, 0

        expected_prev_hash = GENESIS_HASH

        for row in rows:
            row_id = row["id"]
            rec_id = row["record_id"]

            # 1. Verify link to previous row
            if row["prev_hash"] != expected_prev_hash:
                return False, rec_id, row_id, len(rows)

            # 2. Recompute content hash
            content = {
                "record_id": rec_id,
                "encounter_id": row["encounter_id"],
                "created_at": row["created_at"],
                "input_type": row["input_type"],
                "raw_text": row["raw_text"],
                "record_json": row["record_json"],
                "model_name": row["model_name"],
                "prompt_version": row["prompt_version"],
                "reviewed_by": row["reviewed_by"],
                "corrects_record_id": row["corrects_record_id"],
            }
            recomputed = compute_content_hash(content, expected_prev_hash)

            if recomputed != row["hash"]:
                return False, rec_id, row_id, len(rows)

            expected_prev_hash = row["hash"]

        return True, None, None, len(rows)


def get_all_encounters(db_path: Optional[Path | str] = None) -> list[dict[str, Any]]:
    """Returns summaries of all encounters in the audit log."""
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                encounter_id,
                COUNT(id) as record_count,
                MIN(created_at) as started_at,
                MAX(created_at) as last_activity,
                MIN(synced) as all_synced
            FROM audit_log
            GROUP BY encounter_id
            ORDER BY last_activity DESC;
        """)
        return [dict(r) for r in cursor.fetchall()]


def get_records_for_encounter(encounter_id: str, db_path: Optional[Path | str] = None) -> list[dict[str, Any]]:
    """Retrieves all confirmed audit log rows for a single encounter."""
    init_db(db_path)
    with get_db_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM audit_log
            WHERE encounter_id = ?
            ORDER BY id ASC;
        """, (encounter_id,))
        return [dict(r) for r in cursor.fetchall()]
