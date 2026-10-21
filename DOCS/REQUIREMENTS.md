# Requirements

What Field-to-Record must do, how well, and under what limits.

Each requirement has an ID so it can be traced to code and tests.
**Priority:** `MUST` = needed for the first working version, `SHOULD` = needed for the final demo, `COULD` = nice to have.

---

## 1. Goal

Turn a first responder's spoken, typed, or written on-scene notes into a structured, timestamped, tamper-evident record of medications and procedures, fully offline, with a human confirming every record.

## 2. Users

| User | Needs |
|---|---|
| **Paramedic / EMT** (primary) | Fast capture with busy hands, quick review, one-tap confirm |
| **Receiving nurse / doctor** | A clear handover summary they can read in seconds |
| **Supervisor / auditor** | Proof that records were not altered, and a full history |
| **Developer / evaluator** | Accuracy numbers on test data |

## 3. Functional requirements

### 3.1 Input

| ID | Requirement | Priority |
|---|---|---|
| FR-IN-1 | Accept typed text notes | MUST |
| FR-IN-2 | Accept recorded audio (wav, m4a, mp3, webm) | MUST |
| FR-IN-3 | Record audio directly in the browser | SHOULD |
| FR-IN-4 | Accept images of printed notes (png, jpg, heic) | SHOULD |
| FR-IN-5 | Accept images of handwritten notes | COULD |
| FR-IN-6 | Reject files over 25 MB or audio over 10 minutes with a clear message | MUST |

### 3.2 Transcription

| ID | Requirement | Priority |
|---|---|---|
| FR-TR-1 | Convert speech to English text locally with mlx-whisper | MUST |
| FR-TR-2 | Use a medical vocabulary hint to improve drug name spelling | MUST |
| FR-TR-3 | Convert printed images to text locally with Apple Vision OCR | SHOULD |
| FR-TR-4 | Return OCR confidence and list low-confidence lines | SHOULD |
| FR-TR-5 | Mark unreadable words as `[unclear]`, never guess them | MUST |
| FR-TR-6 | Let the responder edit the raw text before extraction | SHOULD |

### 3.3 Extraction

| ID | Requirement | Priority |
|---|---|---|
| FR-EX-1 | Extract medications with: drug, dose value, dose unit, route, time | MUST |
| FR-EX-2 | Extract procedures with: name, details, time | MUST |
| FR-EX-3 | Return output that always matches the JSON schema | MUST |
| FR-EX-4 | Never invent a value that is not in the source text | MUST |
| FR-EX-5 | Store the exact source words (`source_text`) for each item | MUST |
| FR-EX-6 | Flag an item `needs_review` when its source text is not found in the note | MUST |
| FR-EX-7 | Flag doses outside a safe reference range for that drug | SHOULD |
| FR-EX-8 | Normalise routes to a fixed list (IV, IM, IO, PO, SL, IN, NEB, SC, TOP, ET) | MUST |
| FR-EX-9 | Normalise units (mg, mcg, g, mL, units, L/min) | MUST |
| FR-EX-10 | Turn spoken times ("two thirty five") into `HH:MM` | SHOULD |
| FR-EX-11 | Cross-check drugs and doses with med7 and flag disagreements | COULD |
| FR-EX-12 | Handle corrections in speech ("sorry, I mean 0.4 mg") by keeping the corrected value and flagging the item | SHOULD |

### 3.4 Output

| ID | Requirement | Priority |
|---|---|---|
| FR-OUT-1 | Produce a FHIR-lite Bundle with `MedicationAdministration` and `Procedure` resources | MUST |
| FR-OUT-2 | Produce a human-readable handover report (HTML) | MUST |
| FR-OUT-3 | Export the report as PDF, offline | SHOULD |
| FR-OUT-4 | Add RxNorm codes to drugs from a local lookup table | COULD |

### 3.5 Review and confirmation

| ID | Requirement | Priority |
|---|---|---|
| FR-RV-1 | Show the draft record next to the original text | MUST |
| FR-RV-2 | Highlight `needs_review` items clearly | MUST |
| FR-RV-3 | Let the responder edit, delete, or add items | MUST |
| FR-RV-4 | Block confirmation until every flagged item is reviewed | MUST |
| FR-RV-5 | Require a responder ID to confirm | MUST |

### 3.6 Audit chain

| ID | Requirement | Priority |
|---|---|---|
| FR-AU-1 | Save confirmed records in an append-only SQLite table | MUST |
| FR-AU-2 | Each row stores the SHA-256 hash of its content plus the previous row's hash | MUST |
| FR-AU-3 | Never update or delete rows. Corrections are new rows that point to the old one | MUST |
| FR-AU-4 | Store raw text, model name, model version, prompt version, and reviewer with each record | MUST |
| FR-AU-5 | Provide an endpoint that verifies the whole chain | MUST |
| FR-AU-6 | Show which row breaks the chain if tampering is found | SHOULD |

### 3.7 Sync and dashboard

| ID | Requirement | Priority |
|---|---|---|
| FR-SY-1 | Detect when the device is online | SHOULD |
| FR-SY-2 | Push unsynced records to Supabase, in order, and mark them synced | SHOULD |
| FR-SY-3 | Retry failed syncs safely without making duplicates | SHOULD |
| FR-SY-4 | Dashboard lists encounters, records, flags, and chain status | SHOULD |
| FR-SY-5 | Dashboard re-verifies the hash chain on the cloud copy | COULD |

## 4. Non-functional requirements

### 4.1 Offline and privacy

| ID | Requirement |
|---|---|
| NFR-1 | All capture, transcription, extraction, and storage work with no network |
| NFR-2 | No clinical text, audio, or image is ever sent to an online AI service |
| NFR-3 | The backend only listens on `127.0.0.1` by default |
| NFR-4 | No real PHI in the repo, logs, or test data |
| NFR-5 | Temporary audio and image files are deleted after processing |

### 4.2 Performance (Mac M2, 8 GB RAM, `medgemma1.5`)

| ID | Target |
|---|---|
| NFR-6 | Text note → draft record: under 8 seconds |
| NFR-7 | 30-second voice note → draft record: under 15 seconds |
| NFR-8 | Image → draft record: under 10 seconds |
| NFR-9 | Peak memory for the whole app: under 6 GB |
| NFR-10 | App start (models warm): under 20 seconds |

### 4.3 Accuracy (on the synthetic test set)

| ID | Target |
|---|---|
| NFR-11 | Drug name F1 ≥ 0.95 |
| NFR-12 | Dose value + unit exact match ≥ 0.90 |
| NFR-13 | Route F1 ≥ 0.90 |
| NFR-14 | Hallucinated items (not in source) caught by the source check: 100% |
| NFR-15 | Whisper word error rate on drug names ≤ 10% |

### 4.4 Reliability and quality

| ID | Requirement |
|---|---|
| NFR-16 | If the LLM returns invalid JSON, retry once, then return a clear error. Never crash |
| NFR-17 | If Ollama is not running, the API says so clearly |
| NFR-18 | Automated tests cover extraction rules, hashing, and chain verification |
| NFR-19 | Every prompt has a version number stored with each record |

## 5. Data requirements

| Source | Use | Access |
|---|---|---|
| Synthetic EMS dictations (self-written) | Main test set, demo | Open, in `test-data/` |
| n2c2 2018 Track 2 | Medication extraction benchmark | DUA via n2c2 portal |
| MIMIC-III v1.4 | Extra clinical text for testing | PhysioNet credentialing + CITI + DUA |
| MIMIC-III Demo | Early schema exploration | Open |

**Rules:**
- MIMIC and n2c2 files live outside the repo and are listed in `.gitignore`.
- They are only processed by local models.
- Synthetic notes must include: multiple drugs, missing fields, corrections, spoken numbers, abbreviations, and noise words.

## 6. Out of scope

- Diagnosis or treatment advice
- Real patient use or medical-device approval
- Patient demographics or identity capture
- Languages other than English (first version)
- Running AI models on Vercel or any cloud

## 7. Definition of done (first milestone)

- [ ] 20 synthetic notes pass through `/draft/text` with Wi-Fi off
- [ ] Output always matches the schema
- [ ] Every hallucinated item is flagged
- [ ] Confirmed records are saved and `/audit/verify` returns `true`
- [ ] Editing a row by hand makes `/audit/verify` return `false`
- [ ] `evaluate.py` prints per-field accuracy
