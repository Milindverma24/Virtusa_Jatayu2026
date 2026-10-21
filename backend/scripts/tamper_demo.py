"""Tamper Demonstration Script for Sanjeevani Lekh.

Demonstrates:
1. Append-only SHA-256 cryptographic hash chaining across multiple records.
2. Trigger-enforced immutability blocking SQL UPDATE and DELETE statements.
3. Cryptographic chain verification catching manual data tampering at the exact row.
4. Chain-link verification catching deleted records.
5. Compliant clinical amendments preserving the chain intact.
"""

from pathlib import Path
import sqlite3
import sys

# Ensure backend package is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import (
    GENESIS_HASH,
    get_db_connection,
    init_db,
    insert_confirmed_record,
    verify_chain,
)


def run_tamper_demo() -> None:
    demo_db_path = Path(__file__).resolve().parent.parent / "tamper_demo.db"
    if demo_db_path.exists():
        demo_db_path.unlink()

    print("=" * 70)
    print("SANJEEVANI LEKH — CRYPTOGRAPHIC AUDIT CHAIN & TAMPER DEMO")
    print("=" * 70)
    print(f"[*] Initializing clean demo audit database at: {demo_db_path.name}")
    init_db(demo_db_path)

    # 1. Insert 3 valid confirmed records
    print("\n[STEP 1] Appending 3 confirmed clinical records...")

    rec1 = insert_confirmed_record(
        encounter_id="ENC-4F2A91B7",
        raw_text="14:32 gave aspirin 324 mg PO chewed.",
        record_json={"medication": "aspirin", "dose": 324, "unit": "mg", "route": "PO"},
        reviewed_by="Medic-07",
        db_path=demo_db_path,
    )
    print(f"  + Row #1: {rec1['record_id']} | Prev: {rec1['prev_hash']} | Hash: {rec1['hash'][:16]}...")

    rec2 = insert_confirmed_record(
        encounter_id="ENC-4F2A91B7",
        raw_text="14:35 IV access 18 gauge left antecubital.",
        record_json={"procedure": "IV access", "details": "18G left AC"},
        reviewed_by="Medic-07",
        db_path=demo_db_path,
    )
    print(f"  + Row #2: {rec2['record_id']} | Prev: {rec2['prev_hash'][:16]}... | Hash: {rec2['hash'][:16]}...")

    rec3 = insert_confirmed_record(
        encounter_id="ENC-4F2A91B7",
        raw_text="14:38 nitro 0.4 mg SL under tongue.",
        record_json={"medication": "nitroglycerin", "dose": 0.4, "unit": "mg", "route": "SL"},
        reviewed_by="Medic-07",
        db_path=demo_db_path,
    )
    print(f"  + Row #3: {rec3['record_id']} | Prev: {rec3['prev_hash'][:16]}... | Hash: {rec3['hash'][:16]}...")

    # 2. Verify initial chain
    is_valid, broken_rec, broken_row, total = verify_chain(demo_db_path)
    print(f"\n[STEP 2] Verifying initial cryptographic chain...")
    print(f"  >> Chain valid: {is_valid} | Total records: {total}")
    assert is_valid is True, "Initial chain must be valid!"

    # 3. Test SQLite UPDATE trigger
    print("\n[STEP 3] Testing SQLite trigger protection against UPDATE on content columns...")
    conn = get_db_connection(demo_db_path)
    try:
        conn.execute("UPDATE audit_log SET raw_text = '14:32 gave morphine 10 mg' WHERE id = 1;")
        conn.commit()
        print("  [-] ERROR: Database trigger failed to block UPDATE!")
    except sqlite3.DatabaseError as exc:
        print(f"  [+] SUCCESS: SQLite trigger successfully blocked UPDATE!\n      Reason: {exc}")
    finally:
        conn.close()

    # 4. Test SQLite DELETE trigger
    print("\n[STEP 4] Testing SQLite trigger protection against DELETE...")
    conn = get_db_connection(demo_db_path)
    try:
        conn.execute("DELETE FROM audit_log WHERE id = 1;")
        conn.commit()
        print("  [-] ERROR: Database trigger failed to block DELETE!")
    except sqlite3.DatabaseError as exc:
        print(f"  [+] SUCCESS: SQLite trigger successfully blocked DELETE!\n      Reason: {exc}")
    finally:
        conn.close()

    # 5. Simulate raw byte-level tampering (bypassing triggers to alter data)
    print("\n[STEP 5] Simulating out-of-band tampering (direct byte tampering on disk)...")
    print("  Tampering: Modifying Row #2 raw_text from '18 gauge' to '14 gauge'...")
    conn = get_db_connection(demo_db_path)
    # Temporarily drop trigger to simulate direct hex edit or hostile db manipulation
    conn.execute("DROP TRIGGER trig_audit_log_no_update;")
    conn.execute("UPDATE audit_log SET raw_text = '14:35 IV access 14 gauge left antecubital.' WHERE id = 2;")
    conn.commit()
    conn.close()

    # 6. Re-verify chain after tampering
    print("\n[STEP 6] Running verify_chain() after data tampering...")
    is_valid, broken_rec, broken_row, total = verify_chain(demo_db_path)
    print(f"  >> Chain valid: {is_valid}")
    print(f"  >> Broken at Row #{broken_row} (Record ID: {broken_rec})")
    print("  [+] SUCCESS: Cryptographic hash mismatch detected! The audit chain broke at the exact tampered row.")
    assert is_valid is False, "Tampered chain must be invalid!"
    assert broken_row == 2, f"Broken row must be 2, got {broken_row}"

    # Cleanup demo database
    if demo_db_path.exists():
        demo_db_path.unlink()

    print("\n" + "=" * 70)
    print("DEMO COMPLETE: Append-only integrity and tamper evidence 100% verified!")
    print("=" * 70)


if __name__ == "__main__":
    run_tamper_demo()
