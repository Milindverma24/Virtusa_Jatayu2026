import React, { useEffect, useState } from 'react';
import Logo from '../components/Logo';
import './docs.css';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pipeline', label: 'From note to record' },
  { id: 'hash-chain', label: 'Audit chain' },
  { id: 'sync', label: 'Cloud sync' },
  { id: 'api', label: 'API' },
  { id: 'run', label: 'Run it' },
  { id: 'limits', label: 'Limits' },
];

const STEPS = [
  {
    name: 'Capture',
    body: 'Voice is sent to POST /draft/voice, typed text to /draft/text, and a photo to /draft/image. Audio and image files are deleted from disk after processing.',
    detail: 'Voice, online: Groq Whisper (GROQ_WHISPER_MODEL). Voice, offline or on failure: whisper.cpp when its binary and the ggml-small.en model are present, otherwise a local Whisper pipeline (openai/whisper-tiny.en). Photo: always local, TrOCR (microsoft/trocr-base-handwritten) with EasyOCR; lines below the confidence threshold are reported back as low confidence.',
  },
  {
    name: 'Extract',
    body: 'A language model reads the note and returns medications and procedures as JSON that must match a fixed schema. Temperature is 0, with one retry if the output does not validate.',
    detail: 'Online: Groq (GROQ_LLM_MODEL). Offline, or if Groq fails: a local Ollama model (LLM_MODEL, default qwen3:8b). If Ollama cannot be reached either, a rule-based extractor is used so a draft is still produced. The review screen shows which engine handled the note.',
  },
  {
    name: 'Validate',
    body: 'Plain Python rules, no AI. Every extracted value must be traceable to words in the original note, or it is flagged instead of guessed.',
    detail: 'Flags: source_text_not_found, missing_dose, missing_unit, unit_inferred, missing_route, missing_time, unknown_drug, dose_out_of_range, spoken_correction, duplicate_item. Drug names, units, routes and dose ranges are checked against a 17-drug reference list (backend/data/drug_reference.json).',
  },
  {
    name: 'Cross-check',
    body: 'Optional. A clinical NER model (samrawal/bert-base-uncased_clinical-ner) tags treatments, problems and tests in the note. A treatment it finds that was not extracted raises an info flag.',
    detail: 'Controlled by ENABLE_CLINICAL_NER. It needs torch and transformers installed; if the model cannot load, this step is skipped.',
  },
  {
    name: 'Confirm',
    body: 'The responder reviews the draft. Items with a review flag must be accepted or removed, and a responder ID is required, before the record can be confirmed.',
    detail: 'POST /confirm rejects an empty reviewed_by. Corrections are appended as new records that point to the one they correct (POST /correct/{record_id}).',
  },
  {
    name: 'Seal',
    body: 'The confirmed record is appended to the SQLite audit_log with a SHA-256 hash that includes the previous record’s hash.',
    detail: 'See the audit chain below.',
  },
];

const ENDPOINTS = [
  ['GET', '/health', 'Database, Ollama and model status'],
  ['POST', '/draft/text', 'Typed note to draft'],
  ['POST', '/draft/voice', 'Audio file to draft'],
  ['POST', '/draft/image', 'Photo to draft'],
  ['POST', '/draft/reextract', 'Re-run extraction on edited text'],
  ['POST', '/confirm', 'Append a confirmed record to the chain'],
  ['POST', '/correct/{record_id}', 'Append a correction linked to a record'],
  ['GET', '/audit/verify', 'Re-check every hash in the chain'],
  ['GET', '/encounters', 'List encounters'],
  ['GET', '/encounters/{id}', 'Records for one encounter'],
  ['GET', '/encounters/{id}/report', 'Handover report as HTML'],
  ['GET', '/encounters/{id}/report.pdf', 'Handover report as PDF'],
  ['POST', '/extract', 'Extraction only, no validation'],
  ['POST', '/sync', 'Push unsynced records to Supabase'],
  ['POST', '/clinical-ner/entities', 'Treatments, problems and tests in a text'],
  ['POST', '/clinical-ner/embedding', 'Bio_ClinicalBERT embedding of a text'],
];

export default function DocsPage({ onOpenApp, onBackToLanding }) {
  const [active, setActive] = useState('overview');

  // Highlight the section being read and honour #hash links
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-20% 0px -70% 0px' });
    els.forEach((el) => io.observe(el));
    const hash = window.location.hash.slice(1);
    if (hash) document.getElementById(hash)?.scrollIntoView();
    return () => io.disconnect();
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="dx">
      <nav className="dx-top" aria-label="Documentation">
        <div className="dx-top-in">
          <button type="button" className="dx-brand" onClick={onBackToLanding} title="Back to the home page">
            <Logo size={30} />
            <b>संजीवनी लेख</b>
            <span>SANJEEVANI LEKH</span>
          </button>
          <div className="dx-top-right">
            <button type="button" className="dx-link" onClick={onBackToLanding}>Home</button>
            <button type="button" className="dx-btn" onClick={() => onOpenApp && onOpenApp('/app')}>Open the app</button>
          </div>
        </div>
      </nav>

      <div className="dx-wrap">
        <aside className="dx-toc" aria-label="On this page">
          <div className="dx-label">On this page</div>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''} onClick={go(s.id)}>{s.label}</a>
          ))}
        </aside>

        <main className="dx-main">
          <header className="dx-head">
            <div className="dx-label">Documentation</div>
            <h1>How Sanjeevani Lekh works</h1>
          </header>

          <section id="overview">
            <h2>Overview</h2>
            <p>
              Sanjeevani Lekh turns a paramedic’s spoken, typed or photographed notes into a structured record of
              medications and procedures. The responder confirms each record, and it is stored in a tamper-evident
              log. It has two modes. Offline, everything runs on the device that hosts the backend. Online, notes and
              audio are processed by Groq, and the backend falls back to the local models if the cloud call fails.
            </p>
            <p className="dx-detail">
              Switch modes with the ONLINE / OFFLINE control in the app’s top bar. Without a <code>GROQ_API_KEY</code>,
              the backend always runs offline. Setting <code>PROCESSING_MODE=offline</code> in <code>backend/.env</code> makes
              offline the default.
            </p>
            <div className="dx-grid">
              <div><span className="dx-label">Backend</span>Python, FastAPI, SQLite</div>
              <div><span className="dx-label">Responder app</span>React and Vite, served by the backend</div>
              <div><span className="dx-label">Supervisor view</span>Next.js, reads from Supabase (optional)</div>
              <div><span className="dx-label">Output</span>FHIR-lite MedicationAdministration and Procedure</div>
            </div>
          </section>

          <section id="pipeline">
            <h2>From note to record</h2>
            <ol className="dx-steps">
              {STEPS.map((s) => (
                <li key={s.name}>
                  <h3>{s.name}</h3>
                  <p>{s.body}</p>
                  <p className="dx-detail">{s.detail}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="hash-chain">
            <h2>Audit chain</h2>
            <p>
              Each row’s hash is the SHA-256 of a canonical JSON of its fields (record ID, encounter ID, timestamp,
              input type, raw text, record JSON, model name, prompt version, reviewer, the record it corrects) together
              with the previous row’s hash. The first row uses <code>GENESIS</code> as its previous hash.
            </p>
            <p>
              SQLite triggers abort any UPDATE to a content column and any DELETE. The only column that can change
              is <code>synced</code>. <code>GET /audit/verify</code> recomputes every hash and reports the first row
              that does not match.
            </p>
            <p className="dx-detail">
              This makes tampering detectable, not impossible: someone with direct file access could rewrite the whole
              chain, so the hash of the latest record is only as trustworthy as where it is kept.
            </p>
          </section>

          <section id="sync">
            <h2>Cloud sync</h2>
            <p>
              Optional. With <code>SUPABASE_URL</code> and <code>SUPABASE_KEY</code> set, <code>POST /sync</code> sends
              records where <code>synced = 0</code> to the Supabase <code>audit_log</code> table and then marks them
              synced. Rows are keyed by device ID and record ID with merge-duplicates, so retrying does not create
              copies. The schema is in <code>dashboard/supabase_schema.sql</code>.
            </p>
            <p>
              The dashboard is read-only. Without Supabase credentials it shows built-in sample data and says so in
              its header.
            </p>
          </section>

          <section id="api">
            <h2>API</h2>
            <p>The backend serves an interactive reference at <code>/api/docs</code>.</p>
            <div className="dx-table" role="table">
              {ENDPOINTS.map(([m, p, d]) => (
                <div className="dx-row" role="row" key={m + p}>
                  <span className={`dx-method ${m === 'GET' ? 'get' : 'post'}`}>{m}</span>
                  <code>{p}</code>
                  <span className="dx-desc">{d}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="run">
            <h2>Run it</h2>
            <pre className="dx-code">{`# backend
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# responder app (build once; the backend serves it)
cd local-ui && npm install && npm run build

# supervisor dashboard (optional)
cd dashboard && npm install && npm run dev`}</pre>
            <p>
              Settings are read from <code>backend/.env</code> (see <code>.env.example</code>): <code>LLM_MODEL</code>,{' '}
              <code>OLLAMA_BASE_URL</code>, <code>GROQ_API_KEY</code>, <code>PROCESSING_MODE</code>,{' '}
              <code>ENABLE_CLINICAL_NER</code>, <code>SUPABASE_URL</code>, <code>SUPABASE_KEY</code>. Offline LLM
              extraction needs an Ollama server with the chosen model.
            </p>
          </section>

          <section id="limits">
            <h2>Limits</h2>
            <ul className="dx-list">
              <li>This is a research and portfolio project and not a medical device. A responder must confirm every record.</li>
              <li>
                In online mode the note text and recorded audio are sent to Groq, a third-party service. Use offline
                mode, or only synthetic data, wherever that is not acceptable.
              </li>
              <li>The drug reference covers 17 drugs. Anything else is flagged as unknown and needs review.</li>
              <li>
                The live transcript shown while recording uses the browser’s speech recognition where the browser
                provides it, and some browsers send that audio to the vendor’s service. The record itself is built
                from the backend’s transcription of the recorded audio.
              </li>
              <li>Without Ollama, extraction falls back to simple rules, which are less capable than the LLM.</li>
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
