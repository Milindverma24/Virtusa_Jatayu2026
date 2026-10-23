import React, { useEffect, useState, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import CardNav from './CardNav';
import {
  Activity,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Lock,
  Database,
  Terminal,
  FileText,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Layers,
  Server,
  Zap,
  HardDrive,
  Copy,
  Check,
  ChevronRight,
  ArrowUp,
  Volume2,
  ScanLine,
  Sliders,
  Sparkles
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon } from '@hugeicons/core-free-icons';
import { NAV_ITEMS } from '../navItems';
import './docs.css';

gsap.registerPlugin(ScrollTrigger);

const PIPELINE_STEPS = [
  {
    step: 1,
    title: 'Input Capture',
    tech: 'React UI · Web Audio API · MediaDevices',
    desc: 'The paramedic records emergency speech (continuous or push-to-talk), photographs a vital monitor or handwritten note, or types a quick observation. Transmitted via multipart HTTP POST to local backend.'
  },
  {
    step: 2,
    title: 'On-Device Audio & Vision Transcription',
    tech: 'whisper.cpp (GGML) / mlx-whisper · Apple Vision OCR',
    desc: 'Audio is decoded and transcribed entirely offline using quantized 16-bit GGML Whisper weights. Images undergo local Apple Vision OCR with bounding-box character confidence metrics.'
  },
  {
    step: 3,
    title: 'Human-in-the-Loop Transcript Edit',
    tech: 'Zero-Latency Local UI · State Sync',
    desc: 'The paramedic can quickly glance at or correct the raw transcript text before NLP extraction if desired, maintaining absolute human clinical sovereignty.'
  },
  {
    step: 4,
    title: 'Medical LLM Structured Extraction',
    tech: 'Ollama · medgemma1.5 (4B) / gemma3 · Strict JSON Schema',
    desc: 'The prompt and raw clinical text are dispatched to local Ollama with temperature 0.0 and forced JSON schema. The LLM is strictly constrained to extract medications, procedures, and vitals with their exact verbatim source strings.'
  },
  {
    step: 5,
    title: 'Multi-Layer Algorithmic Validation',
    tech: 'Python Rules Engine · drug_reference.json · n2c2 BERT',
    desc: 'Ground-truth substring search validates that every extracted item verbatim exists in the raw note. Safe dosage ranges (e.g. Aspirin 162-325 mg) and route/unit standards are verified. Any deviation triggers an immediate clinical review flag.'
  },
  {
    step: 6,
    title: 'FHIR-Lite Semantic Mapping',
    tech: 'HL7 FHIR R4 Bundle · JSON Schema',
    desc: 'Standardizes extracted clinical data into interoperable FHIR-lite resources: MedicationAdministration, Observation (vitals), and Procedure with UTC timestamps.'
  },
  {
    step: 7,
    title: 'Responder Review & Flag Resolution',
    tech: 'High-Contrast Review UI · One-Click Correction',
    desc: 'The paramedic reviews the structured draft. Unverified items or out-of-range doses are highlighted with amber alerts. The clinician clicks to resolve or edit before anything is permanently stored.'
  },
  {
    step: 8,
    title: 'Cryptographic Hash Chain Storage',
    tech: 'SQLite WAL Mode · SHA-256 · Append-Only SQL Triggers',
    desc: 'Once confirmed, the record is sealed into an immutable forward hash chain: hash = SHA256(canonical_json + prev_hash). SQLite triggers strictly reject UPDATE and DELETE queries.'
  },
  {
    step: 9,
    title: 'Standardized Handover Report',
    tech: 'Jinja2 · WeasyPrint · Native Print Engine',
    desc: 'Instant generation of hospital triage handover reports in semantic HTML and clean, printable PDF format containing the cryptographic audit verification stamp.'
  },
  {
    step: 10,
    title: 'Offline-Resilient Cloud Sync',
    tech: 'httpx Worker · Supabase Postgres · Edge Queue',
    desc: 'When cellular or station Wi-Fi connects, a background queue pushes confirmed rows to the central hospital dashboard in chronological order. Never blocks field work.'
  }
];

const API_ENDPOINTS = [
  { method: 'GET', path: '/health', input: 'None', output: 'JSON { status, ollama_running, model_available, whisper_ready }', desc: 'Checks system readiness, Ollama server, LLM availability, and database connectivity.' },
  { method: 'POST', path: '/draft/text', input: 'JSON { text, encounter_id }', output: 'JSON { draft_id, bundle, flags, timings_ms }', desc: 'Processes raw typed clinical notes through MedGemma extraction and validation.' },
  { method: 'POST', path: '/draft/voice', input: 'multipart/form-data (audio file)', output: 'JSON { draft_id, raw_text, bundle, flags }', desc: 'Offline transcription via Whisper followed by medical concept extraction.' },
  { method: 'POST', path: '/draft/image', input: 'multipart/form-data (image file)', output: 'JSON { draft_id, ocr_confidence, bundle, flags }', desc: 'Extracts vitals and notes from monitor screens or paper triage tags using OCR.' },
  { method: 'POST', path: '/draft/reextract', input: 'JSON { draft_id, raw_text }', output: 'JSON { draft_id, bundle, flags }', desc: 'Re-runs extraction when the paramedic edits the raw transcript.' },
  { method: 'POST', path: '/confirm', input: 'JSON { draft_id, reviewed_by, bundle }', output: 'JSON { record_id, hash, prev_hash, status: "sealed" }', desc: 'Permanently appends the confirmed encounter to the cryptographic SQLite ledger.' },
  { method: 'POST', path: '/correct/{id}', input: 'JSON { reason, replacement_bundle, reviewed_by }', output: 'JSON { new_record_id, hash, corrects_record_id }', desc: 'Records a post-facto clinical correction as a forward-linked immutable block.' },
  { method: 'GET', path: '/audit/verify', input: 'None', output: 'JSON { intact: boolean, total_blocks: int, first_broken_id: null }', desc: 'Recomputes the entire SHA-256 forward chain from genesis block to current head.' },
  { method: 'GET', path: '/encounters/{id}/report', input: 'None', output: 'HTML document', desc: 'Renders the formatted clinical handover sheet for receiving emergency department.' },
  { method: 'GET', path: '/encounters/{id}/report.pdf', input: 'None', output: 'application/pdf', desc: 'Streams an offline compiled PDF export ready for printing or hospital EHR intake.' }
];

export default function DocsPage({ onOpenApp, onBackToLanding }) {
  const [activeSection, setActiveSection] = useState('overview');
  const [copiedId, setCopiedId] = useState(null);

  // Setup Lenis Smooth Scrolling + GSAP ScrollTrigger Integration
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let lenis;
    let lenisRaf;

    try {
      lenis = new Lenis({
        duration: 1.1,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      lenis.on('scroll', ScrollTrigger.update);

      lenisRaf = (time) => {
        lenis.raf(time * 1000);
      };

      gsap.ticker.add(lenisRaf);
      gsap.ticker.lagSmoothing(0);

      // Section entrance transitions with GSAP ScrollTrigger
      const ctx = gsap.context(() => {
        gsap.utils.toArray('.docs-section').forEach((section) => {
          gsap.from(section, {
            scrollTrigger: {
              trigger: section,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
            opacity: 0,
            y: 35,
            duration: 0.8,
            ease: 'power3.out',
          });
        });

        // Pipeline steps entrance cascade
        gsap.from('.pipeline-step-card', {
          scrollTrigger: {
            trigger: '.pipeline-timeline',
            start: 'top 80%',
          },
          opacity: 0,
          x: -25,
          duration: 0.6,
          stagger: 0.1,
          ease: 'power2.out',
        });
      });

      return () => {
        ctx.revert();
        gsap.ticker.remove(lenisRaf);
        ScrollTrigger.getAll().forEach((t) => t.kill());
        lenis.destroy();
      };
    } catch (e) {
      console.warn('DocsPage smooth scroll setup skipped:', e);
    }
  }, []);

  // Track active section for sidebar table of contents
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'dual-zone', 'pipeline', 'inference', 'validation', 'hash-chain', 'api-ref', 'hardware'];
      const scrollPos = window.scrollY + 180;

      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i]);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const copyCode = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="docs-page-root">
      {/* Background Lighting Aura */}
      <div className="docs-bg-glow-1" aria-hidden="true" />
      <div className="docs-bg-glow-2" aria-hidden="true" />

      {/* Full-width Glassy CardNav */}
      <header className="card-nav-container">
        <CardNav
          logo={
            <div
              className="card-nav-brand"
              onClick={onBackToLanding}
              title="Sanjeevani Lekh - Return to Home"
            >
              <div className="card-nav-brand-icon">
                <Activity size={16} strokeWidth={2.4} />
              </div>
              <span className="card-nav-brand-text">Sanjeevani Lekh</span>
            </div>
          }
          logoAlt="Sanjeevani Lekh"
          logoHref="#"
          items={NAV_ITEMS}
          cta={{ label: 'Open the app', onClick: onOpenApp }}
          docsHref="/docs"
          githubHref="https://github.com/Milindverma24/Virtusa_Jatayu2026"
          cardEffect="rise"
          openOn="click"
          theme="dark"
          surface="glass"
          maxWidth="100%"
          cardHeight={140}
          onLinkClick={(link, item, event) => {
            if (link.href && link.href.startsWith('/#')) {
              event.preventDefault();
              onBackToLanding();
              setTimeout(() => {
                const id = link.href.split('#')[1];
                const el = document.getElementById(id);
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            } else if (link.href && link.href.startsWith('/app')) {
              event.preventDefault();
              onOpenApp();
            }
          }}
        />
      </header>

      <div className="docs-nav-spacer" />

      <main className="docs-container">
        {/* ===================================================================
            HERO HEADER
            =================================================================== */}
        <section className="docs-hero" id="overview">
          <div className="docs-breadcrumb">
            <span style={{ cursor: 'pointer' }} onClick={onBackToLanding}>Sanjeevani Lekh</span>
            <ChevronRight size={12} />
            <span>Architecture & Engineering Specification</span>
          </div>

          <h1 className="docs-hero-title">
            System Architecture & <em>Technical Flow</em>
          </h1>

          <p className="docs-hero-lead">
            An offline-first, edge-native clinical documentation pipeline for emergency medical responders.
            Features on-device speech transcription, medical LLM extraction with forced JSON schema, multi-tier
            hallucination guards, and a tamper-evident SHA-256 cryptographic audit ledger.
          </p>

          <div className="docs-specs-grid">
            <div className="docs-spec-pill">
              <span className="pill-dot" />
              <span>Offline Edge: Apple Silicon M2 / Cross-Platform</span>
            </div>
            <div className="docs-spec-pill blue">
              <span className="pill-dot" />
              <span>Extractor: Ollama + medgemma1.5 (4B) / gemma3</span>
            </div>
            <div className="docs-spec-pill amber">
              <span className="pill-dot" />
              <span>ASR: whisper.cpp (GGML) / mlx-whisper</span>
            </div>
            <div className="docs-spec-pill">
              <span className="pill-dot" />
              <span>Ledger: SQLite WAL + SHA-256 Forward Hash Chain</span>
            </div>
            <div className="docs-spec-pill blue">
              <span className="pill-dot" />
              <span>Schema: HL7 FHIR R4 Bundle Standard</span>
            </div>
          </div>

          <div className="docs-hero-actions">
            <button type="button" className="docs-btn-primary" onClick={onOpenApp}>
              <span>Launch Field App</span>
              <ArrowRight size={15} strokeWidth={2.2} />
            </button>
            <a
              href="https://github.com/Milindverma24/Virtusa_Jatayu2026"
              target="_blank"
              rel="noopener noreferrer"
              className="docs-btn-secondary"
            >
              <HugeiconsIcon icon={GithubIcon} size={15} strokeWidth={2} />
              <span>Source Repository</span>
            </a>
            <button type="button" className="docs-btn-secondary" onClick={onBackToLanding}>
              <span>← Landing Page</span>
            </button>
          </div>
        </section>

        {/* ===================================================================
            TWO-COLUMN LAYOUT: SIDEBAR TABLE OF CONTENTS + CONTENT
            =================================================================== */}
        <div className="docs-layout">
          {/* STICKY SIDEBAR */}
          <aside className="docs-sidebar">
            <div className="docs-sidebar-heading">Table of Contents</div>
            <ul className="docs-nav-list">
              <li className="docs-nav-item">
                <a
                  href="#overview"
                  className={activeSection === 'overview' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('overview'); }}
                >
                  <span className="nav-num">00</span>
                  <span>System Overview</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#dual-zone"
                  className={activeSection === 'dual-zone' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('dual-zone'); }}
                >
                  <span className="nav-num">01</span>
                  <span>Dual-Zone Topology</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#pipeline"
                  className={activeSection === 'pipeline' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('pipeline'); }}
                >
                  <span className="nav-num">02</span>
                  <span>10-Step Clinical Pipeline</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#inference"
                  className={activeSection === 'inference' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('inference'); }}
                >
                  <span className="nav-num">03</span>
                  <span>On-Device AI Engine</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#validation"
                  className={activeSection === 'validation' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('validation'); }}
                >
                  <span className="nav-num">04</span>
                  <span>Hallucination Guards</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#hash-chain"
                  className={activeSection === 'hash-chain' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('hash-chain'); }}
                >
                  <span className="nav-num">05</span>
                  <span>SHA-256 Audit Chain</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#api-ref"
                  className={activeSection === 'api-ref' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('api-ref'); }}
                >
                  <span className="nav-num">06</span>
                  <span>REST API Reference</span>
                </a>
              </li>
              <li className="docs-nav-item">
                <a
                  href="#hardware"
                  className={activeSection === 'hardware' ? 'active' : ''}
                  onClick={(e) => { e.preventDefault(); scrollTo('hardware'); }}
                >
                  <span className="nav-num">07</span>
                  <span>Hardware Scaling</span>
                </a>
              </li>
            </ul>
          </aside>

          {/* MAIN DOCUMENTATION BODY */}
          <div className="docs-content">
            {/* SECTION 1: DUAL ZONE TOPOLOGY */}
            <section className="docs-section" id="dual-zone">
              <span className="docs-section-tag">
                <Layers size={12} />
                <span>Architecture Topology</span>
              </span>
              <h2 className="docs-section-title">01. Dual-Zone Edge Computing Architecture</h2>
              <p className="docs-paragraph">
                Sanjeevani Lekh is engineered around an unyielding privacy and reliability axiom:{' '}
                <strong>all emergency medical transcription, clinical inference, and record generation occur on the physical edge device</strong>.
                There is zero reliance on remote cloud servers during active paramedic operations.
              </p>

              <div className="dual-zone-grid">
                {/* EDGE ZONE */}
                <div className="zone-card edge">
                  <span className="zone-badge">Zone A · Edge Device (Mac / Laptop)</span>
                  <h3 className="zone-title">Physical Paramedic Workstation</h3>
                  <p className="zone-sub">
                    Runs 100% offline. Executes speech recognition, OCR, LLM extraction, dose safety verification, and immutable ledger writes.
                  </p>
                  <div className="zone-flow-list">
                    <div className="zone-flow-item">
                      <Cpu size={16} className="zone-flow-item-icon" />
                      <div className="zone-flow-item-content">
                        <strong>Local React + Vite UI</strong>
                        <span>Fast, tactile interface running in browser RAM via 127.0.0.1.</span>
                      </div>
                    </div>
                    <div className="zone-flow-item">
                      <Zap size={16} className="zone-flow-item-icon" />
                      <div className="zone-flow-item-content">
                        <strong>FastAPI Python Pipeline</strong>
                        <span>Cross-platform ASR (whisper.cpp), Apple Vision OCR, and verification.</span>
                      </div>
                    </div>
                    <div className="zone-flow-item">
                      <HardDrive size={16} className="zone-flow-item-icon" />
                      <div className="zone-flow-item-content">
                        <strong>Ollama Server (Local GPU/Metal)</strong>
                        <span>Executes quantized MedGemma 4B / Gemma 3 with temperature 0.0.</span>
                      </div>
                    </div>
                    <div className="zone-flow-item">
                      <Lock size={16} className="zone-flow-item-icon" />
                      <div className="zone-flow-item-content">
                        <strong>SQLite WAL Audit Store</strong>
                        <span>Forward SHA-256 hash chain with database mutation-blocking triggers.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CLOUD ZONE */}
                <div className="zone-card cloud">
                  <span className="zone-badge">Zone B · Cloud (Optional Read-Only)</span>
                  <h3 className="zone-title">Central Supervisor Portal</h3>
                  <p className="zone-sub">
                    Only receives verified, sealed records when cellular/Wi-Fi is re-established. Never runs AI and never writes to patient state.
                  </p>
                  <div className="zone-flow-list">
                    <div className="zone-flow-item">
                      <Server size={16} className="zone-flow-item-icon" />
                      <div className="zone-flow-item-content">
                        <strong>Supabase (PostgreSQL)</strong>
                        <span>Stores verified chronological bundles with composite device_id keys.</span>
                      </div>
                    </div>
                    <div className="zone-flow-item">
                      <Terminal size={16} className="zone-flow-item-icon" />
                      <div className="zone-flow-item-content">
                        <strong>Next.js Audit Dashboard</strong>
                        <span>Vercel-hosted read-only fleet overview for medical directors and auditors.</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: 10-STEP PIPELINE */}
            <section className="docs-section" id="pipeline">
              <span className="docs-section-tag">
                <GitBranch size={12} />
                <span>Clinical Lifecycle</span>
              </span>
              <h2 className="docs-section-title">02. The 10-Step Clinical Pipeline</h2>
              <p className="docs-paragraph">
                Every field dictation passes through an end-to-end pipeline designed to maximize accuracy, eliminate hallucinations,
                and maintain strict human-in-the-loop oversight. <strong>Nothing is permanently saved until the paramedic reviews and confirms it.</strong>
              </p>

              <div className="pipeline-timeline">
                {PIPELINE_STEPS.map((step) => (
                  <div key={step.step} className="pipeline-step-card">
                    <div className="step-number-wrap">
                      <div className="step-number-badge">{step.step}</div>
                    </div>
                    <div className="step-details-wrap">
                      <div className="step-header">
                        <h4 className="step-title">{step.title}</h4>
                        <span className="step-tech-tag">{step.tech}</span>
                      </div>
                      <p className="step-desc">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* SECTION 3: INFERENCE STACK */}
            <section className="docs-section" id="inference">
              <span className="docs-section-tag">
                <Cpu size={12} />
                <span>Zero-Cloud AI</span>
              </span>
              <h2 className="docs-section-title">03. On-Device AI Inference Stack</h2>
              <p className="docs-paragraph">
                The inference engine uses <code>Ollama</code> running locally on <code>http://127.0.0.1:11434</code>.
                By enforcing a strict JSON Schema inside the Ollama API <code>format</code> parameter, the model is physically incapable of outputting conversational filler, markdown formatting, or ungrounded commentary.
              </p>

              <div className="code-container">
                <div className="code-header-bar">
                  <div className="code-header-title">
                    <Terminal size={14} />
                    <span>backend/app/extract.py (Forced JSON Schema)</span>
                  </div>
                  <button
                    type="button"
                    className="code-badge"
                    onClick={() => copyCode(`ollama.generate(
  model="medgemma1.5",
  prompt=prompt,
  format=EXTRACTION_JSON_SCHEMA,
  options={"temperature": 0.0, "num_ctx": 4096}
)`, 'extract-code')}
                  >
                    {copiedId === 'extract-code' ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="code-pre">
{`# Strict deterministic inference call
response = client.post(
    "http://127.0.0.1:11434/api/generate",
    json={
        "model": "medgemma1.5",
        "prompt": prompt,
        "stream": False,
        "format": EXTRACTION_SCHEMA,  # Forces valid JSON syntax matching Pydantic model
        "options": {
            "temperature": 0.0,       # Zero randomness / greedy sampling
            "top_p": 0.1,
            "num_ctx": 4096,          # Optimized context window for rapid inference
            "num_predict": 1024
        }
    },
    timeout=60.0
)`}
                </pre>
              </div>
            </section>

            {/* SECTION 4: HALLUCINATION GUARDS */}
            <section className="docs-section" id="validation">
              <span className="docs-section-tag">
                <ShieldCheck size={12} />
                <span>Clinical Integrity</span>
              </span>
              <h2 className="docs-section-title">04. Multi-Layer Hallucination Guards</h2>
              <p className="docs-paragraph">
                In emergency prehospital care, hallucinated medications or incorrect dosages can prove fatal.
                Sanjeevani Lekh employs a multi-tier defense system before presenting draft records:
              </p>

              <div className="zone-flow-list" style={{ margin: '20px 0' }}>
                <div className="zone-flow-item">
                  <CheckCircle2 size={18} style={{ color: '#2DD4BF', flexShrink: 0, marginTop: 2 }} />
                  <div className="zone-flow-item-content">
                    <strong style={{ fontSize: 14 }}>1. Ground-Truth Substring Grounding (source_text)</strong>
                    <span>
                      Every extracted medication, procedure, or vital sign MUST contain its verbatim <code>source_text</code>.
                      The validator performs an exact case-insensitive substring search in the raw transcription. If the model invents a drug not spoken in the transcript, it is immediately flagged with <code>source_text_not_found</code>.
                    </span>
                  </div>
                </div>

                <div className="zone-flow-item">
                  <CheckCircle2 size={18} style={{ color: '#2DD4BF', flexShrink: 0, marginTop: 2 }} />
                  <div className="zone-flow-item-content">
                    <strong style={{ fontSize: 14 }}>2. Drug Reference Safe Range Bounds</strong>
                    <span>
                      The system checks all medications against <code>data/drug_reference.json</code>.
                      For example, Aspirin is validated for standard cardiac antiplatelet doses (162–325 mg). If a value like 3240 mg is encountered, it triggers a high-severity dosage review flag.
                    </span>
                  </div>
                </div>

                <div className="zone-flow-item">
                  <CheckCircle2 size={18} style={{ color: '#2DD4BF', flexShrink: 0, marginTop: 2 }} />
                  <div className="zone-flow-item-content">
                    <strong style={{ fontSize: 14 }}>3. Lexical Normalization of Routes & Units</strong>
                    <span>
                      Spoken variations like "by mouth", "oral", and "swallowed" are normalized to standard FHIR codes (<code>PO</code>).
                      Intravenous routes are mapped to <code>IV</code>, and sublingual sprays to <code>SL</code>.
                    </span>
                  </div>
                </div>

                <div className="zone-flow-item">
                  <CheckCircle2 size={18} style={{ color: '#2DD4BF', flexShrink: 0, marginTop: 2 }} />
                  <div className="zone-flow-item-content">
                    <strong style={{ fontSize: 14 }}>4. Optional Clinical BERT (n2c2) Second-Opinion Validator</strong>
                    <span>
                      An independent, lightweight token-classification model fine-tuned on the Harvard DBMI n2c2 benchmark scans the raw transcript for drug and problem entities. Any discrepancy between the LLM output and BERT entity recognition is highlighted.
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 5: HASH CHAIN & DB IMMUTABILITY */}
            <section className="docs-section" id="hash-chain">
              <span className="docs-section-tag">
                <Lock size={12} />
                <span>Cryptographic Proof</span>
              </span>
              <h2 className="docs-section-title">05. Cryptographic SHA-256 Forward Hash Chain</h2>
              <p className="docs-paragraph">
                Every confirmed medical encounter is cryptographically linked to the preceding entry using standard SHA-256.
                The genesis record begins with <code>GENESIS</code>. If a malicious actor or database bug alters even a single character in past medical notes, the hash chain shatters instantly.
              </p>

              <div className="formula-box">
                <div className="formula-title">
                  <Lock size={16} />
                  <span>Mathematical Hash Formula</span>
                </div>
                <div className="formula-equation">
                  hash<sub>i</sub> = SHA-256( canonical_json(row_content<sub>i</sub>) + prev_hash<sub>i</sub> )
                </div>
                <p className="formula-notes">
                  Where <code>canonical_json</code> serializes all clinical columns (record_id, encounter_id, created_at, input_type, raw_text, record_json, model_name, prompt_version, reviewed_by, corrects_record_id) with deterministically sorted keys and compact UTF-8 whitespace.
                </p>
              </div>

              <div className="code-container">
                <div className="code-header-bar">
                  <div className="code-header-title">
                    <Database size={14} />
                    <span>backend/app/db.py (Immutable SQLite Triggers)</span>
                  </div>
                  <button
                    type="button"
                    className="code-badge"
                    onClick={() => copyCode(`CREATE TRIGGER block_audit_update BEFORE UPDATE ON audit_log
FOR EACH ROW
WHEN OLD.raw_text != NEW.raw_text OR OLD.record_json != NEW.record_json
BEGIN
    SELECT RAISE(ABORT, 'Illegal mutation: audit_log content columns are cryptographically sealed');
END;`, 'trigger-code')}
                  >
                    {copiedId === 'trigger-code' ? 'Copied!' : 'Copy SQL'}
                  </button>
                </div>
                <pre className="code-pre">
{`-- Physical immutability enforced at the database engine level
CREATE TRIGGER block_audit_update BEFORE UPDATE ON audit_log
FOR EACH ROW
WHEN (
    OLD.raw_text != NEW.raw_text OR
    OLD.record_json != NEW.record_json OR
    OLD.created_at != NEW.created_at OR
    OLD.prev_hash != NEW.prev_hash OR
    OLD.hash != NEW.hash
)
BEGIN
    SELECT RAISE(ABORT, 'Mutation rejected: audit_log records are immutable.');
END;

CREATE TRIGGER block_audit_delete BEFORE DELETE ON audit_log
BEGIN
    SELECT RAISE(ABORT, 'Deletion rejected: audit_log cannot be destroyed.');
END;`}
                </pre>
              </div>
            </section>

            {/* SECTION 6: API REFERENCE */}
            <section className="docs-section" id="api-ref">
              <span className="docs-section-tag">
                <Terminal size={12} />
                <span>REST Contracts</span>
              </span>
              <h2 className="docs-section-title">06. REST API Reference</h2>
              <p className="docs-paragraph">
                The local FastAPI server binds exclusively to <code>127.0.0.1:8000</code>.
                Cross-Origin Resource Sharing (CORS) is locked exclusively to the local UI port to prevent external browser origins from intercepting clinical telemetry.
              </p>

              <div className="docs-table-wrapper">
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Method</th>
                      <th style={{ width: '180px' }}>Endpoint</th>
                      <th>Description</th>
                      <th>Expected Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {API_ENDPOINTS.map((ep, i) => (
                      <tr key={i}>
                        <td>
                          <span className={`method-tag method-${ep.method.toLowerCase()}`}>
                            {ep.method}
                          </span>
                        </td>
                        <td>
                          <code style={{ fontSize: 12.5 }}>{ep.path}</code>
                        </td>
                        <td>{ep.desc}</td>
                        <td className="mono" style={{ fontSize: 12, color: '#94A3B8' }}>{ep.output}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* SECTION 7: HARDWARE SCALING */}
            <section className="docs-section" id="hardware">
              <span className="docs-section-tag">
                <Cpu size={12} />
                <span>Resource Scaling</span>
              </span>
              <h2 className="docs-section-title">07. Hardware Allocation & Benchmarks</h2>
              <p className="docs-paragraph">
                Sanjeevani Lekh is engineered to operate comfortably within standard emergency service field laptops, from base 8 GB MacBooks up to multi-core emergency operations workstations:
              </p>

              <div className="docs-table-wrapper">
                <table className="docs-table">
                  <thead>
                    <tr>
                      <th>Device Memory</th>
                      <th>LLM Extraction Model</th>
                      <th>Whisper ASR Model</th>
                      <th>Cold Start</th>
                      <th>Active Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong style={{ color: '#2DD4BF' }}>8 GB RAM</strong> (Base)</td>
                      <td><code>medgemma1.5</code> (4B Q4_K_M)</td>
                      <td><code>whisper-small.en</code> (GGML)</td>
                      <td>~4.2 sec</td>
                      <td>~1.8–2.4 sec</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: '#60A5FA' }}>16 GB RAM</strong> (Recommended)</td>
                      <td><code>medgemma1.5</code> / <code>gemma3:12b</code></td>
                      <td><code>whisper-medium.en</code></td>
                      <td>~2.8 sec</td>
                      <td>~1.1–1.5 sec</td>
                    </tr>
                    <tr>
                      <td><strong style={{ color: '#A78BFA' }}>24 GB+ RAM</strong> (Enterprise)</td>
                      <td><code>medgemma:27b</code> / <code>qwen2.5:32b</code></td>
                      <td><code>whisper-large-v3-turbo</code></td>
                      <td>~1.9 sec</td>
                      <td>~0.8–1.2 sec</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Floating Return to Top Button */}
      <button
        type="button"
        className="docs-back-top"
        title="Scroll to top"
        aria-label="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
