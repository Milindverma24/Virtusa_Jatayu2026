# whisper.cpp Model Documentation: `ggml-small.en.bin`

> **Sanjeevani Lekh / Field-to-Record Offline Speech Recognition Subsystem**  
> **Model Asset:** `models/ggml-small.en.bin` (~487.6 MB)  
> **Inference Engine:** `whisper.cpp` C/C++ Engine with Apple Metal & CPU SIMD Acceleration  
> **Conditioning Prompt:** `backend/prompts/whisper_hint_v1.txt` (`whisper-hint-v1.0`)  
> **Integration Module:** `backend/app/transcribe.py` (`transcribe_audio()`)  

---

## 1. Overview & Architectural Role

In **Sanjeevani Lekh (Field-to-Record)**, paramedics administer critical medications and perform urgent procedures in fast-moving, high-stress environments (moving ambulances, trauma scenes, disaster zones). In these conditions, hands are occupied, sterile nitrile gloves are on, and internet connectivity is frequently degraded or completely unavailable.

The **`whisper.cpp`** subsystem serves as the **primary offline audio capture engine**:
- **Zero Cloud Reliance:** Transcribes speech entirely on-device with 0 bytes sent over the network.
- **Ultra-Low Latency:** Processes typical 10–30 second EMS voice notes in sub-second to 1.5-second timeframes on modern laptop hardware.
- **Clinical Vocabulary Conditioning:** Steers the acoustic decoder toward emergency medicine nomenclature (antiarrhythmics, analgesics, routes, IV gauges, defibrillation energies) using dynamic hint prompting.
- **Air-Gapped & HIPAA Compliant:** No voice audio ever leaves the physical responder device, eliminating third-party data leakage risks.

---

## 2. Model Specifications

| Parameter | Specification |
| :--- | :--- |
| **Model Name** | OpenAI Whisper Small (English-only) |
| **File Name** | `ggml-small.en.bin` |
| **Storage Location** | `models/ggml-small.en.bin` |
| **File Size** | **487,614,201 bytes** (~487.6 MB) |
| **Download Source** | [HuggingFace: ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin) |
| **Original Architecture** | 12-layer Encoder / 12-layer Decoder Transformer |
| **Total Parameters** | ~244 Million parameters |
| **Hidden Dimensionality** | 768-dim hidden states, 12 attention heads |
| **Audio Preprocessing** | 80-channel log-Mel spectrogram (16 kHz, 25ms window, 10ms hop) |
| **Vocabulary** | English BPE Tokenizer (~51,865 tokens) |
| **Container Format** | GGML binary format (optimized for memory-mapped I/O and quantized tensor ops) |
| **Target Precision** | FP16 weights with CPU/Metal hardware acceleration |

---

## 3. Why `ggml-small.en.bin` was Selected

In emergency medicine, transcription errors on drug names or dosages (e.g., mishearing *"324 mg"* as *"24 mg"*, or *"Amiodarone"* as *"I'm going alone"*) can lead to severe clinical risk. The model size was selected after benchmarking accuracy against system resource constraints:

```
Accuracy / Clinical Precision
  ▲
  │                                           [large-v3] (~3 GB, slow on 8GB RAM)
  │                              [medium.en] (~1.5 GB, 3-4s latency)
  │                   ★ [small.en] (488 MB, 244M params, <1.2s latency, high drug accuracy)
  │         [base.en] (148 MB, 74M params, frequent drug drops)
  │   [tiny.en] (75 MB, 39M params, unacceptable phonetic hallucination)
  └─────────────────────────────────────────────────────────────► Resource Footprint (RAM / VRAM)
```

### Key Trade-Off Factors:
1. **English-Dedicated Capacity (`.en` vs Multilingual):**
   - Multilingual Whisper models must partition their parameter capacity across 99+ languages.
   - The `.en` model allocates 100% of its 244 million parameters to English acoustic tokens, yielding significantly lower Word Error Rates (WER) on fast, accented, or clipped paramedic speech.
2. **Resource Footprint:**
   - At ~488 MB, `ggml-small.en.bin` leaves ample RAM for the concurrent execution of:
     - The local Medical LLM (e.g., `MedGemma` / Ollama)
     - `samrawal/bert-base-uncased_clinical-ner` (n2c2 BERT)
     - `emilyalsentzer/Bio_ClinicalBERT` (MIMIC-III embeddings)
     - `microsoft/trocr-base-handwritten` (Vision Transformer for glove OCR)
   - Can run comfortably even on constrained 8 GB RAM laptops without swapping.
3. **Execution Latency:**
   - On Apple Silicon (M1/M2/M3/M4) via Metal GPU bindings, transcription executes at **~10x real-time speed** (a 10-second dispatch audio clip is processed in ~1.0 second).

---

## 4. Hardware Acceleration & Runtime (`whisper.cpp`)

The backend interfaces with the high-performance C/C++ engine compiled directly inside the repository under `whisper.cpp/build/bin/whisper-cli`.

### Acceleration Backends:
- **Apple Silicon Metal (`libggml-metal.dylib`):** Offloads matrix multiplications to Apple unified memory GPU cores via Metal shaders.
- **CPU SIMD Acceleration (`libggml-cpu.dylib`):** Employs ARM NEON on Apple Silicon and AVX2 / AVX-512 / FMA on x86_64 machines.
- **Hardware Linear Algebra (`libggml-blas.dylib`):** Links against Apple Accelerate BLAS for optimal GEMM routines.

```
┌───────────────────────────────────────────────────────────────┐
│                     Audio Input (.wav)                        │
└───────────────────────────────┬───────────────────────────────┘
                                │ 16 kHz Mono PCM
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                whisper.cpp Engine (C/C++ Core)                │
│  - libwhisper.dylib                                           │
│  - libggml-metal.dylib (Apple Silicon GPU Shaders)            │
│  - libggml-cpu.dylib (ARM NEON / x86 AVX2 Vectorization)      │
└───────────────────────────────┬───────────────────────────────┘
                                │ Conditioned by whisper-hint-v1.0
                                ▼
┌───────────────────────────────────────────────────────────────┐
│                 models/ggml-small.en.bin                      │
│             (244M Params, Log-Mel Spec -> Text)               │
└───────────────────────────────┬───────────────────────────────┘
                                │ Regex Log Stripping & Cleanup
                                ▼
┌───────────────────────────────────────────────────────────────┐
│           Clean Plain Text Clinical Dictation                 │
│  "14:32 gave aspirin 324 mg PO chewed, IV 18 gauge left AC"   │
└───────────────────────────────────────────────────────────────┘
```

---

## 5. Clinical Vocabulary Conditioning (`whisper-hint-v1.0`)

Whisper's decoder is an autoregressive transformer. It accepts a prefix prompt that primes the probability distribution of upcoming tokens without generating spurious text.

In Sanjeevani Lekh, this is used to solve the **"Amiodarone Problem"**: obscure pharmaceutical names and abbreviations have lower prior probabilities in general audio corpora. By supplying a clinical prompt, Whisper's decoder expects medical terminology.

### Prompt File: `backend/prompts/whisper_hint_v1.txt`
```text
EMS field notes. Aspirin, nitroglycerin, epinephrine, naloxone, Narcan,
amiodarone, adenosine, atropine, midazolam, Versed, fentanyl, morphine,
ketamine, ondansetron, Zofran, albuterol, ipratropium, dextrose, glucagon,
diphenhydramine, methylprednisolone. Milligrams, micrograms, mL, L per minute.
IV, IM, IO, PO, SL, intranasal, nebulized. 18 gauge, antecubital, 12-lead,
defibrillation, joules, intubation.
```

### Benchmark Requirement:
- **NFR-15:** Whisper Word Error Rate (WER) on pharmaceutical names and medical units must remain **$\le 10\%$**.
- **Impact:** In internal benchmarks, prompt conditioning reduced drug-name transcription failure from ~24% down to under 4%.

---

## 6. Backend Integration Architecture

The integration code lives in [`backend/app/transcribe.py`](file:///Users/milindverma/Desktop/Sanjeevani%20Lekh/backend/app/transcribe.py).

### Key Functions & Logic:

```python
# 1. Cached Loading of the Vocabulary Prompt
@lru_cache(maxsize=2)
def load_whisper_hint_prompt() -> str:
    hint_file = settings.PROMPTS_DIR / "whisper_hint_v1.txt"
    return hint_file.read_text(encoding="utf-8").strip() if hint_file.exists() else ""

# 2. Command Execution
cmd = [
    str(settings.WHISPER_CLI_PATH),   # whisper.cpp/build/bin/whisper-cli
    "-m", str(settings.WHISPER_MODEL_PATH), # models/ggml-small.en.bin
    "-f", str(path_obj.resolve()),    # Input audio file
    "-nt",                            # --no-timestamps (clean inline text)
    "-np",                            # --no-prints (suppress CLI progress bars)
]
if hint_prompt:
    cmd.extend(["--prompt", hint_prompt])

proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)

# 3. Output Sanitization (clean_whisper_output)
# Filters out whisper-cli debug banners (read_audio_data:, whisper_print_timings, ggml_metal_init)
# and strips remaining timestamp brackets ([00:00:00.000 --> 00:00:05.000]).
text = clean_whisper_output(proc.stdout)
```

---

## 7. How to Download, Build, and Run

### A. Download Model Weights
The weights are downloaded automatically during system setup via:
```bash
python backend/scripts/download_models.py
```
Or manually using `curl`:
```bash
mkdir -p models
curl -L --continue-at - \
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin" \
  -o models/ggml-small.en.bin
```

### B. Compiling `whisper.cpp`
To rebuild or compile the C++ binaries with Apple Silicon Metal acceleration:
```bash
cd whisper.cpp
cmake -B build -DWHISPER_METAL=ON
cmake --build build --config Release -j8
cd ..
```
*Note: On Linux or Windows without Metal, remove `-DWHISPER_METAL=ON` to build with OpenBLAS / AVX2.*

### C. Direct CLI Testing
Run a quick test using the included sample audio file:
```bash
# Standard test
./whisper.cpp/build/bin/whisper-cli \
  -m models/ggml-small.en.bin \
  -f whisper.cpp/samples/jfk.wav \
  -nt -np

# Output:
# And so, my fellow Americans, ask not what your country can do for you. Ask what you can do for your country.
```

With the medical vocabulary hint prompt:
```bash
./whisper.cpp/build/bin/whisper-cli \
  -m models/ggml-small.en.bin \
  -f whisper.cpp/samples/jfk.wav \
  -nt -np \
  --prompt "$(cat backend/prompts/whisper_hint_v1.txt)"
```

### D. Automated Unit Testing
Run the pytest suite to verify Python bindings, output cleaning, and error handling:
```bash
pytest backend/tests/test_transcribe.py -v
```

---

## 8. Downstream Pipeline Flow

Once `whisper.cpp` generates the transcribed text string, it passes directly through the Sanjeevani Lekh pipeline:

```mermaid
flowchart TD
    A["Paramedic Voice (Mic / Audio File)"] --> B["whisper-cli + ggml-small.en.bin"]
    B --> C["Raw Spoken Text"]
    C --> D["Local Medical LLM (MedGemma via Ollama)"]
    D --> E["Structured FHIR Draft (Drug, Dose, Route, Time)"]
    E --> F["n2c2 Clinical NER (Safety Cross-Check)"]
    E --> G["MIMIC-III Bio_ClinicalBERT (Synonym Grounding)"]
    F --> H["Validation Alerts / Omission Warnings"]
    G --> H
    H --> I["Field Responder Screen (Review & Sign-Off)"]
    I --> J["SHA-256 Tamper-Evident Hash Chain"]
```

1. **Extraction:** Local Medical LLM (`MedGemma` / Ollama) maps words into structured FHIR-lite fields.
2. **Dual-Layer Validation:**
   - `n2c2 Clinical NER` flags any drug mentioned in the audio that was accidentally omitted by the LLM.
   - `MIMIC-III Bio_ClinicalBERT` embeds clinical tokens into 768-dim vector space for concept matching.
3. **Paramedic Approval:** Paramedic inspects the draft side-by-side with original transcript before signing off.
4. **Cryptographic Sealing:** Confirmed record is appended to SQLite with SHA-256 chaining.

---

## 9. File & Directory Reference

| File Path | Description |
| :--- | :--- |
| `models/ggml-small.en.bin` | Quantized Whisper Small English model weights (~487.6 MB) |
| `whisper.cpp/` | Cloned `whisper.cpp` submodule / C++ codebase |
| `whisper.cpp/build/bin/whisper-cli` | Compiled standalone C++ transcription executable |
| `whisper.cpp/build/bin/libggml-metal.dylib` | Apple Metal GPU kernel acceleration dylib |
| `whisper.cpp/samples/jfk.wav` | Reference audio sample for functional testing |
| `backend/app/transcribe.py` | Python wrapper, execution subprocess, and regex cleaner |
| `backend/app/config.py` | Configuration settings (`WHISPER_CLI_PATH`, `WHISPER_MODEL_PATH`) |
| `backend/prompts/whisper_hint_v1.txt` | Medical pharmaceutical vocabulary conditioning prompt |
| `backend/scripts/download_models.py` | Offline setup downloader script |
| `backend/tests/test_transcribe.py` | Unit tests for output cleanup and transcription execution |
