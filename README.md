# Field-to-Record

**Offline voice-to-structured clinical note generator for first responders.**

A paramedic speaks, types, or photographs their on-scene notes. Field-to-Record turns them into a structured, timestamped, tamper-evident record of every medication and procedure given. It is the first link in a clinical audit chain.

Everything clinical runs on the device. No internet is needed.

---

## The problem

At an emergency, paramedics give drugs and do procedures fast, with no time to write things down. Notes end up on gloves, scraps of paper, or in memory. This leads to:

- **Safety risks:** the hospital may not know a drug was already given.
- **Wrong details:** doses and times written from memory are often wrong.
- **No proof:** nobody can later show exactly what happened and when.

## What it does

```
"14:32 gave aspirin 324 mg PO chewed, IV 18 gauge left AC"
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│ 14:32  Aspirin        324 mg   PO   ✓               │
│ 14:32  IV access      18G, left antecubital  ✓      │
│ Confirmed by: Medic-07   Hash: 9f3a…c21e            │
└──────────────────────────────────────────────────────┘
```

1. **Capture:** voice, typed text, or a photo of a written note.
2. **Transcribe:** voice → text (mlx-whisper), image → text (Apple Vision OCR).
3. **Extract:** a local medical LLM (MedGemma via Ollama) picks out drug, dose, route, time, and procedure.
4. **Verify & Cross-Check:** every extracted value must match original words. In addition, an n2c2-trained Clinical NER model and MIMIC-III ClinicalBERT cross-check treatments, detect omitted medications/procedures, and extract patient problems/tests.
5. **Confirm:** the responder reviews and approves the draft.
6. **Record:** saved as FHIR-lite JSON in a hash-chained SQLite log.
7. **Report:** a clean, human-readable handover document.
8. **Sync (optional):** when online, records go to a cloud dashboard for supervisors.

## Key features

- 100% offline after a one-time model download
- Voice, text, and image input
- FHIR-lite output (`MedicationAdministration`, `Procedure`)
- "Never guess" extraction with source-text checks
- **Dual-layer Clinical NER cross-checking** (fine-tuned n2c2 BERT for treatment omission detection)
- **Clinical concept extraction** (patient conditions/symptoms as `problem` and vitals/monitoring as `test`)
- **MIMIC-III Bio_ClinicalBERT** 768-dim embeddings for clinical semantic representations
- Tamper-evident audit chain (SHA-256 hash chain)
- Human-in-the-loop confirmation on every record
- Optional cloud dashboard (Next.js on Vercel + Supabase)

## Tech stack

| Layer | Technology |
|---|---|
| Local backend | Python 3.12, FastAPI |
| Speech-to-text | mlx-whisper / whisper.cpp (`whisper-small.en`) |
| OCR | Apple Vision via `ocrmac` / EasyOCR |
| LLM Extractor | Ollama + `medgemma1.5` (4B) |
| Clinical NER & Safety-Check | `samrawal/bert-base-uncased_clinical-ner` (fine-tuned on n2c2/i2b2) |
| Clinical Semantic Vectors | `emilyalsentzer/Bio_ClinicalBERT` (trained on MIMIC-III) |
| Local storage | SQLite (WAL mode, hash-chained) |
| Local UI | React + Vite (served by FastAPI, works offline) |
| Cloud dashboard | Next.js on Vercel |
| Cloud database | Supabase (Postgres) |
| Sync service (later) | Spring Boot, optional |

## Requirements

- Mac with Apple Silicon (M1/M2/M3). 8 GB RAM minimum, 16 GB recommended.
- macOS 13 or newer
- About 15 GB free disk space
- Python 3.12, Node.js 20+, Homebrew, ffmpeg, Ollama

## Quick start

```bash
# 1. System tools
brew install python@3.12 ffmpeg ollama node

# 2. Start Ollama and keep the model in memory
launchctl setenv OLLAMA_KEEP_ALIVE "30m"
ollama serve                      # leave running in its own tab

# 3. Download models (needs internet once)
ollama pull medgemma1.5

# 4. Backend
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py # caches Whisper, n2c2 NER, and MIMIC-III models locally

# 5. Run
uvicorn app.main:app --port 8000
```

Open **http://localhost:8000/docs** to test the API, or **http://localhost:8000** for the UI.

To prove it works offline, turn off Wi-Fi and run a test note.

## Clinical Models Integration (n2c2 & MIMIC-III)

The system integrates two fine-tuned clinical transformer models running locally via PyTorch with Apple Silicon Metal Performance Shaders (`mps`) acceleration:

1. **n2c2 Clinical NER Model (`samrawal/bert-base-uncased_clinical-ner`)**:
   - **Trained on:** Harvard DBMI's n2c2 / i2b2 Clinical Concept Extraction benchmark.
   - **Extracts:**
     - `treatment`: Medications, therapies, and clinical procedures.
     - `problem`: Medical conditions, symptoms, and acute signs (e.g., *"acute chest pain"*, *"STEMI"*).
     - `test`: Diagnostic exams, monitoring, and vitals (e.g., *"12-lead ECG"*, *"blood glucose"*).
   - **Safety Net (Omission Detection):** Cross-checks LLM extractions against token-level treatment entities. If a clinical treatment was stated in the note but missed by the extractor, an informative flag (`n2c2_treatment_detected`) is automatically raised.

2. **MIMIC-III Clinical Model (`emilyalsentzer/Bio_ClinicalBERT`)**:
   - **Trained on:** Beth Israel Deaconess Medical Center ICU EHR clinical notes from PhysioNet MIMIC-III.
   - **Extracts:** 768-dimensional normalized contextual clinical embeddings for semantic similarity, note clustering, and clinical terminology grounding.

### Dedicated Endpoints:
- `POST /clinical-ner/entities` — Extracts all clinical concepts (`treatment`, `problem`, `test`) with token spans and confidence scores.
- `POST /clinical-ner/embedding` — Computes 768-dim normalized MIMIC-III clinical embeddings.

## Project structure

```
field-to-record/
├── backend/            Python FastAPI service (runs on the device)
│   ├── app/
│   ├── prompts/
│   ├── scripts/
│   └── tests/
├── local-ui/           React + Vite responder app (offline)
├── dashboard/          Next.js supervisor dashboard (Vercel)
├── test-data/          Synthetic dictations + answer keys
└── docs/
    ├── ARCHITECTURE.md
    ├── DESIGN.md
    ├── REQUIREMENTS.md
    └── PROMPTS.md
```

## Data and privacy

- **No real PHI** (Protected Health Information) is used anywhere.
- Test data comes from:
  - **n2c2 2018 Track 2** (medication extraction, de-identified)
  - **MIMIC-III** (de-identified, needs PhysioNet credentialing)
  - **Self-written synthetic EMS dictations** in `test-data/`
- MIMIC and n2c2 data are **never committed** to this repo and **never sent to online AI services**, as required by their data use agreements.

## Evaluation

Run the accuracy test against the synthetic answer key:

```bash
python scripts/evaluate.py --model medgemma1.5
```

Reports precision, recall, and F1 for each field (drug, dose, unit, route, time, procedure), plus Whisper word error rate on drug names.

## Disclaimer

This is a research and portfolio project. It is **not a medical device**. MedGemma is a developer model. Every record must be reviewed and confirmed by a qualified responder.

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md): system parts and data flow
- [DESIGN.md](docs/DESIGN.md): UI, UX, and data design
- [REQUIREMENTS.md](docs/REQUIREMENTS.md): what the system must do
- [PROMPTS.md](docs/PROMPTS.md): the exact AI prompts and rules
- [MODELS.md](MODELS.md): AI models & GitHub open-source repositories inventory with technical justifications
- [whisper.md](whisper.md): whisper.cpp speech-to-text model specifications and offline runtime
- [PRESENTATION.html](PRESENTATION.html) / [PPTX Deck](Sanjeevani_Lekh_Presentation.pptx): Project executive presentation deck
- [AGENT.md](AGENT.md): instructions for AI coding assistants

## Contributors

- **Milind Verma** · [GitHub](https://github.com/Milindverma24)
- **Nikhil Agrawal** · [GitHub](https://github.com/agnikhil9897)
- **Riya Mehta** · [GitHub](https://github.com/1754riya)

