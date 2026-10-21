# Prompts and AI Behaviour

The exact prompts the local AI uses, the rules it must follow, and the checks that run after it.

Each prompt has a version. The version is saved with every record, so any record can be traced back to the exact prompt that made it.

---

## 1. How the AI works (plain overview)

The AI does **one job**: read a field note and list the medications and procedures in it.

It does **not**:
- diagnose,
- suggest treatment,
- fill in missing information,
- fix doses it thinks are wrong.

```
note text ──► [Extraction prompt + JSON schema] ──► MedGemma ──► JSON
                                                                   │
                         Python checks (not AI) ◄──────────────────┘
                         - source text exists?
                         - route/unit allowed?
                         - dose in safe range?
                         - med7 agrees?
                                   │
                                   ▼
                         Draft with flags ──► Human confirms
```

The AI only proposes. Python rules check. A human decides.

## 2. Model settings

| Setting | Value | Why |
|---|---|---|
| Model | `medgemma1.5` | Medical training, fits 8 GB RAM |
| `temperature` | `0` | Same input gives the same output |
| `num_ctx` | `4096` | Field notes are short |
| `format` | JSON schema (below) | Forces valid structured output |
| `keep_alive` | `30m` | No reload delay |
| `seed` | `42` | Extra repeatability |

## 3. Extraction prompt — `extract-v1.0`

File: `backend/prompts/extract_v1.txt`

```text
You are a clinical data extraction tool for emergency medical services (EMS).

Your only job: read one field note written or spoken by a paramedic, and list
every medication given and every procedure performed.

You do not diagnose. You do not give advice. You do not judge whether a dose
is correct. You only record what the note says.

=== RULES ===

1. ONLY WHAT IS STATED
   - Extract only information clearly stated in the note.
   - If a value is missing, leave that field out. Never guess.
   - Never add a drug, dose, route, or time that is not in the note.

2. SOURCE TEXT
   - For every item, copy the exact words from the note into "source_text".
   - Copy them character for character. Do not reword, fix spelling, or expand.
   - Keep source_text short: only the words for that one item.

3. MEDICATIONS
   - "drug": the generic drug name in lowercase.
       nitro, NTG          -> nitroglycerin
       epi                 -> epinephrine
       narcan              -> naloxone
       zofran              -> ondansetron
       versed              -> midazolam
       ASA                 -> aspirin
       D50                 -> dextrose 50%
       albuterol, ventolin -> albuterol
   - "dose_value": a number only. Turn spoken numbers into digits.
       "point four"        -> 0.4
       "three twenty four" -> 324
       "one and a half"    -> 1.5
   - "dose_unit": one of: mg, mcg, g, mL, units, L/min, mg/kg, mcg/kg, %
       milligrams -> mg, micrograms / mics -> mcg, ccs -> mL
   - "route": one of: IV, IM, IO, PO, SL, IN, NEB, SC, TOP, ET, INH
       by mouth, oral, chewed      -> PO
       under the tongue            -> SL
       intranasal, nasal, up nose  -> IN
       nebulised, neb              -> NEB
       intramuscular, in the thigh -> IM
       intravenous, IV push        -> IV
       intraosseous                -> IO
       subcutaneous, sub-q         -> SC
       oxygen by mask/cannula      -> INH
   - Oxygen is a medication. Record flow in L/min.

4. PROCEDURES
   - "name": a short standard name, for example:
       IV access, IO access, 12-lead ECG, defibrillation, CPR,
       intubation, supraglottic airway, cervical collar, splinting,
       tourniquet, wound dressing, glucose check, oxygen therapy, cardioversion
   - "details": size, side, site, energy, or count if stated
       ("18G, left antecubital", "200 J biphasic", "2 attempts").

5. TIME
   - "time": 24-hour HH:MM if a time is stated for that item.
       "two thirty two" -> 14:32 only if PM is clear from the note; otherwise 02:32
       "14 32"          -> 14:32
   - If one time is stated and the next items say "then" with no new time,
     leave time out for those items. Do not copy the earlier time.

6. CORRECTIONS
   - If the speaker corrects themselves ("sorry, I mean 0.4"), use the
     corrected value and include the full correction in source_text.

7. NEGATIONS AND PLANS
   - Do not extract drugs that were NOT given:
       "held the nitro", "no aspirin, allergic", "consider morphine",
       "will give", "patient takes metoprolol at home".
   - Only extract things that were actually given or done.

8. OUTPUT
   - Return only JSON matching the schema. No other text.
   - If nothing was given or done, return empty lists.
```

### User message format

```text
FIELD NOTE:
<<<
{note_text}
>>>
```

## 4. JSON schema

Passed to Ollama as `format`. Defined in `backend/app/schemas.py` with Pydantic.

```json
{
  "type": "object",
  "properties": {
    "medications": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time":        { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
          "drug":        { "type": "string" },
          "dose_value":  { "type": "number" },
          "dose_unit":   { "type": "string", "enum": ["mg","mcg","g","mL","units","L/min","mg/kg","mcg/kg","%"] },
          "route":       { "type": "string", "enum": ["IV","IM","IO","PO","SL","IN","NEB","SC","TOP","ET","INH"] },
          "source_text": { "type": "string" }
        },
        "required": ["drug", "source_text"]
      }
    },
    "procedures": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time":        { "type": "string", "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
          "name":        { "type": "string" },
          "details":     { "type": "string" },
          "source_text": { "type": "string" }
        },
        "required": ["name", "source_text"]
      }
    }
  },
  "required": ["medications", "procedures"]
}
```

Dose, unit, and route are **not required** on purpose. If the model were forced to fill them, it would guess. Missing values are flagged instead.

## 5. Worked examples (used in tests, not in the prompt)

### Example A — normal note

Input:
```
14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC. 14:38 nitro point four under the tongue.
```

Expected:
```json
{
  "medications": [
    { "time": "14:32", "drug": "aspirin", "dose_value": 324, "dose_unit": "mg", "route": "PO",
      "source_text": "14:32 gave aspirin 324 mg PO chewed" },
    { "time": "14:38", "drug": "nitroglycerin", "dose_value": 0.4, "dose_unit": "mg", "route": "SL",
      "source_text": "14:38 nitro point four under the tongue" }
  ],
  "procedures": [
    { "name": "IV access", "details": "18G, left antecubital",
      "source_text": "IV 18 gauge left AC" }
  ]
}
```

Note: the nitro unit "mg" is not spoken. The validator flags it as `unit_inferred` for review.

### Example B — negation and plan

Input:
```
Pt on home metoprolol. Held nitro, BP 88 systolic. Will consider fentanyl if pain persists. Gave 4 L/min O2 by nasal cannula.
```

Expected: only oxygen.
```json
{
  "medications": [
    { "drug": "oxygen", "dose_value": 4, "dose_unit": "L/min", "route": "INH",
      "source_text": "Gave 4 L/min O2 by nasal cannula" }
  ],
  "procedures": []
}
```

### Example C — correction

Input:
```
Epi 1 mg IM, sorry, point three mg IM to the thigh at 09:12.
```

Expected:
```json
{
  "medications": [
    { "time": "09:12", "drug": "epinephrine", "dose_value": 0.3, "dose_unit": "mg", "route": "IM",
      "source_text": "Epi 1 mg IM, sorry, point three mg IM to the thigh at 09:12" }
  ],
  "procedures": []
}
```
The validator flags this with `spoken_correction` so a human checks it.

### Example D — missing information

Input:
```
Gave narcan intranasal, pt responsive.
```

Expected:
```json
{
  "medications": [
    { "drug": "naloxone", "route": "IN", "source_text": "Gave narcan intranasal" }
  ],
  "procedures": []
}
```
Validator flags `missing_dose` and `missing_time`.

## 6. Validation rules (Python, run after the AI)

These run in `backend/app/validate.py`. They never call the AI.

| Code | Check | Result |
|---|---|---|
| `source_text_not_found` | `source_text` (lowercased, extra spaces removed) is not in the note | needs_review |
| `missing_dose` | medication has no `dose_value` | needs_review (except oxygen if flow given) |
| `missing_unit` | dose given, no unit | needs_review |
| `unit_inferred` | unit not found in `source_text` | needs_review |
| `missing_route` | medication has no route | needs_review |
| `missing_time` | no time on item | info only (not blocking) |
| `dose_out_of_range` | dose outside range in `drug_reference.json` | needs_review |
| `unknown_drug` | drug not in reference list | needs_review |
| `spoken_correction` | source text contains "sorry", "I mean", "correction", "scratch that" | needs_review |
| `med7_disagrees` | med7 found a different drug or dose (optional) | needs_review |
| `duplicate_item` | same drug, dose, route, and time appears twice | needs_review |

### `drug_reference.json` (sample)

```json
{
  "aspirin":        { "aliases": ["asa"],           "units": ["mg"],  "range": [81, 325],  "routes": ["PO"] },
  "nitroglycerin":  { "aliases": ["nitro", "ntg"],  "units": ["mg"],  "range": [0.3, 0.4], "routes": ["SL"] },
  "epinephrine":    { "aliases": ["epi"],           "units": ["mg"],  "range": [0.01, 1],  "routes": ["IM", "IV", "IO", "ET"] },
  "naloxone":       { "aliases": ["narcan"],        "units": ["mg"],  "range": [0.4, 4],   "routes": ["IN", "IV", "IM", "IO"] },
  "ondansetron":    { "aliases": ["zofran"],        "units": ["mg"],  "range": [4, 8],     "routes": ["IV", "PO", "IM"] },
  "oxygen":         { "aliases": ["o2"],            "units": ["L/min"], "range": [1, 15],  "routes": ["INH"] }
}
```

These ranges are rough reference values for **flagging only**, not dosing guidance. They exist to catch transcription errors like "3240 mg".

## 7. Retry prompt — `extract-retry-v1.0`

Used once if the first reply fails validation against the schema.

```text
Your previous reply was not valid. Return ONLY a JSON object with the keys
"medications" and "procedures", matching the schema exactly. No explanation.
Remember: only extract what is stated, and copy source_text exactly.
```

## 8. Handwritten OCR prompt — `ocr-handwritten-v1.0`

Used only when Apple Vision confidence is very low and the image is sent to MedGemma's vision input.

```text
Transcribe every word in this handwritten medical field note exactly as written.

Rules:
- Copy the text line by line, top to bottom.
- Do not correct spelling, expand abbreviations, or add punctuation.
- Keep numbers exactly as written, including decimal points.
- If a word or number is unreadable, write [unclear] in its place.
- Never guess a number. A wrong dose is worse than [unclear].
- Return only the transcription. No comments.
```

## 9. Whisper prompt — `whisper-hint-v1.0`

Passed as `initial_prompt` to mlx-whisper. It's a vocabulary hint, not an instruction.

```text
EMS field notes. Aspirin, nitroglycerin, epinephrine, naloxone, Narcan,
amiodarone, adenosine, atropine, midazolam, Versed, fentanyl, morphine,
ketamine, ondansetron, Zofran, albuterol, ipratropium, dextrose, glucagon,
diphenhydramine, methylprednisolone. Milligrams, micrograms, mL, L per minute.
IV, IM, IO, PO, SL, intranasal, nebulized. 18 gauge, antecubital, 12-lead,
defibrillation, joules, intubation.
```

## 10. Prompt versioning rules

- Prompts live in `backend/prompts/` as `.txt` files with a version in the name.
- Never edit a released prompt. Create `extract_v1.1.txt` instead.
- `config.py` sets the active version.
- Every saved record stores `prompt_version`.
- Run `scripts/evaluate.py` before switching versions, and save the scores in `docs/eval-results.md`.

## 11. Evaluation

`scripts/evaluate.py` compares model output to `test-data/answers/*.json`.

| Metric | How |
|---|---|
| Drug F1 | Match on normalised drug name |
| Dose exact match | `dose_value` and `dose_unit` both equal |
| Route F1 | Match on route code |
| Time accuracy | Exact `HH:MM` match where the answer has a time |
| Procedure F1 | Match on procedure name |
| Hallucination catch rate | Items not in answer key that were flagged ÷ all such items |
| False flag rate | Correct items that were flagged ÷ all correct items |

Run the same test set against `medgemma1.5`, `gemma3:4b`, and one 8B model, and compare.
