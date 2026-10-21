# AGENT.md

Instructions for AI coding assistants (Claude Code, Cursor, Copilot, etc.) working on this repo.

Read this file first. Then read `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, and `docs/PROMPTS.md` before writing code.

---

## 1. What this project is

Field-to-Record turns a paramedic's spoken, typed, or written notes into a structured, timestamped, tamper-evident record of medications and procedures. It runs fully offline on a Mac with Apple Silicon.

Pipeline:
```
input → transcribe (mlx-whisper / Apple Vision) → extract (Ollama + medgemma1.5)
      → validate (Python rules) → FHIR-lite → human confirms → SQLite hash chain → report
```

## 2. Non-negotiable rules

Break any of these and the work is wrong, even if it runs.

1. **Offline first.** No code in `backend/` may call an internet service during capture, transcription, extraction, validation, storage, or reporting. Only `sync.py` and `scripts/download_models.py` may use the network.
2. **No cloud AI.** Never add OpenAI, Gemini, Anthropic, or any hosted model API to the clinical pipeline.
3. **No real patient data.** Never add real PHI. Never commit MIMIC-III or n2c2 files. Use `test-data/` synthetic notes only.
4. **AI never guesses.** Don't make dose, unit, route, or time required in the extraction schema. Missing values are flagged, not filled.
5. **Human confirms.** Nothing is written to `audit_log` without a call to `/confirm` with a responder ID.
6. **Append-only audit log.** Never write code that runs `UPDATE` on content columns or `DELETE` on `audit_log`. Corrections are new rows with `corrects_record_id`. Only `synced` may change.
7. **Hashing is fixed.** SHA-256 over JSON with `sort_keys=True` of content columns plus `prev_hash`. Changing this breaks every existing chain, so don't change it without a migration plan.
8. **Prompts are versioned.** Never edit a released file in `backend/prompts/`. Make a new version.
9. **Never log clinical text.** Logs contain IDs, timings, and error codes only.
10. **Localhost only.** The backend binds to `127.0.0.1`.

## 3. Tech stack

| Area | Use | Don't use |
|---|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2 | Flask, Django |
| Speech | `whisper.cpp` (GGML models) / `mlx-whisper` | OpenAI Whisper API, cloud STT |
| OCR | `ocrmac` (Apple Vision) | Cloud OCR, Google Vision API |
| LLM | `ollama` Python client, `medgemma1.5` | Hosted LLM APIs |
| DB | `sqlite3` (standard library) | ORMs for the audit table |
| Reports | Jinja2 + WeasyPrint | Headless browsers in the backend |
| Tests | `pytest` | |
| Local UI | React + Vite + TypeScript | Next.js for the local UI |
| Dashboard | Next.js + TypeScript on Vercel, Supabase JS | |

## 4. Code style

### Python
- Python 3.12, type hints on every function.
- Pydantic v2 models for all request and response bodies.
- Format with `ruff format`, lint with `ruff check`.
- Full, readable code. No compressed one-liners or clever tricks.
- Short functions with clear names: `extract_record`, `verify_chain`, `normalise_route`.
- Settings in `app/config.py`, read from environment variables with sensible defaults.

### TypeScript / JavaScript
- ES modules only (`import` / `export`). Never `require`.
- `async` / `await` for all async code. No `.then()` chains.
- Strict TypeScript.
- Full, readable formatting.

### Comments
- Explain *why*, not *what*.
- Plain English.

## 5. How to work

1. **Read before writing.** Check the existing file and the docs before changing anything.
2. **Small steps.** One feature or fix per change. Keep the app runnable after each step.
3. **Test as you go.** Add or update tests in `backend/tests/` with every change to extraction, validation, normalisation, hashing, or the database.
4. **Run the checks** before saying a task is done:
   ```bash
   cd backend
   ruff check .
   pytest
   python scripts/evaluate.py --quick
   ```
5. **Say what you changed.** End with a short summary: files changed, why, and how to test.
6. **Ask when unsure** about clinical meaning, the audit chain, or anything in Section 2. Don't guess.

## 6. Build order

Follow this order. Don't jump ahead.

| Step | Task | Done when |
|---|---|---|
| 1 | `config.py`, `schemas.py`, `/health` | `/health` reports Ollama and DB status |
| 2 | `extract.py` with prompt `extract-v1.0` | Example A in `PROMPTS.md` returns the expected JSON |
| 3 | `normalise.py` + `validate.py` | All validation codes have passing tests |
| 4 | `fhir.py` | Bundle matches `ARCHITECTURE.md` shape |
| 5 | `/draft/text` | Works with Wi-Fi off |
| 6 | `db.py`, `/confirm`, `/audit/verify` | `tamper_demo.py` shows the chain break |
| 7 | `scripts/evaluate.py` | Prints per-field scores for 20 test notes |
| 8 | `transcribe.py`, `/draft/voice` | 5 recordings transcribe offline |
| 9 | `ocr.py`, `/draft/image` | Printed note photo produces a draft |
| 10 | `report.py`, report endpoints | HTML and PDF render offline |
| 11 | `local-ui/` | Capture → review → confirm flow works |
| 12 | `sync.py` + Supabase | Rows sync once, no duplicates on retry |
| 13 | `dashboard/` | Deployed to Vercel, reads Supabase |

## 7. Key files

| File | Purpose |
|---|---|
| `backend/app/main.py` | Routes only. No business logic |
| `backend/app/extract.py` | Calls Ollama. Loads prompt from file. Retries once |
| `backend/app/validate.py` | All flag rules from `PROMPTS.md` Section 6 |
| `backend/app/normalise.py` | Routes, units, spoken numbers, times, drug aliases |
| `backend/app/db.py` | Only place that touches SQLite |
| `backend/prompts/*.txt` | Versioned prompts. Never edit released ones |
| `backend/data/drug_reference.json` | Aliases and flag ranges |
| `test-data/notes/*.txt` | Synthetic input notes |
| `test-data/answers/*.json` | Expected output for each note |

## 8. Testing rules

- Every validation code in `PROMPTS.md` needs at least one test that triggers it and one that doesn't.
- Tests for `db.py` use a temporary database file.
- Tests that need Ollama are marked `@pytest.mark.llm` and skipped if Ollama is not running.
- Required tests:
  - hash chain verifies after 10 inserts,
  - editing one row's `raw_text` makes verification fail at that row,
  - deleting a row makes verification fail,
  - `UPDATE` on a content column is blocked by the trigger,
  - negation note (Example B) returns only oxygen,
  - a made-up item is flagged `source_text_not_found`.

## 9. Don't

- Don't add features not in `REQUIREMENTS.md` without asking.
- Don't add diagnosis, treatment suggestions, or dosing advice.
- Don't add new dependencies without saying why.
- Don't change the extraction schema, hash method, or audit table without updating `ARCHITECTURE.md` and tests.
- Don't put API keys or secrets in code. Use `.env` (gitignored).
- Don't commit model files, `.db` files, recordings, or dataset files.

## 10. Environment

- Machine: Mac M2, macOS 13+, 8–16 GB RAM.
- Ollama runs at `http://127.0.0.1:11434` with `OLLAMA_KEEP_ALIVE=30m`.
- Backend: `uvicorn app.main:app --host 127.0.0.1 --port 8000`.
- Local UI dev server: `http://localhost:5173`. Production build served by FastAPI at `/`.

### `.gitignore` must include

```
.venv/
node_modules/
*.db
.env
test-data/recordings/
datasets/
models/
__pycache__/
.next/
dist/
```
