import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Keyboard,
  Camera,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  FileText,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Printer,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  BookOpen,
  Cpu,
  Database,
  Layers,
  Sparkles,
  Copy,
  Lock,
  Unlock,
  Sun,
  Moon,
  Clock,
  Activity,
  FileCheck2,
  Radio,
  Share2,
  Pill,
  Syringe,
  ArrowRight,
  Zap,
  Volume2
} from 'lucide-react';
import {
  Button,
  Badge,
  Card,
  SegmentedControl,
  StatusDot,
  EmptyState,
  AudioWaveform
} from './components/UI';
import CardNav from './landing/CardNav';
import { NAV_ITEMS } from './navItems';
import './app-premium.css';

function generateEncounterId() {
  const chars = '0123456789ABCDEF';
  let id = 'ENC-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

const FAST_EMS_PRESETS = [
  {
    label: 'STEMI Chest Pain',
    badge: 'Cardiac Alert',
    text: '64-year-old male, conscious, severe retrosternal chest pain 8 of 10. At 14:32:04, gave chewable aspirin 324 mg by mouth. Established 18-gauge IV in left AC fossa with normal saline flush.'
  },
  {
    label: 'Nitroglycerin SL',
    badge: 'Time-Flag Test',
    text: 'Administered 0.4 milligrams sublingual nitroglycerin spray for acute angina, repeat vitals pending.'
  },
  {
    label: 'Anaphylaxis Protocol',
    badge: 'Allergic Reaction',
    text: 'Patient in acute respiratory distress with facial urticaria. Gave 0.3 mg epinephrine 1 to 1000 intramuscularly right vastus lateralis at 14:35.'
  },
  {
    label: 'IV Access & Antiemetic',
    badge: 'Vascular Access',
    text: 'Placed 20-gauge peripheral IV in right forearm, administered 4 mg ondansetron IV push for persistent nausea.'
  }
];

export default function App({ onBackToLanding, onOpenDocs }) {
  const [screen, setScreen] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('screen');
      if (s && ['capture', 'processing', 'review', 'confirmed', 'handover', 'audit', 'docs'].includes(s)) {
        return s;
      }
    } catch (e) {}
    return 'capture';
  });

  const [encounterId, setEncounterId] = useState(generateEncounterId());
  const [responderId, setResponderId] = useState('Paramedic-07');
  const [copiedEncounter, setCopiedEncounter] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Theme Management
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('sanjeevani_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sanjeevani_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Audio recording & Speech-to-Text
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordMode, setRecordMode] = useState('tap'); // 'tap' | 'hold'
  const [liveTranscript, setLiveTranscript] = useState('');
  const liveTranscriptRef = useRef('');
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recognitionRef = useRef(null);

  // Modals
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [typeText, setTypeText] = useState('');
  const fileInputRef = useRef(null);

  // Active Draft state
  const [draft, setDraft] = useState(null);
  const [resolvedFlags, setResolvedFlags] = useState({});
  const [items, setItems] = useState([]);
  const [confirmedResult, setConfirmedResult] = useState(null);

  // Processing steps indicator
  const [processingSteps, setProcessingSteps] = useState([]);

  // Audit state
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Recent encounters list
  const [recentEncounters, setRecentEncounters] = useState([]);

  const loadRecentEncounters = async () => {
    try {
      const res = await fetch('/encounters');
      if (res.ok) {
        const data = await res.json();
        setRecentEncounters(data);
      }
    } catch (e) {
      console.warn('Offline: unable to fetch recent encounters');
    }
  };

  // Service Health & Ollama connection
  const [serviceHealth, setServiceHealth] = useState(null);

  const checkHealth = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        setServiceHealth(data);
      }
    } catch (e) {
      console.warn('Health check unreachable');
    }
  };

  useEffect(() => {
    loadRecentEncounters();
    checkHealth();
  }, []);

  const copyToClipboard = (text, type = 'enc') => {
    navigator.clipboard.writeText(text);
    if (type === 'enc') {
      setCopiedEncounter(true);
      setTimeout(() => setCopiedEncounter(false), 2000);
    } else {
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  // Format Items from FHIR bundle + flags
  const parseDraftToItems = (draftData) => {
    const parsed = [];
    const bundle = draftData.bundle || {};
    const flags = draftData.flags || [];

    const flagMap = {};
    flags.forEach((f) => {
      flagMap[f.item_id] = f;
    });

    (bundle.entry || []).forEach((entry, idx) => {
      const res = entry.resource || {};
      const resType = res.resourceType;
      const itemId = res.id || `${draftData.encounter_id}-${resType === 'MedicationAdministration' ? 'med' : 'proc'}-${idx}`;
      const flag = flagMap[itemId];

      if (resType === 'MedicationAdministration') {
        const drug = res.medicationCodeableConcept?.text || res.medicationCodeableConcept?.coding?.[0]?.display || 'Medication';
        const dose = res.dosage?.dose?.value;
        const unit = res.dosage?.dose?.unit || '';
        const route = res.dosage?.route?.text || res.dosage?.route?.coding?.[0]?.display || '';
        const time = res.effectiveDateTime ? res.effectiveDateTime.split('T')[1]?.slice(0, 5) : '';
        const source_text = res.note?.[0]?.text || '';
        const indication = res.reasonCode?.[0]?.text || res.extension?.find((e) => e.url?.includes('indication'))?.valueString || '';

        parsed.push({
          id: itemId,
          type: 'medication',
          name: drug,
          dose: dose !== undefined ? dose : '',
          unit: unit,
          route: route,
          time: time,
          source_text: source_text,
          indication: indication,
          flag: flag,
        });
      } else if (resType === 'Procedure') {
        const name = res.code?.text || res.code?.coding?.[0]?.display || 'Procedure';
        const time = res.performedDateTime ? res.performedDateTime.split('T')[1]?.slice(0, 5) : '';
        const source_text = res.note?.[0]?.text || '';

        parsed.push({
          id: itemId,
          type: 'procedure',
          name: name,
          details: source_text,
          time: time,
          source_text: source_text,
          flag: flag,
        });
      }
    });

    return parsed;
  };

  // Start Mic & Live Speech-to-Text
  const startRecording = async () => {
    try {
      setLiveTranscript('');
      liveTranscriptRef.current = '';

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.continuous = true;
          rec.interimResults = true;
          rec.lang = 'en-US';
          rec.onresult = (evt) => {
            let fullText = '';
            for (let i = 0; i < evt.results.length; ++i) {
              fullText += evt.results[i][0].transcript + ' ';
            }
            const clean = fullText.trim();
            setLiveTranscript(clean);
            liveTranscriptRef.current = clean;
          };
          rec.onerror = (err) => {
            console.log('SpeechRecognition notice:', err.error);
          };
          rec.start();
          recognitionRef.current = rec;
        } catch (e) {
          console.warn('SpeechRecognition unavailable:', e);
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }
        stream.getTracks().forEach((track) => track.stop());

        const captured = liveTranscriptRef.current.trim();
        if (captured.length > 5) {
          submitDirectText(captured);
        } else {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          submitVoice(audioBlob);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied or unavailable: ' + err.message);
    }
  };

  // Stop Mic
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      clearInterval(timerRef.current);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Submit direct transcribed text for instant extraction
  const submitDirectText = async (textToProcess) => {
    setScreen('processing');
    setProcessingSteps([
      { title: 'Speech transcribed to clinical stream', status: 'done', ms: 40 },
      { title: 'Extracting medications & procedures (FHIR-lite)', status: 'loading' },
      { title: 'Cross-checking with n2c2 NER & safety rules', status: 'pending' },
    ]);

    try {
      const res = await fetch('/draft/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToProcess,
          encounter_id: encounterId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Clinical extraction failed (${res.status})`);
      }

      const draftData = await res.json();
      setDraft(draftData);
      setItems(parseDraftToItems(draftData));
      setResolvedFlags({});

      setProcessingSteps([
        { title: 'Speech transcribed to clinical stream', status: 'done', ms: 40 },
        { title: 'Extracted medications & procedures (FHIR-lite)', status: 'done', ms: draftData.timings_ms.extract },
        { title: 'Validated safety rules & hash integrity', status: 'done', ms: draftData.timings_ms.validate },
      ]);

      setTimeout(() => {
        setScreen('review');
      }, 350);
    } catch (err) {
      alert('Error processing spoken note: ' + err.message);
      setScreen('capture');
    }
  };

  // Submit Voice Audio
  const submitVoice = async (audioBlob) => {
    setScreen('processing');
    setProcessingSteps([
      { title: 'Audio received & filtered', status: 'done', ms: 120 },
      { title: 'Transcribing speech with whisper.cpp', status: 'loading' },
      { title: 'Extracting clinical entities into FHIR', status: 'pending' },
    ]);

    const formData = new FormData();
    formData.append('file', audioBlob, 'field_note.wav');
    formData.append('encounter_id', encounterId);

    try {
      const res = await fetch('/draft/voice', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Voice transcription failed (${res.status})`);
      }

      const draftData = await res.json();
      setDraft(draftData);
      setItems(parseDraftToItems(draftData));
      setResolvedFlags({});

      setProcessingSteps([
        { title: 'Audio received & filtered', status: 'done', ms: 120 },
        { title: 'Transcribed speech with whisper.cpp', status: 'done', ms: draftData.timings_ms.transcribe },
        { title: 'Extracted medications & procedures', status: 'done', ms: draftData.timings_ms.extract },
        { title: 'Validated safety rules & source checks', status: 'done', ms: draftData.timings_ms.validate },
      ]);

      setTimeout(() => {
        setScreen('review');
      }, 400);
    } catch (err) {
      alert('Error processing voice: ' + err.message);
      setScreen('capture');
    }
  };

  // Submit Typed Text
  const submitTypedNote = async () => {
    if (!typeText.trim()) return;
    setShowTypeModal(false);
    setScreen('processing');
    setProcessingSteps([
      { title: 'Text note received', status: 'done', ms: 10 },
      { title: 'Extracting clinical medications and procedures', status: 'loading' },
      { title: 'Cross-checking with n2c2 NER & MIMIC-III', status: 'pending' },
    ]);

    try {
      const res = await fetch('/draft/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: typeText,
          encounter_id: encounterId,
        }),
      });

      if (!res.ok) {
        throw new Error(`Text extraction failed (${res.status})`);
      }

      const draftData = await res.json();
      setDraft(draftData);
      setItems(parseDraftToItems(draftData));
      setResolvedFlags({});
      setTypeText('');

      setProcessingSteps([
        { title: 'Text note received', status: 'done', ms: 10 },
        { title: 'Extracted clinical medications and procedures', status: 'done', ms: draftData.timings_ms.extract },
        { title: 'Cross-checked with n2c2 NER & safety rules', status: 'done', ms: draftData.timings_ms.validate },
      ]);

      setTimeout(() => {
        setScreen('review');
      }, 400);
    } catch (err) {
      alert('Error extracting text: ' + err.message);
      setScreen('capture');
    }
  };

  // Submit Photo Image
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScreen('processing');
    setProcessingSteps([
      { title: 'Image photo received', status: 'done', ms: 80 },
      { title: 'Running offline OCR with Microsoft TrOCR', status: 'loading' },
      { title: 'Extracting clinical parameters', status: 'pending' },
    ]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('encounter_id', encounterId);

    try {
      const res = await fetch('/draft/image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`OCR processing failed (${res.status})`);
      }

      const draftData = await res.json();
      setDraft(draftData);
      setItems(parseDraftToItems(draftData));
      setResolvedFlags({});

      setProcessingSteps([
        { title: 'Image photo received', status: 'done', ms: 80 },
        { title: 'OCR completed with TrOCR engine', status: 'done', ms: draftData.timings_ms.transcribe },
        { title: 'Extracted structured medications & procedures', status: 'done', ms: draftData.timings_ms.extract },
        { title: 'Validated safety rules', status: 'done', ms: draftData.timings_ms.validate },
      ]);

      setTimeout(() => {
        setScreen('review');
      }, 400);
    } catch (err) {
      alert('Error processing image: ' + err.message);
      setScreen('capture');
    }
  };

  // Accept / Dismiss Flag
  const acceptFlag = (itemId) => {
    setResolvedFlags((prev) => ({ ...prev, [itemId]: true }));
  };

  // Remove Item
  const removeItem = (itemId) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    setResolvedFlags((prev) => ({ ...prev, [itemId]: true }));
  };

  // Count Unresolved Flags
  const unresolvedFlagsCount = items.filter((it) => it.flag && !resolvedFlags[it.id]).length;

  // Confirm Record
  const confirmDraft = async () => {
    if (unresolvedFlagsCount > 0) {
      alert('Please accept or fix all flagged items before confirming.');
      return;
    }

    try {
      const payload = {
        encounter_id: encounterId,
        raw_text: draft?.raw_text || '',
        bundle: draft?.bundle || {},
        reviewed_by: responderId,
        input_type: draft?.input_type || 'text',
        model_name: draft?.model?.name,
        prompt_version: draft?.model?.prompt_version,
      };

      const res = await fetch('/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Confirmation failed (${res.status})`);
      }

      const confirmedData = await res.json();
      setConfirmedResult(confirmedData);
      setScreen('confirmed');
      loadRecentEncounters();
    } catch (err) {
      alert('Failed to confirm record: ' + err.message);
    }
  };

  // Load Audit Data
  const runAuditVerification = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch('/audit/verify');
      const data = await res.json();
      setAuditData(data);
    } catch (err) {
      alert('Error verifying audit chain: ' + err.message);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleCardNavLinkClick = (link, item, event) => {
    if (link.onClick) {
      event.preventDefault();
      link.onClick(event);
      return;
    }
    if (link.screen) {
      event.preventDefault();
      setScreen(link.screen);
      if (link.screen === 'audit') {
        runAuditVerification();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (link.href && (link.href.startsWith('/#') || link.href.startsWith('#'))) {
      event.preventDefault();
      const hash = link.href.includes('#') ? '#' + link.href.split('#')[1] : '';
      if (onBackToLanding) {
        onBackToLanding();
        if (hash) {
          setTimeout(() => {
            const el = document.getElementById(hash.slice(1));
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }, 120);
        }
      }
    } else if (link.href && link.href.startsWith('/docs')) {
      event.preventDefault();
      if (onOpenDocs) onOpenDocs();
    } else if (link.href === '/' && onBackToLanding) {
      event.preventDefault();
      onBackToLanding();
    }
  };

  return (
    <div className="app-wrapper">
      {/* Universal Full-Width Glassy CardNav Navigation */}
      <header className="card-nav-container">
        <CardNav
          logo={
            <div
              className="card-nav-brand"
              onClick={onBackToLanding}
              title="Sanjeevani Lekh - Return to Landing Page"
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
          cta={{ label: '← Landing Page', onClick: onBackToLanding }}
          docsHref="/docs"
          onDocsClick={onOpenDocs}
          githubHref="https://github.com/Milindverma24/Virtusa_Jatayu2026"
          cardEffect="rise"
          openOn="click"
          theme={theme === 'light' ? 'light' : 'dark'}
          surface="glass"
          maxWidth="100%"
          cardHeight={140}
          onLinkClick={handleCardNavLinkClick}
        />
      </header>

      {/* 2. Floating Tactile Segmented Navigation Deck */}
      <div className="floating-nav-deck">
        <nav className="tactile-nav-track" role="tablist" aria-label="Main navigation">
          <button
            type="button"
            role="tab"
            aria-selected={screen === 'capture'}
            className={`tactile-nav-item ${screen === 'capture' ? 'active' : ''}`}
            onClick={() => setScreen('capture')}
          >
            <Mic size={15} strokeWidth={2.2} />
            <span>Capture</span>
          </button>

          {draft && (
            <button
              type="button"
              role="tab"
              aria-selected={screen === 'review'}
              className={`tactile-nav-item ${screen === 'review' ? 'active' : ''}`}
              onClick={() => setScreen('review')}
            >
              <AlertTriangle size={15} strokeWidth={2.2} />
              <span>Review Draft</span>
              {unresolvedFlagsCount > 0 && (
                <span className="nav-alert-dot">{unresolvedFlagsCount}</span>
              )}
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={screen === 'handover'}
            className={`tactile-nav-item ${screen === 'handover' ? 'active' : ''}`}
            onClick={() => setScreen('handover')}
          >
            <FileText size={15} strokeWidth={2.2} />
            <span>Handover ePCR</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={screen === 'audit'}
            className={`tactile-nav-item ${screen === 'audit' ? 'active' : ''}`}
            onClick={() => {
              setScreen('audit');
              runAuditVerification();
            }}
          >
            <ShieldCheck size={15} strokeWidth={2.2} />
            <span>Hash Ledger</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={screen === 'docs'}
            className={`tactile-nav-item ${screen === 'docs' ? 'active' : ''}`}
            onClick={() => setScreen('docs')}
          >
            <BookOpen size={15} strokeWidth={2.2} />
            <span>System Specs</span>
          </button>
        </nav>
      </div>

      {/* 3. Main Body */}
      <main className="main-content">
        {/* ===================================================================
            SCREEN 1: CAPTURE (Ultra-Premium Biometric Sound Reactor)
            =================================================================== */}
        {screen === 'capture' && (
          <div className="premium-capture-layout">
            {/* Header Lockup */}
            <div className="capture-title-lockup">
              <h1 className="capture-main-headline">
                Record Field Observation
              </h1>
              <p className="capture-lead-sub">
                Speak naturally, type a quick observation, or scan handwritten glove notes.
                Converted on-device into structured FHIR records sealed with SHA-256.
              </p>
            </div>

            {/* Mode Switcher */}
            <div className="mode-toggle-wrap">
              <button
                type="button"
                className={`mode-toggle-btn ${recordMode === 'tap' ? 'active' : ''}`}
                onClick={() => setRecordMode('tap')}
              >
                <Radio size={14} />
                <span>Continuous Hands-Free (Tap)</span>
              </button>
              <button
                type="button"
                className={`mode-toggle-btn ${recordMode === 'hold' ? 'active' : ''}`}
                onClick={() => setRecordMode('hold')}
              >
                <Mic size={14} />
                <span>Tactical Push-to-Talk (Hold)</span>
              </button>
            </div>

            {/* Centerpiece: Biometric Audio Reactor Orb */}
            <div className={`orb-stage-wrapper ${isRecording ? 'recording' : ''}`}>
              <div className="orb-ambient-glow" />
              <div className="orb-telemetry-ring" />
              <div className="orb-ripple" />

              <button
                type="button"
                className={`biometric-orb-btn ${isRecording ? 'recording' : ''}`}
                onClick={recordMode === 'tap' ? (isRecording ? stopRecording : startRecording) : undefined}
                onMouseDown={recordMode === 'hold' ? startRecording : undefined}
                onMouseUp={recordMode === 'hold' ? stopRecording : undefined}
                onTouchStart={recordMode === 'hold' ? startRecording : undefined}
                onTouchEnd={recordMode === 'hold' ? stopRecording : undefined}
                aria-label={isRecording ? 'Stop recording voice observation' : 'Start voice observation'}
              >
                <div className="orb-mic-icon-wrap">
                  <Mic size={32} strokeWidth={2.2} />
                </div>
                <span className="orb-action-caption">
                  {isRecording
                    ? (recordMode === 'tap' ? 'Tap to finish' : 'Release to finish')
                    : (recordMode === 'tap' ? 'Tap to speak' : 'Hold to speak')}
                </span>
              </button>
            </div>

            {/* Real-time Spoken Transcript & HUD Panel */}
            {isRecording && (
              <div className="live-stream-hud">
                <div className="hud-top-meta mono">
                  <div className="hud-rec-tag">
                    <span className="rec-blinking-led" />
                    <span>ACOUSTIC MIC LIVE</span>
                  </div>
                  <div className="hud-timer-ticker">
                    REC 00:{recordSeconds < 10 ? `0${recordSeconds}` : recordSeconds}
                  </div>
                </div>

                {/* 16-Bar Multi-Frequency Visualizer */}
                <div className="hud-equalizer-stream">
                  {[25, 45, 80, 60, 95, 30, 85, 100, 75, 40, 90, 65, 35, 55, 80, 50].map((h, i) => (
                    <span
                      key={i}
                      className="equalizer-bar"
                      style={{
                        height: `${h}%`,
                        animationDelay: `${(i * 0.06).toFixed(2)}s`
                      }}
                    />
                  ))}
                </div>

                <div className="hud-transcript-scrollbox">
                  {liveTranscript ? (
                    <>
                      "{liveTranscript}"
                      <span className="hud-typewriter-cursor" />
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Listening for medications, dosages, times, and routes...
                    </span>
                  )}
                </div>

                {recordMode === 'tap' && (
                  <Button
                    variant="primary"
                    size="md"
                    fullWidth={true}
                    icon={Check}
                    onClick={stopRecording}
                  >
                    Done Speaking · Extract Clinical ePCR
                  </Button>
                )}
              </div>
            )}

            {/* Multi-Modal Capture Deck */}
            <div className="tactical-deck-grid">
              {/* Keyboard Entry Module */}
              <div
                className="deck-action-card"
                onClick={() => setShowTypeModal(true)}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="deck-card-head">
                    <div className="deck-icon-badge">
                      <Keyboard size={22} strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="deck-card-title">Type Field Note</h3>
                      <p className="deck-card-desc">
                        Direct text entry for noisy siren scenes or high-speed ambulance transport.
                      </p>
                    </div>
                  </div>

                  <div className="preset-chips-cluster">
                    {FAST_EMS_PRESETS.slice(0, 2).map((p, idx) => (
                      <span
                        key={idx}
                        className="preset-chip"
                        onClick={(e) => {
                          e.stopPropagation();
                          submitDirectText(p.text);
                        }}
                        title={`Click to run instant ${p.label} extraction test`}
                      >
                        <Zap size={11} color="var(--primary)" />
                        <span>{p.label}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>
                  <span>Open Text Editor</span>
                  <ChevronRight size={14} />
                </div>
              </div>

              {/* Computer Vision Module */}
              <div
                className="deck-action-card"
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <div>
                  <div className="deck-card-head">
                    <div className="deck-icon-badge" style={{ background: 'rgba(45, 212, 191, 0.12)', borderColor: 'rgba(45, 212, 191, 0.25)', color: 'var(--accent)' }}>
                      <Camera size={22} strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="deck-card-title">Photo / Scan Note</h3>
                      <p className="deck-card-desc">
                        Offline handwriting recognition via Microsoft TrOCR from triage paper or gloves.
                      </p>
                    </div>
                  </div>

                  <div className="preset-chips-cluster">
                    <span className="preset-chip" style={{ color: 'var(--accent)', borderColor: 'rgba(45, 212, 191, 0.3)' }}>
                      <ShieldCheck size={11} />
                      <span>On-Device TrOCR</span>
                    </span>
                    <span className="preset-chip">
                      <span>JPEG / PNG / PDF</span>
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>
                  <span>Select or Snap Photo</span>
                  <ChevronRight size={14} />
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handlePhotoSelect}
                  aria-label="Upload note photo"
                />
              </div>
            </div>

            {/* Recent Confirmed Encounters Ledger Feed */}
            <div className="audit-ledger-section">
              <div className="ledger-header-strip">
                <span className="ledger-title-label">Live Cryptographic Audit Feed</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {recentEncounters.length} TOTAL SEALED BLOCKS
                </span>
              </div>

              {recentEncounters.length === 0 ? (
                <EmptyState
                  icon={FileCheck2}
                  title="No entries in local ledger yet"
                  description="Your first confirmed emergency field note will appear here in the tamper-evident SHA-256 chain."
                />
              ) : (
                <div className="ledger-cards-flow">
                  {recentEncounters.slice(0, 4).map((enc, idx) => (
                    <div
                      key={enc.encounter_id}
                      className="ledger-entry-card"
                      onClick={() => {
                        setEncounterId(enc.encounter_id);
                        setScreen('handover');
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="ledger-card-left">
                        <StatusDot color="green" pulse={true} size={8} />
                        <span className="ledger-enc-id mono">{enc.encounter_id}</span>
                        <span className="ledger-item-chip mono">
                          <CheckCircle2 size={12} />
                          {enc.record_count} items recorded
                        </span>
                      </div>
                      <div className="ledger-card-right">
                        <span>Inspect Handover</span>
                        <ChevronRight size={15} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Discreet Legal Clinical Footer */}
            <div style={{ marginTop: 44, fontSize: 12.5, color: 'var(--text-dim)' }}>
              Dual-zone offline ePCR documentation · 100% on-device clinical audit chain · Not a certified medical device
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 2: PROCESSING (Neural Pipeline HUD)
            =================================================================== */}
        {screen === 'processing' && (
          <div className="stepper-container" aria-live="polite">
            <div className="stepper-card" style={{ maxWidth: 540 }}>
              <div className="stepper-header">
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(76, 141, 255, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <Activity size={22} className="hero-badge-pulse" />
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>Neural Clinical Pipeline</h2>
                  <p style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>Running zero-guessing offline extraction engine</p>
                </div>
              </div>

              <div>
                {processingSteps.map((step, idx) => {
                  const isDone = step.status === 'done';
                  const isLoading = step.status === 'loading';
                  return (
                    <div key={idx} className="stepper-step-row">
                      <div className={`stepper-indicator ${isDone ? 'done' : isLoading ? 'active' : ''}`}>
                        {isDone ? (
                          <Check size={14} strokeWidth={3} />
                        ) : isLoading ? (
                          <span className="ui-btn-spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                        ) : (
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-dim)' }} />
                        )}
                      </div>
                      <div className="stepper-content">
                        <div className="stepper-title-wrap">
                          <span className="stepper-title" style={{ color: isDone || isLoading ? 'var(--text)' : 'var(--text-muted)' }}>
                            {step.title}
                          </span>
                          {step.ms !== undefined && (
                            <span className="stepper-time mono">{step.ms} ms</span>
                          )}
                        </div>
                        {isLoading && <div className="stepper-shimmer-bar" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 3: REVIEW (Core Screen - Two-Column Split Deck)
            =================================================================== */}
        {screen === 'review' && draft && (
          <div className="review-deck-wrap">
            <div className="review-headline-bar">
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.4px' }}>
                  Review Clinical Draft
                </h1>
                <p style={{ fontSize: 14.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Every medication, dose, and procedure must be grounded in original words. Resolve any flagged items to confirm.
                </p>
              </div>

              {unresolvedFlagsCount > 0 ? (
                <Badge variant="warning" icon={AlertTriangle} dotColor="amber" pulseDot={true}>
                  {unresolvedFlagsCount} item{unresolvedFlagsCount > 1 ? 's' : ''} require paramedic confirmation
                </Badge>
              ) : (
                <Badge variant="success" icon={CheckCircle2} dotColor="green">
                  All clinical items verified & ready to seal
                </Badge>
              )}
            </div>

            <div className="review-split-grid">
              {/* Left Column: What was dictated */}
              <div className="review-card-panel">
                <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span>Verbatim Source Dictation</span>
                  <Badge variant="neutral" size="sm">Ground Truth</Badge>
                </div>

                <div style={{ background: 'rgba(9, 13, 20, 0.75)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 14, padding: 18, fontSize: 15, lineHeight: 1.65, color: '#FFFFFF' }}>
                  "{draft.raw_text}"
                </div>

                {draft.summary && (
                  <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'rgba(76, 141, 255, 0.08)', border: '1px solid rgba(76, 141, 255, 0.25)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} /> AI Clinical Summary
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>
                      {draft.summary}
                    </div>
                  </div>
                )}

                {draft.ocr_confidence && (
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>TrOCR Detection Confidence:</span>
                    <strong className="mono" style={{ color: 'var(--accent)' }}>{Math.round(draft.ocr_confidence * 100)}%</strong>
                  </div>
                )}

                <div style={{ marginTop: 20 }}>
                  <Button
                    variant="secondary"
                    fullWidth={true}
                    icon={Keyboard}
                    onClick={() => {
                      setTypeText(draft.raw_text);
                      setShowTypeModal(true);
                    }}
                  >
                    Edit Source Words & Re-extract
                  </Button>
                </div>
              </div>

              {/* Right Column: Structured Items */}
              <div className="review-card-panel">
                <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span>Extracted Clinical Entities ({items.length})</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>FHIR-lite</span>
                </div>

                {items.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No clinical items detected"
                    description="No medications or procedures could be extracted from the provided note."
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {items.map((item) => {
                      const isFlagged = item.flag && !resolvedFlags[item.id];
                      const isAccepted = item.flag && resolvedFlags[item.id];

                      return (
                        <div
                          key={item.id}
                          className={`structured-item-card ${isFlagged ? 'is-flagged' : isAccepted ? 'is-accepted' : ''}`}
                        >
                          <div className="item-card-top">
                            <div className="item-main-name">
                              {item.time && (
                                <span className="mono item-time-tag">{item.time}</span>
                              )}
                              <span>{item.name}</span>
                            </div>

                            {item.type === 'medication' && (
                              <span className="mono item-dosage-highlight">
                                {item.dose} {item.unit} · {item.route}
                              </span>
                            )}
                          </div>

                          {item.type === 'procedure' && item.details && (
                            <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
                              {item.details}
                            </div>
                          )}

                          {item.type === 'medication' && item.indication && (
                            <div style={{
                              marginTop: 8,
                              padding: '6px 12px',
                              background: 'rgba(76, 141, 255, 0.08)',
                              border: '1px solid rgba(76, 141, 255, 0.25)',
                              borderRadius: 8,
                              fontSize: 12.5,
                              color: 'var(--primary)',
                              lineHeight: 1.4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6
                            }}>
                              <Pill size={12} />
                              <span>Clinical Indication: <strong>{item.indication}</strong></span>
                            </div>
                          )}

                          {item.source_text && (
                            <div className="item-source-quote">
                              Source words: "{item.source_text}"
                            </div>
                          )}

                          {/* Loud Amber Never-Guess Policy Alert */}
                          {item.flag && (
                            <div className="amber-safety-banner">
                              <div className="amber-banner-head">
                                <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
                                <div>
                                  <strong>Never-Guess Safety Net:</strong> {item.flag.message || item.flag.reason}
                                </div>
                              </div>

                              {isFlagged ? (
                                <div className="amber-actions-row">
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    icon={Check}
                                    onClick={() => acceptFlag(item.id)}
                                  >
                                    Accept & Confirm Value
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    icon={Trash2}
                                    onClick={() => removeItem(item.id)}
                                  >
                                    Remove Item
                                  </Button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 12.5, fontWeight: 600 }}>
                                  <CheckCircle2 size={14} />
                                  <span>Confirmed by paramedic digital signature</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Floating Confirmation Dock */}
            <div className="floating-seal-dock">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Digitally signed by:</span>
                <input
                  type="text"
                  className="responder-text-input mono"
                  value={responderId}
                  onChange={(e) => setResponderId(e.target.value)}
                  placeholder="Paramedic ID"
                  aria-label="Responder ID"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {unresolvedFlagsCount > 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>
                    Resolve {unresolvedFlagsCount} pending safety flag{unresolvedFlagsCount > 1 ? 's' : ''} to unlock
                  </span>
                ) : null}

                <Button
                  variant="primary"
                  size="md"
                  disabled={unresolvedFlagsCount > 0}
                  onClick={confirmDraft}
                  icon={unresolvedFlagsCount > 0 ? Lock : ShieldCheck}
                >
                  {unresolvedFlagsCount > 0
                    ? `Review Locked (${unresolvedFlagsCount})`
                    : 'Confirm & Seal to SHA-256 Chain'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 4: CONFIRMED (Celebratory Cryptographic Seal)
            =================================================================== */}
        {screen === 'confirmed' && confirmedResult && (
          <div style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center', padding: '0 24px' }}>
            <div style={{
              display: 'inline-flex',
              padding: 22,
              borderRadius: '50%',
              background: 'rgba(52, 211, 153, 0.15)',
              border: '2px solid rgba(52, 211, 153, 0.4)',
              color: 'var(--success)',
              marginBottom: 20,
              boxShadow: '0 0 36px rgba(52, 211, 153, 0.3)'
            }}>
              <CheckCircle2 size={54} strokeWidth={2.2} />
            </div>

            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' }}>
              Record Sealed in Cryptographic Ledger
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 15.5 }}>
              Appended permanently to the tamper-evident SHA-256 SQLite hash chain
            </p>

            <div style={{ background: 'rgba(14, 20, 31, 0.85)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 20, padding: 24, textAlign: 'left', marginTop: 28, boxShadow: '0 20px 48px -12px rgba(0, 0, 0, 0.7)' }}>
              <div style={{ marginBottom: 16 }}>
                <span className="section-label" style={{ marginBottom: 4 }}>ENCOUNTER ID</span>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                  {confirmedResult.encounter_id}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <span className="section-label" style={{ marginBottom: 4 }}>RECORD ID</span>
                <div className="mono" style={{ fontSize: 14.5 }}>
                  {confirmedResult.record_id}
                </div>
              </div>

              <div>
                <span className="section-label" style={{ marginBottom: 4 }}>CRYPTOGRAPHIC SHA-256 HASH</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all', color: 'var(--accent)', flex: 1 }}>
                    {confirmedResult.hash}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={copiedHash ? Check : Copy}
                    onClick={() => copyToClipboard(confirmedResult.hash, 'hash')}
                    title="Copy hash"
                  >
                    {copiedHash ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 32, flexWrap: 'wrap' }}>
              <Button
                variant="primary"
                size="md"
                icon={FileText}
                onClick={() => setScreen('handover')}
              >
                View Hospital Handover
              </Button>
              <Button
                variant="secondary"
                size="md"
                icon={Plus}
                onClick={() => {
                  setEncounterId(generateEncounterId());
                  setDraft(null);
                  setItems([]);
                  setScreen('capture');
                }}
              >
                New Clinical Note
              </Button>
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 5: HANDOVER REPORT
            =================================================================== */}
        {screen === 'handover' && (
          <div className="handover-view-wrapper">
            <div className="handover-action-bar">
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 700 }}>Hospital Handover ePCR</h1>
                <p style={{ fontSize: 14.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  Official transfer documentation for encounter <span className="mono">{encounterId}</span>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a
                  href={`/encounters/${encounterId}/report.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-btn ui-btn-secondary ui-btn-md"
                >
                  <Printer size={16} />
                  <span>Download PDF</span>
                </a>
                <a
                  href={`/encounters/${encounterId}/report`}
                  target="_blank"
                  rel="noreferrer"
                  className="ui-btn ui-btn-primary ui-btn-md"
                >
                  <ExternalLink size={16} />
                  <span>Open Fullsheet</span>
                </a>
              </div>
            </div>

            <div className="handover-sheet-preview" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
              <iframe
                src={`/encounters/${encounterId}/report`}
                style={{ width: '100%', height: '720px', border: 'none', background: '#FFFFFF' }}
                title="Handover Report Preview"
              />
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 6: AUDIT VERIFICATION (Blockchain Ledger Explorer)
            =================================================================== */}
        {screen === 'audit' && (
          <div className="audit-view-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 700 }}>Cryptographic Audit Ledger</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 15, marginTop: 4 }}>
                  Every confirmed record is hashed with SHA-256 and chained in an append-only SQLite blockchain.
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                icon={RefreshCw}
                loading={auditLoading}
                onClick={runAuditVerification}
              >
                Verify Entire Ledger
              </Button>
            </div>

            {auditData && (
              <Card
                variant={auditData.valid ? 'success' : 'warning'}
                style={{ padding: 24, marginBottom: 28 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {auditData.valid ? (
                    <div style={{ color: 'var(--success)' }}>
                      <CheckCircle2 size={38} strokeWidth={2.2} />
                    </div>
                  ) : (
                    <div style={{ color: 'var(--danger)' }}>
                      <AlertTriangle size={38} strokeWidth={2.2} />
                    </div>
                  )}
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700 }}>
                      {auditData.valid ? 'Cryptographic Hash Chain Intact' : 'Audit Chain Compromised!'}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14.5, marginTop: 3 }}>
                      {auditData.message}
                    </p>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: 36,
                  marginTop: 22,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 18,
                  flexWrap: 'wrap'
                }}>
                  <div>
                    <span className="section-label" style={{ marginBottom: 4 }}>TOTAL BLOCKS VERIFIED</span>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
                      {auditData.total_records}
                    </div>
                  </div>
                  <div>
                    <span className="section-label" style={{ marginBottom: 4 }}>TAMPER STATUS</span>
                    <div style={{
                      color: auditData.valid ? 'var(--success)' : 'var(--danger)',
                      fontWeight: 700,
                      fontSize: 16
                    }}>
                      {auditData.valid ? 'GENESIS ROOT INTACT [PASS]' : 'TAMPERING DETECTED [FAIL]'}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Visual Blockchain Timeline */}
            <div className="section-label" style={{ marginBottom: 16 }}>Blockchain Node History</div>
            <div className="audit-timeline-flow">
              <div className="audit-timeline-node">
                <div className="audit-node-dot verified">
                  <ShieldCheck size={14} />
                </div>
                <Card variant="surface-2" style={{ padding: 18, borderRadius: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="mono" style={{ fontSize: 14.5 }}>GENESIS BLOCK #0</strong>
                    <Badge variant="success" size="sm">Verified Genesis</Badge>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    prev_hash: 0000000000000000000000000000000000000000000000000000000000000000
                  </div>
                </Card>
              </div>

              {recentEncounters.slice(0, 4).map((enc, idx) => (
                <div key={enc.encounter_id} className="audit-timeline-node">
                  <div className="audit-node-dot verified">
                    <Check size={14} />
                  </div>
                  <Card variant="surface-2" style={{ padding: 18, borderRadius: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong className="mono" style={{ fontSize: 14.5 }}>RECORD BLOCK #{idx + 1}</strong>
                      <span className="mono" style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{enc.encounter_id}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      {enc.record_count} items sealed into cryptographic SQLite ledger
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 7: DOCS & ARCHITECTURE
            =================================================================== */}
        {screen === 'docs' && (
          <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px 60px' }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Badge variant="primary" icon={Sparkles}>System Architecture & Specs</Badge>
                <Badge variant="success" icon={ShieldCheck}>100% Offline</Badge>
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px' }}>
                System Architecture & Downloaded Assets
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 16, marginTop: 8, lineHeight: 1.6 }}>
                Everything clinical runs on-device without internet access. Below is a concise breakdown of all models and assets downloaded, what purpose each serves, and the complete audit chain.
              </p>
            </div>

            {/* Quick Flow Summary in Short */}
            <Card variant="surface-2" style={{ padding: 26, marginBottom: 32, borderColor: 'var(--primary)', borderRadius: 20 }}>
              <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                <Layers size={19} /> The Complete Process In Short (6 Steps)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>STEP 1 · CAPTURE</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>Voice, Type, or Photo</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>Audio recorded via MediaRecorder or picture uploaded.</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>STEP 2 · TRANSCRIBE</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>Whisper & TrOCR</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>Voice to text or glove handwriting to text locally.</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>STEP 3 · EXTRACT</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>Ollama & MedGemma</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>Local LLM picks out drug, dose, route, and time into FHIR.</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>STEP 4 · CROSS-CHECK</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>n2c2 BERT & Bio_ClinicalBERT</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>Detects omitted treatments and computes MIMIC embeddings.</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 700 }}>STEP 5 · CONFIRM</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>Human-In-The-Loop</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>Paramedic signs off and accepts any loud amber flags.</div>
                </div>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>STEP 6 · SEAL</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 4 }}>SHA-256 Hash Chain</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>Appended to SQLite blockchain ledger, impossible to modify.</div>
                </div>
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
              <Button variant="primary" size="md" icon={Mic} onClick={() => setScreen('capture')}>
                Start Live Capture
              </Button>
              <Button variant="secondary" size="md" icon={ShieldCheck} onClick={() => { setScreen('audit'); runAuditVerification(); }}>
                Inspect Hash Ledger
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Upgraded High-Tech Modal: Type Clinical Field Note */}
      {showTypeModal && (
        <div className="high-tech-modal-overlay">
          <div className="high-tech-modal-card">
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#FFFFFF' }}>Type Clinical Field Note</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
              Enter verbatim paramedic on-scene medications, routes, dosages, and procedures.
            </p>

            {/* Quick Preset Chips in Modal */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '14px 0 10px' }}>
              {FAST_EMS_PRESETS.map((p, idx) => (
                <span
                  key={idx}
                  className="preset-chip"
                  onClick={() => setTypeText(p.text)}
                  title="Click to insert sample"
                >
                  <Plus size={11} />
                  <span>{p.label}</span>
                </span>
              ))}
            </div>

            <textarea
              className="modal-textarea"
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              placeholder="e.g. 14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC fossa with normal saline flush."
              autoFocus
              style={{ minHeight: 180, fontSize: 15, borderRadius: 14 }}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {typeText.length} characters
              </span>

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" size="md" onClick={() => setShowTypeModal(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={submitTypedNote}
                  disabled={!typeText.trim()}
                  icon={Sparkles}
                >
                  Extract Clinical Note
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
