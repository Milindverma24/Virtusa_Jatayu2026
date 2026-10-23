# Sanjeevani Lekh — Panel Presentation & Demo Master Playbook

> **Target Audience:** Hackathon Panel / Evaluation Jury / Project Evaluators  
> **Team:** Milind Verma • Nikhil Agrawal • Gaurav Kumar • Riya Mehta  
> **Track:** AI in Healthcare / Edge Computing / Offline Emergency Systems  
> **Core Theme:** 100% Offline Edge AI for Emergency First Responders with Cryptographic Auditability

---

## 1. Quick URLs & Running Services

| Service | Address | Purpose | Status |
|---|---|---|---|
| **Paramedic Field App** | [http://localhost:5173/app](http://localhost:5173/app) *(or [:8000/app](http://localhost:8000/app))* | Main interactive field demonstration | **READY & LIVE** |
| **Interactive Docs & Architecture** | [http://localhost:5173/docs](http://localhost:5173/docs) | System architecture & deep-dive visuals | **READY & LIVE** |
| **Executive Presentation Deck** | [`PRESENTATION.html`](../PRESENTATION.html) | 12-slide interactive pitch deck (arrow keys / fullscreen) | **READY** |
| **PowerPoint Deck** | [`Sanjeevani_Lekh_Presentation.pptx`](../Sanjeevani_Lekh_Presentation.pptx) | Native 16:9 widescreen PowerPoint presentation | **READY** |
| **FastAPI Swagger API** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive API exploration if requested | **READY & LIVE** |

---

## 2. What is NOT Required (What to Skip / Avoid)

When presenting to a panel, time is strictly limited (typically 3 to 7 minutes). Showing low-value, speculative, or fragile components weakens the pitch.

### ❌ Do NOT Show or Spend Time On:
1. **The Cloud Next.js Dashboard (`dashboard/` folder):**
   - **Why skip:** The entire USP of Sanjeevani Lekh is **100% Offline Edge Independence**. The Next.js dashboard is a secondary cloud prototype requiring Supabase cloud credentials and internet. Relying on it during a live demo invites WiFi dropouts and dilutes the edge message.
   - **What to say instead:** *"All verification and audit chain tracking happen natively on-device. When an ambulance eventually reaches hospital Wi-Fi, optional cloud synchronization occurs in the background."*
2. **Raw Code Walkthroughs:**
   - **Why skip:** Panels judge Clinical Impact, Innovation, System Architecture, and Live Working Software. Do not open files to explain FastAPI route decorators or CSS styling unless explicitly interrogated by a technical panelist.
3. **Terminal Downloads or Model Compilation:**
   - **Why skip:** Never run model pulls (`ollama pull`) or CMake builds during a presentation. Everything is pre-built, cached, and runs with instant deterministic fallbacks.
4. **Speculative Hardware Claims:**
   - **Why skip:** Do not claim that you have built physical hardware connections to defibrillators (e.g. Zoll/LIFEPAK cables). Keep telemetry integrations strictly on Slide 12 under the **"Future Roadmap"**.
5. **Reading Slides Verbatim:**
   - **Why skip:** Slides should take no more than **2 to 3 minutes**. Spend the remaining time showing the **Live Working App**!

---

## 3. High-Impact 5-Minute Pitch Script

### ⏱️ Minute 1: The Emergency Crisis (Hook the Panel)
- *"Good morning/afternoon, esteemed panel members. Imagine a moving ambulance racing at 80 km/h with sirens blaring. A paramedic is resuscitating a patient suffering an acute heart attack.*
- *Paramedics do not have time to sit down, log into hospital software, and click through drop-down menus. Instead, notes end up hastily scribbled on **nitrile gloves**, strips of medical tape, or in memory.*
- *This results in a 68% information loss during hospital handover, leading to catastrophic medication duplication in the ER. **Sanjeevani Lekh** solves this with an air-gapped, zero-cloud edge AI ensemble."*

### ⏱️ Minute 2: The Multi-Model Edge AI Architecture (Slide 4 or `/docs`)
- Show Slide 4 in [`PRESENTATION.html`](../PRESENTATION.html) or navigate to `/docs`:
- *"Rather than sending sensitive patient data to cloud APIs like GPT-4—which fail in ambulance dead zones and violate patient data privacy—we deploy an on-device multi-model ensemble:*
  1. ***whisper.cpp (Apple Metal GPU):*** *Sub-second voice dictation conditioned on 60+ emergency pharmaceuticals.*
  2. ***Microsoft TrOCR:*** *Vision Transformer that reads messy handwriting directly off paramedic nitrile gloves.*
  3. ***Local Medical LLM:*** *Enforces strict FHIR-lite schemas (`MedicationAdministration` & `Procedure`).*
  4. ***Harvard n2c2 BERT & MIMIC-III Bio_ClinicalBERT:*** *Independent clinical safety models that detect omitted treatments and compute 768-dim semantic representations.*
  5. ***Tamper-Evident SHA-256 Ledger:*** *Cryptographic audit chain with immutable SQLite append triggers."*

### ⏱️ Minute 3-4: The Live Working Demo (The Climax)
Open [http://localhost:5173/app](http://localhost:5173/app):

1. **Step A: Capture**
   - Tap **"Cardiac STEMI"** Preset:
     > *"14:32 gave aspirin 324 mg PO chewed, IV 18 gauge left AC. 14:38 nitro point four under the tongue."*
   - Tap **"Extract & Review Clinical Draft"**.
   - Show how it completes in milliseconds on-device.

2. **Step B: Review & Zero-Guessing Verification**
   - Point out the **Side-by-Side Highlight**: Hovering over *"Aspirin 324 mg"* highlights the exact source words in the transcript.
   - Point out the **Clinical Safety Flag**:
     > *Notice the amber warning on Nitroglycerin: 'Unit inferred'. The paramedic did not explicitly say 'mg', so the system refuses to guess silently.*
   - Point out that **"CONFIRM RECORD" is locked** until the paramedic actively accepts or fixes the flag.
   - Click **"Accept"** on the flag. Notice the lock unlocks and turns green.

3. **Step C: Cryptographic Seal & Handover Document**
   - Click **"Confirm & Sign Record"** (signed as `Medic-07`).
   - Click **"View Handover Report"**: Show the clean, printable hospital handover transfer document with timestamps, clinical indications, and SHA-256 hash.
   - Click **"Audit Ledger"**: Show the blockchain-style ledger. Point out the green badge: **"Valid (SHA-256 chain intact)"** proving tamper-evidence.

### ⏱️ Minute 5: Value Proposition & Wrap-Up
- *"To conclude: Sanjeevani Lekh is 100% offline, zero cloud subscription costs, completely HIPAA-compliant by physics (no packets leave the vehicle), and guarantees clinical accountability. Thank you, and we welcome your questions!"*

---

## 4. Cheat Sheet: Defending Panel Questions

| Expected Question | The Winning Answer |
|---|---|
| **"Why not just call OpenAI GPT-4 via cellular hotspot?"** | *"Ambulances constantly encounter cellular dead zones, basements, and rural corridors where cloud APIs fail completely. Furthermore, streaming patient vitals to commercial US cloud APIs creates severe HIPAA compliance and data sovereignty liabilities. Our system works 100% air-gapped on standard laptop hardware."* |
| **"How do you ensure the LLM doesn't hallucinate medications?"** | *"We employ a 3-tier safety net: First, strict JSON schema validation. Second, our source-text verification algorithm checks that every extracted number and drug name appeared verbatim in the original note. Third, a fine-tuned Harvard n2c2 token classifier cross-checks clinical concepts and alerts the paramedic if a treatment was mentioned but omitted."* |
| **"Can a paramedic alter the record after an adverse patient event?"** | *"No. The underlying SQLite database uses hard C-level trigger constraints and SHA-256 cryptographic hash-chaining. Any attempt to update, delete, or re-order a row immediately breaks the hash chain, permanently exposing the tampering on the Audit Ledger."* |
| **"How fast does it run?"** | *"Voice transcription completes in under 1 second using whisper.cpp with Metal acceleration. Clinical entity extraction and n2c2 cross-checking run in under 20 milliseconds on Apple Silicon, providing instantaneous feedback to the paramedic."* |
