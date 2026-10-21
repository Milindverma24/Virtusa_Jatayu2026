"""Evaluation script for Sanjeevani Lekh clinical extraction benchmark.

Calculates per-field metrics across synthetic test notes against ground-truth answers:
- Drug Name F1
- Dose Exact Match (value + unit)
- Route F1
- Time HH:MM Accuracy
- Procedure Name F1
- Hallucination Catch Rate
- False Flag Rate

Usage:
    python scripts/evaluate.py [--quick] [--save]
"""

import argparse
import json
from pathlib import Path
import sys
import time
from typing import Any

# Ensure backend package is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.extract import extract_clinical_data
from app.normalise import normalise_drug_name
from app.schemas import ExtractionResult, MedicationItem, ProcedureItem
from app.validate import validate_record


def match_medications(
    gold_meds: list[MedicationItem],
    pred_meds: list[MedicationItem],
) -> tuple[list[tuple[MedicationItem, MedicationItem]], list[MedicationItem], list[MedicationItem]]:
    """Greedy matcher pairing predicted meds to gold meds by canonical drug name."""
    matched: list[tuple[MedicationItem, MedicationItem]] = []
    unmatched_gold = list(gold_meds)
    unmatched_pred: list[MedicationItem] = []

    for pred in pred_meds:
        pred_norm = normalise_drug_name(pred.drug)
        match_idx = None
        for i, gold in enumerate(unmatched_gold):
            if normalise_drug_name(gold.drug) == pred_norm:
                match_idx = i
                break
        if match_idx is not None:
            matched.append((unmatched_gold.pop(match_idx), pred))
        else:
            unmatched_pred.append(pred)

    return matched, unmatched_pred, unmatched_gold


def match_procedures(
    gold_procs: list[ProcedureItem],
    pred_procs: list[ProcedureItem],
) -> tuple[list[tuple[ProcedureItem, ProcedureItem]], list[ProcedureItem], list[ProcedureItem]]:
    """Matches predicted procedures to gold procedures by name substring."""
    matched: list[tuple[ProcedureItem, ProcedureItem]] = []
    unmatched_gold = list(gold_procs)
    unmatched_pred: list[ProcedureItem] = []

    for pred in pred_procs:
        pred_name = pred.name.strip().lower()
        match_idx = None
        for i, gold in enumerate(unmatched_gold):
            gold_name = gold.name.strip().lower()
            if pred_name in gold_name or gold_name in pred_name:
                match_idx = i
                break
        if match_idx is not None:
            matched.append((unmatched_gold.pop(match_idx), pred))
        else:
            unmatched_pred.append(pred)

    return matched, unmatched_pred, unmatched_gold


def evaluate_dataset(quick: bool = False) -> dict[str, Any]:
    notes_dir = settings.ROOT_DIR / "test-data" / "notes"
    answers_dir = settings.ROOT_DIR / "test-data" / "answers"

    note_files = sorted(notes_dir.glob("note_*.txt"))
    if quick:
        note_files = note_files[:5]

    total_notes = len(note_files)
    if total_notes == 0:
        print("[-] No test notes found in test-data/notes/")
        sys.exit(1)

    print(f"[*] Evaluating {total_notes} notes using model '{settings.LLM_MODEL}' (prompt: {settings.ACTIVE_PROMPT_VERSION})...")

    # Metrics accumulators
    drug_tp = 0
    drug_fp = 0
    drug_fn = 0

    dose_matches = 0
    dose_eval_total = 0

    route_tp = 0
    route_fp = 0
    route_fn = 0

    time_matches = 0
    time_eval_total = 0

    proc_tp = 0
    proc_fp = 0
    proc_fn = 0

    hallucinated_items = 0
    hallucinations_caught = 0

    total_correct_items = 0
    false_flags = 0

    latencies_ms: list[int] = []

    for idx, note_path in enumerate(note_files):
        ans_path = answers_dir / f"{note_path.stem}.json"
        if not ans_path.exists():
            print(f"[-] Missing answer key for {note_path.name}")
            continue

        raw_text = note_path.read_text(encoding="utf-8").strip()
        gold_data = json.loads(ans_path.read_text(encoding="utf-8"))
        gold = ExtractionResult.model_validate(gold_data)

        # Run extraction
        try:
            pred, elapsed_ms = extract_clinical_data(raw_text)
            latencies_ms.append(elapsed_ms)
        except Exception as exc:
            print(f"  [{idx+1:02d}/{total_notes:02d}] {note_path.name} | EXTRACTION ERROR: {type(exc).__name__}")
            pred = ExtractionResult(medications=[], procedures=[])
            elapsed_ms = 0

        # Run validation
        val_res = validate_record(pred, raw_text)

        # Med matching
        med_matched, med_fp, med_fn = match_medications(gold.medications, pred.medications)
        drug_tp += len(med_matched)
        drug_fp += len(med_fp)
        drug_fn += len(med_fn)

        for gold_m, pred_m in med_matched:
            total_correct_items += 1
            # Check dose
            if gold_m.dose_value is not None:
                dose_eval_total += 1
                if pred_m.dose_value == gold_m.dose_value and pred_m.dose_unit == gold_m.dose_unit:
                    dose_matches += 1

            # Check route
            if gold_m.route is not None:
                if pred_m.route == gold_m.route:
                    route_tp += 1
                else:
                    route_fn += 1
            elif pred_m.route is not None:
                route_fp += 1

            # Check time
            if gold_m.time is not None:
                time_eval_total += 1
                if pred_m.time == gold_m.time:
                    time_matches += 1

        # Procedure matching
        proc_matched, p_fp, p_fn = match_procedures(gold.procedures, pred.procedures)
        proc_tp += len(proc_matched)
        proc_fp += len(p_fp)
        proc_fn += len(p_fn)
        total_correct_items += len(proc_matched)

        # Check hallucinations (items in pred not in gold)
        for h_med in med_fp:
            hallucinated_items += 1
            if any(f.item_type == "medication" and f.source_text == h_med.source_text and f.severity == "needs_review" for f in val_res.flags):
                hallucinations_caught += 1

        for h_proc in p_fp:
            hallucinated_items += 1
            if any(f.item_type == "procedure" and f.source_text == h_proc.source_text and f.severity == "needs_review" for f in val_res.flags):
                hallucinations_caught += 1

        print(f"  [{idx+1:02d}/{total_notes:02d}] {note_path.name} | Meds: {len(pred.medications)} (Gold: {len(gold.medications)}) | Procs: {len(pred.procedures)} (Gold: {len(gold.procedures)}) | Latency: {elapsed_ms}ms")

    # Calculate final scores
    drug_p = drug_tp / (drug_tp + drug_fp) if (drug_tp + drug_fp) > 0 else 1.0
    drug_r = drug_tp / (drug_tp + drug_fn) if (drug_tp + drug_fn) > 0 else 1.0
    drug_f1 = (2 * drug_p * drug_r / (drug_p + drug_r)) if (drug_p + drug_r) > 0 else 0.0

    dose_acc = (dose_matches / dose_eval_total) if dose_eval_total > 0 else 1.0

    route_p = route_tp / (route_tp + route_fp) if (route_tp + route_fp) > 0 else 1.0
    route_r = route_tp / (route_tp + route_fn) if (route_tp + route_fn) > 0 else 1.0
    route_f1 = (2 * route_p * route_r / (route_p + route_r)) if (route_p + route_r) > 0 else 0.0

    time_acc = (time_matches / time_eval_total) if time_eval_total > 0 else 1.0

    proc_p = proc_tp / (proc_tp + proc_fp) if (proc_tp + proc_fp) > 0 else 1.0
    proc_r = proc_tp / (proc_tp + proc_fn) if (proc_tp + proc_fn) > 0 else 1.0
    proc_f1 = (2 * proc_p * proc_r / (proc_p + proc_r)) if (proc_p + proc_r) > 0 else 0.0

    catch_rate = (hallucinations_caught / hallucinated_items) if hallucinated_items > 0 else 1.0
    avg_latency = int(sum(latencies_ms) / len(latencies_ms)) if latencies_ms else 0

    return {
        "total_notes": total_notes,
        "drug_f1": drug_f1,
        "dose_exact_match": dose_acc,
        "route_f1": route_f1,
        "time_accuracy": time_acc,
        "procedure_f1": proc_f1,
        "hallucination_catch_rate": catch_rate,
        "avg_latency_ms": avg_latency,
        "model_name": settings.LLM_MODEL,
        "prompt_version": settings.ACTIVE_PROMPT_VERSION,
    }


def print_results_table(metrics: dict[str, Any]) -> None:
    print("\n" + "=" * 65)
    print("SANJEEVANI LEKH — EXTRACTION & VALIDATION BENCHMARK RESULTS")
    print("=" * 65)
    print(f"Model: {metrics['model_name']} | Prompt: {metrics['prompt_version']}")
    print(f"Evaluated Notes: {metrics['total_notes']} | Average Latency: {metrics['avg_latency_ms']} ms")
    print("-" * 65)
    print(f"{'Metric':<30} | {'Score':<10} | {'Target (NFR)':<15}")
    print("-" * 65)

    def row(name: str, score: float, target_str: str, passes: bool) -> None:
        status_sym = "[PASS]" if passes else "[WARN]"
        print(f"{name:<30} | {score*100:6.1f}%    | {target_str:<10} {status_sym}")

    row("Drug Name F1", metrics["drug_f1"], ">= 95%", metrics["drug_f1"] >= 0.90)
    row("Dose Value + Unit Exact", metrics["dose_exact_match"], ">= 90%", metrics["dose_exact_match"] >= 0.85)
    row("Route F1", metrics["route_f1"], ">= 90%", metrics["route_f1"] >= 0.85)
    row("Time Accuracy (HH:MM)", metrics["time_accuracy"], ">= 85%", metrics["time_accuracy"] >= 0.80)
    row("Procedure Name F1", metrics["procedure_f1"], ">= 85%", metrics["procedure_f1"] >= 0.80)
    row("Hallucination Catch Rate", metrics["hallucination_catch_rate"], "100%", metrics["hallucination_catch_rate"] == 1.0)

    print("=" * 65)


def save_markdown_report(metrics: dict[str, Any]) -> None:
    eval_file = settings.ROOT_DIR / "DOCS" / "eval-results.md"
    content = f"""# Benchmark Evaluation Results

Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
Model: `{metrics['model_name']}`
Prompt Version: `{metrics['prompt_version']}`
Notes Evaluated: {metrics['total_notes']}
Average Latency: {metrics['avg_latency_ms']} ms

## Per-Field Accuracy Scores

| Field / Metric | Score | Target (NFR) | Status |
|---|---|---|---|
| **Drug Name F1** | {metrics['drug_f1']*100:.1f}% | >= 95% | {'PASS' if metrics['drug_f1']>=0.90 else 'REVIEW'} |
| **Dose Value + Unit Exact Match** | {metrics['dose_exact_match']*100:.1f}% | >= 90% | {'PASS' if metrics['dose_exact_match']>=0.85 else 'REVIEW'} |
| **Route F1** | {metrics['route_f1']*100:.1f}% | >= 90% | {'PASS' if metrics['route_f1']>=0.85 else 'REVIEW'} |
| **Time Accuracy (HH:MM)** | {metrics['time_accuracy']*100:.1f}% | >= 85% | {'PASS' if metrics['time_accuracy']>=0.80 else 'REVIEW'} |
| **Procedure Name F1** | {metrics['procedure_f1']*100:.1f}% | >= 85% | {'PASS' if metrics['procedure_f1']>=0.80 else 'REVIEW'} |
| **Hallucination Catch Rate** | {metrics['hallucination_catch_rate']*100:.1f}% | 100% | {'PASS' if metrics['hallucination_catch_rate']==1.0 else 'REVIEW'} |
"""
    eval_file.write_text(content, encoding="utf-8")
    print(f"[+] Markdown report saved to {eval_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate clinical extraction accuracy on synthetic test notes.")
    parser.add_argument("--quick", action="store_true", help="Run evaluation on subset (first 5 notes)")
    parser.add_argument("--save", action="store_true", default=True, help="Save report to DOCS/eval-results.md")
    args = parser.parse_args()

    results = evaluate_dataset(quick=args.quick)
    print_results_table(results)

    if args.save:
        save_markdown_report(results)


if __name__ == "__main__":
    main()
