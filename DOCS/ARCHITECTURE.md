# Architecture

How Field-to-Record is built, how data moves through it, and why each choice was made.

---

## 1. Big picture

The system has two zones.

- **Edge zone (the device):** a Mac with Apple Silicon. Does all clinical work. Works offline.
- **Cloud zone (optional):** a supervisor dashboard. Only receives confirmed records. Never runs AI.

```
┌──────────────────────────── EDGE DEVICE (Mac M2, offline) ─────────────────────────────┐
│                                                                                        │
│   ┌──────────────┐        ┌────────────────────── FastAPI backend ──────────────────┐  │
│   │  Local UI    │  HTTP  │                                                         │  │
│   │ React + Vite │ ─────► │  Input router                                           │  │
│   │ (responder)  │        │     │                                                   │  │
│   └──────────────┘        │     ├─ audio ─► Transcriber (mlx-whisper)  ─┐           │  │
│                           │     ├─ image ─► OCR (Apple Vision/ocrmac) ─┤           │  │
│                           │     └─ text  ──────────────────────────────┤           │  │
│                           │                                            ▼           │  │
│                           │                                   Raw text (editable)  │  │
│                           │                                            │           │  │
│                           │                     Extractor (Ollama + medgemma1.5)   │  │
│                           │                                            │           │  │
│                           │                     Validator (source check, ranges,   │  │
│                           │                                units, routes, med7)    │  │
│                           │                                            │           │  │
│                           │                     FHIR-lite mapper ──► Draft record  │  │
│                           │                                            │           │  │
│                           │                     ◄── responder reviews & confirms   │  │
│                           │                                            │           │  │
│                           │                     Audit store (SQLite hash chain)    │  │
│                           │                                            │           │  │
│                           │                     Report builder (HTML / PDF)        │  │
│                           │                                            │           │  │
│                           │                     Sync worker ── only when online ───┼──┼──┐
│                           └─────────────────────────────────────────────────────────┘  │  │
│                                                                                        │  │
│   Ollama server (localhost:11434, Metal GPU)                                           │  │
└────────────────────────────────────────────────────────────────────────────────────────┘  │
                                                                                            │
┌──────────────────────────────── CLOUD (optional) ─────────────────────────────────┐       │
│   Supabase (Postgres)  ◄───────────────────────────────────────────────────────────┼───────┘
│          │                                                                         │
│   Next.js dashboard on Vercel (supervisors, auditors)                              │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Components

| Component | Job | Technology | Runs on |
|---|---|---|---|
| Local UI | Capture, review, confirm, view report | React + Vite (static build) | Device browser |
| API | Routes requests, runs the pipeline | FastAPI | Device |
| Transcriber | Speech → text | `whisper.cpp` (GGML) / `mlx-whisper` | Cross-platform (CPU/GPU) |
| OCR | Image → text | Apple Vision via `ocrmac` | Device |
| Extractor | Text → structured items | Ollama + `medgemma1.5` | Device (Metal GPU) |
| Validator | Catches mistakes and made-up values | Python rules + optional med7 | Device |
| FHIR mapper | Items → FHIR-lite Bundle | Python | Device |
| Audit store | Append-only, hash-chained log | SQLite | Device |
| Report builder | Bundle → HTML / PDF | Jinja2 + WeasyPrint | Device |
| Sync worker | Push confirmed rows to cloud | Python `httpx` | Device |
| Cloud DB | Stores synced records | Supabase Postgres | Cloud |
| Dashboard | Read-only view for supervisors | Next.js | Vercel |
| Sync service (later) | Receives records, re-verifies chain | Spring Boot | Cloud, optional |

## 3. Pipeline, step by step

```
1. CAPTURE      UI sends text, audio, or image to /draft/*
2. TRANSCRIBE   audio → mlx-whisper → text
                image → Apple Vision → text + confidence
3. EDIT         responder may fix the raw text (optional)
4. EXTRACT      text + system prompt → Ollama (JSON schema forced, temperature 0)
5. VALIDATE     a. JSON matches schema        → else retry once
                b. source_text found in note  → else needs_review
                c. route and unit normalised  → else needs_review
                d. dose within reference range→ else needs_review
                e. med7 agrees (optional)     → else needs_review
6. MAP          items → FHIR-lite Bundle
7. REVIEW       UI shows draft + flags; responder edits and confirms
8. STORE        /confirm → hash(content + prev_hash) → append row
9. REPORT       Bundle → HTML handover → PDF
10. SYNC        when online, push unsynced rows in order
```

Nothing is saved to the audit log until a human confirms it (step 7).

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Checks Ollama, Whisper model, and database |
| `POST` | `/draft/text` | Text → draft record |
| `POST` | `/draft/voice` | Audio file → draft record |
| `POST` | `/draft/image` | Image file → draft record |
| `POST` | `/draft/reextract` | Edited raw text → new draft |
| `POST` | `/confirm` | Save a reviewed draft to the audit chain |
| `POST` | `/correct/{record_id}` | Save a correction as a new linked row |
| `GET` | `/encounters` | List encounters |
| `GET` | `/encounters/{id}` | Records for one encounter |
| `GET` | `/encounters/{id}/report` | HTML handover report |
| `GET` | `/encounters/{id}/report.pdf` | PDF report |
| `GET` | `/audit/verify` | Check the whole hash chain |
| `POST` | `/sync` | Push unsynced rows (when online) |

### Draft response shape

```json
{
  "draft_id": "DRF-8C21A0F3",
  "encounter_id": "ENC-4F2A91B7",
  "input_type": "voice",
  "raw_text": "14:32 gave aspirin 324 mg PO chewed...",
  "ocr_confidence": null,
  "low_confidence_lines": [],
  "bundle": { "resourceType": "Bundle", "type": "collection", "entry": [] },
  "flags": [
    { "item_id": "ENC-4F2A91B7-med-2", "reason": "source_text_not_found" }
  ],
  "model": { "name": "medgemma1.5", "prompt_version": "extract-v1.0" },
  "timings_ms": { "transcribe": 3100, "extract": 4200, "validate": 12 }
}
```

## 5. Data model

### 5.1 Extraction schema (what the LLM must return)

```json
{
  "medications": [
    {
      "time": "14:32",
      "drug": "aspirin",
      "dose_value": 324,
      "dose_unit": "mg",
      "route": "PO",
      "source_text": "14:32 gave aspirin 324 mg PO chewed"
    }
  ],
  "procedures": [
    {
      "time": "14:35",
      "name": "IV access",
      "details": "18 gauge, left antecubital",
      "source_text": "IV 18 gauge left AC"
    }
  ]
}
```

### 5.2 SQLite: `audit_log`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto increment |
| `record_id` | TEXT | Unique ID for this row |
| `encounter_id` | TEXT | Groups records for one call |
| `created_at` | TEXT | ISO 8601 UTC |
| `input_type` | TEXT | `text`, `voice`, `image` |
| `raw_text` | TEXT | Original transcription, never changed |
| `record_json` | TEXT | Confirmed FHIR-lite Bundle |
| `model_name` | TEXT | e.g. `medgemma1.5` |
| `prompt_version` | TEXT | e.g. `extract-v1.0` |
| `reviewed_by` | TEXT | Responder ID |
| `corrects_record_id` | TEXT NULL | Points to the row this one corrects |
| `prev_hash` | TEXT | Hash of the row before (`GENESIS` for first) |
| `hash` | TEXT | SHA-256 of this row's content + `prev_hash` |
| `synced` | INTEGER | 0 or 1. The only column that may change |

**Hash input:** JSON of all content columns (not `id`, `hash`, or `synced`), with sorted keys, plus `prev_hash`.

A database trigger blocks `UPDATE` on content columns and blocks `DELETE`.

### 5.3 Supabase: `audit_log`

Same columns, plus `device_id` and `received_at`. The primary key is (`device_id`, `record_id`), so retrying a sync never makes duplicates.

## 6. Folder structure

```
field-to-record/
├── AGENT.md
├── README.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DESIGN.md
│   ├── REQUIREMENTS.md
│   └── PROMPTS.md
├── backend/
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py            FastAPI app and routes
│   │   ├── config.py          Settings (model names, paths, versions)
│   │   ├── schemas.py         Pydantic models
│   │   ├── transcribe.py      mlx-whisper
│   │   ├── ocr.py             Apple Vision
│   │   ├── extract.py         Ollama call
│   │   ├── validate.py        Source check, ranges, normalisation
│   │   ├── normalise.py       Route/unit/time/number rules
│   │   ├── fhir.py            FHIR-lite mapper
│   │   ├── db.py              SQLite audit chain
│   │   ├── report.py          HTML/PDF report
│   │   └── sync.py            Cloud sync
│   ├── prompts/
│   │   ├── extract_v1.txt
│   │   └── ocr_handwritten_v1.txt
│   ├── data/
│   │   ├── drug_reference.json   Safe dose ranges, aliases
│   │   └── rxnorm_lookup.json    Optional codes
│   ├── templates/
│   │   └── report.html
│   ├── scripts/
│   │   ├── download_models.py
│   │   ├── evaluate.py
│   │   └── tamper_demo.py
│   └── tests/
├── local-ui/                  React + Vite
├── dashboard/                 Next.js (Vercel)
└── test-data/
    ├── notes/                 note_001.txt …
    ├── answers/               note_001.json …
    └── recordings/            (gitignored)
```

## 7. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Where AI runs | On the device | Must work offline. Keeps clinical data private. |
| Backend language | Python | Best support for Whisper, spaCy, OCR, and Ollama |
| Speech model | `whisper.cpp` (GGML models) / `mlx-whisper` | Portable across all laptops (Mac, Windows, Linux) and Apple Silicon |
| OCR | Apple Vision | Built into macOS, offline, better than Tesseract |
| LLM | `medgemma1.5` 4B | Medical training, small enough for 8 GB RAM |
| Output control | JSON schema in Ollama `format` | Model cannot return messy text |
| Hallucination guard | `source_text` check | Simple, explainable, catches made-up items |
| Storage | SQLite | One file, no server, works offline |
| Tamper evidence | SHA-256 hash chain | Easy to explain and verify |
| Cloud | Supabase + Vercel | Free, simple, only for confirmed data |
| Vercel's role | Dashboard only | Vercel can't run multi-GB models, and the app must work offline |

## 8. Failure handling

| Failure | What happens |
|---|---|
| Ollama not running | `/health` and `/draft/*` return 503 with "Start Ollama" |
| Invalid JSON from LLM | Retry once with a stricter reminder, then return 422 |
| Empty transcription | Return 422, "No speech detected" |
| Low OCR confidence | Draft still made. Low lines highlighted |
| Out of memory | Return 503, log a hint to use a smaller model |
| Sync fails | Rows stay `synced = 0`, retried next time |
| Chain broken | `/audit/verify` returns `false` and the first bad row ID |

## 9. Security

- Backend binds to `127.0.0.1` only.
- CORS allows only the local UI origin.
- Uploaded files go to a temp folder and are deleted after processing.
- Logs never include raw clinical text, only IDs and timings.
- Supabase uses a service key stored in a local `.env`, never committed.
- Dashboard is read-only and uses Supabase row-level security.

## 10. Performance on Mac M2

- Ollama uses the Metal GPU automatically. Check with `ollama ps`.
- `OLLAMA_KEEP_ALIVE=30m` keeps the model loaded between requests.
- The app sends a warm-up request on startup.
- `num_ctx` is set to 4096, which fits short field notes and saves memory.
- Whisper model loads once and is reused.

| RAM | LLM | Whisper |
|---|---|---|
| 8 GB | `medgemma1.5` | `whisper-small.en` |
| 16 GB | `medgemma1.5` or `gemma3:12b` | `whisper-small.en` / `medium.en` |
| 24 GB+ | try `medgemma:27b` | `whisper-large-v3-turbo` |
