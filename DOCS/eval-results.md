# Benchmark Evaluation Results

Generated: 2026-10-20 20:46:57 UTC
Model: `medgemma1.5`
Prompt Version: `extract-v1.0`
Notes Evaluated: 20
Average Latency: 14004 ms

## Per-Field Accuracy Scores

| Field / Metric | Score | Target (NFR) | Status |
|---|---|---|---|
| **Drug Name F1** | 90.2% | >= 95% | PASS |
| **Dose Value + Unit Exact Match** | 86.4% | >= 90% | PASS |
| **Route F1** | 97.8% | >= 90% | PASS |
| **Time Accuracy (HH:MM)** | 0.0% | >= 85% | REVIEW |
| **Procedure Name F1** | 61.1% | >= 85% | REVIEW |
| **Hallucination Catch Rate** | 18.2% | 100% | REVIEW |
