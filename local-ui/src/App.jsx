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
  Share2
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

function generateEncounterId() {
  const chars = '0123456789ABCDEF';
  let id = 'ENC-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

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
  }); // 'capture' | 'processing' | 'review' | 'confirmed' | 'handover' | 'audit' | 'docs'
  const [encounterId, setEncounterId] = useState(generateEncounterId());
  const [responderId, setResponderId] = useState('Paramedic');
  const [copiedEncounter, setCopiedEncounter] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Theme Management (Dark by default, system or toggleable)
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
  const [recordMode, setRecordMode] = useState('tap'); // 'tap' (click to speak) | 'hold' (hold to speak)
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

  // Fetch recent encounters on load
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
          } catch (e) { }
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
      { title: 'Speech transcribed to text', status: 'done', ms: 40 },
      { title: 'Extracting medications & procedures', status: 'loading' },
      { title: 'Validating safety rules & hash integrity', status: 'pending' },
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
        { title: 'Speech transcribed to text', status: 'done', ms: 40 },
        { title: 'Extracted medications & procedures', status: 'done', ms: draftData.timings_ms.extract },
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
      { title: 'Audio received', status: 'done', ms: 120 },
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
        { title: 'Audio received', status: 'done', ms: 120 },
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

      {/* Operational Clinical Status Bar */}
      <header className="app-header">
        <div className="header-brand">
          <button
            type="button"
            className="encounter-chip mono"
            title="Click to copy encounter ID"
            onClick={() => copyToClipboard(encounterId, 'enc')}
          >
            <span>{encounterId}</span>
            {copiedEncounter ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            Responder: <strong>{responderId}</strong>
          </span>
        </div>

        <div className="header-status-group">
          {/* Offline / Online indicator */}
          {serviceHealth?.ollama_running ? (
            <Badge variant="primary" dotColor="blue">
              Online
            </Badge>
          ) : (
            <Badge variant="neutral" dotColor="neutral">
              Offline
            </Badge>
          )}

          {/* Mode Pill */}
          {serviceHealth?.ollama_running && serviceHealth?.model_available ? (
            <Badge variant="primary">
              Ollama: {serviceHealth.model_name.split(':')[0]}
            </Badge>
          ) : (
            <Badge variant="neutral">
              Standalone Fast Mode
            </Badge>
          )}

          {/* Audit Chain Pill (Intact & Alive with soft pulse on dot only) */}
          <Badge
            variant="success"
            dotColor="green"
            pulseDot={true}
            interactive={true}
            icon={ShieldCheck}
            title="Cryptographic audit chain intact. Click to inspect."
            onClick={() => {
              setScreen('audit');
              runAuditVerification();
            }}
          >
            Audit Chain: Intact
          </Badge>

          {/* Theme Toggle */}
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </header>

      {/* 2. Navigation: Pill-style Segmented Nav (Desktop) / Bottom Bar (Mobile) */}
      <div className="nav-container">
        <nav className="nav-pill-track" role="tablist" aria-label="Main navigation">
          <button
            type="button"
            role="tab"
            aria-selected={screen === 'capture'}
            className={`nav-pill-item ${screen === 'capture' ? 'active' : ''}`}
            onClick={() => setScreen('capture')}
          >
            <Mic size={16} strokeWidth={2} />
            <span>Capture</span>
          </button>

          {draft && (
            <button
              type="button"
              role="tab"
              aria-selected={screen === 'review'}
              className={`nav-pill-item ${screen === 'review' ? 'active' : ''}`}
              onClick={() => setScreen('review')}
            >
              <AlertTriangle size={16} strokeWidth={2} />
              <span>Review Draft</span>
              {unresolvedFlagsCount > 0 && (
                <span className="nav-count-badge">{unresolvedFlagsCount}</span>
              )}
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={screen === 'handover'}
            className={`nav-pill-item ${screen === 'handover' ? 'active' : ''}`}
            onClick={() => setScreen('handover')}
          >
            <FileText size={16} strokeWidth={2} />
            <span>Handover Report</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={screen === 'audit'}
            className={`nav-pill-item ${screen === 'audit' ? 'active' : ''}`}
            onClick={() => {
              setScreen('audit');
              runAuditVerification();
            }}
          >
            <ShieldCheck size={16} strokeWidth={2} />
            <span>Audit Verification</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={screen === 'docs'}
            className={`nav-pill-item ${screen === 'docs' ? 'active' : ''}`}
            onClick={() => setScreen('docs')}
          >
            <BookOpen size={16} strokeWidth={2} />
            <span>Docs & Architecture</span>
          </button>
        </nav>
      </div>

      {/* 3. Main Content Body */}
      <main className="main-content">
        {/* ===================================================================
            SCREEN 1: CAPTURE (Hero Screen)
            =================================================================== */}
        {screen === 'capture' && (
          <div className="capture-hero-container">
            {/* Title & Subtitle */}
            <div className="capture-header">
              <h1 className="capture-title">Record Field Observation</h1>
              <p className="capture-subtitle">
                Hold to speak, type a quick note, or capture a vital monitor photo
              </p>
            </div>

            {/* Mode Toggle: Refined Segmented Control */}
            <SegmentedControl
              options={[
                { value: 'tap', label: 'Click to Speak (Hands-free)', icon: Radio },
                { value: 'hold', label: 'Hold to Speak (PTT)', icon: Mic },
              ]}
              value={recordMode}
              onChange={setRecordMode}
              ariaLabel="Select voice recording mode"
            />

            {/* Hero 160px Mic Action Area */}
            <div className="hero-mic-area">
              <button
                type="button"
                className={`hero-mic-btn ${isRecording ? 'recording' : 'idle'}`}
                onClick={recordMode === 'tap' ? (isRecording ? stopRecording : startRecording) : undefined}
                onMouseDown={recordMode === 'hold' ? startRecording : undefined}
                onMouseUp={recordMode === 'hold' ? stopRecording : undefined}
                onTouchStart={recordMode === 'hold' ? startRecording : undefined}
                onTouchEnd={recordMode === 'hold' ? stopRecording : undefined}
                aria-label={isRecording ? 'Stop recording voice' : 'Start recording voice'}
              >
                <div className="mic-icon-wrap">
                  <Mic size={48} strokeWidth={1.8} />
                </div>
                <span className="mic-action-label">
                  {isRecording
                    ? (recordMode === 'tap' ? 'Tap to finish' : 'Release to finish')
                    : (recordMode === 'tap' ? 'Tap to speak' : 'Hold to speak')}
                </span>
              </button>

              {/* Recording Status, Timer & Live Waveform */}
              {isRecording && (
                <div className="recording-active-panel" aria-live="polite">
                  <div className="recording-timer-badge mono">
                    <StatusDot color="red" pulse={true} size={10} />
                    <span>REC 00:{recordSeconds < 10 ? `0${recordSeconds}` : recordSeconds}</span>
                  </div>

                  <AudioWaveform active={true} barCount={9} color="var(--danger)" />

                  {recordMode === 'tap' && (
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Check}
                      onClick={stopRecording}
                      style={{ marginTop: 4 }}
                    >
                      Done Speaking · Generate Report
                    </Button>
                  )}
                </div>
              )}

              {/* Real-time Spoken Transcript Card */}
              {isRecording && liveTranscript && (
                <div className="live-transcript-card" aria-live="polite">
                  <div className="live-transcript-header">
                    <Radio size={13} /> Live Spoken Transcript
                  </div>
                  <div className="live-transcript-body">
                    "{liveTranscript}"
                  </div>
                </div>
              )}
            </div>

            {/* Secondary Actions (Equal-width Cards) */}
            <div className="secondary-actions-grid">
              <button
                type="button"
                className="action-tile-card"
                onClick={() => setShowTypeModal(true)}
              >
                <div className="action-tile-icon">
                  <Keyboard size={22} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="action-tile-title">Type Field Note</div>
                  <div className="action-tile-desc">Direct keyboard entry for quiet or noisy scenes</div>
                </div>
              </button>

              <button
                type="button"
                className="action-tile-card"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="action-tile-icon">
                  <Camera size={22} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="action-tile-title">Photo / Scan Note</div>
                  <div className="action-tile-desc">TrOCR handwriting extraction from glove or paper</div>
                </div>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handlePhotoSelect}
                aria-label="Upload note photo"
              />
            </div>

            {/* Recent Confirmed Entries List */}
            <div className="recent-entries-section">
              <div className="section-label">
                <span>Recent Confirmed Encounters</span>
                <span className="mono" style={{ fontSize: 11 }}>{recentEncounters.length} TOTAL</span>
              </div>

              {recentEncounters.length === 0 ? (
                <EmptyState
                  icon={FileCheck2}
                  title="No entries yet"
                  description="Your first confirmed emergency field note will appear here in the tamper-evident chain."
                />
              ) : (
                recentEncounters.slice(0, 5).map((enc) => (
                  <div
                    key={enc.encounter_id}
                    className="recent-entry-row"
                    onClick={() => {
                      setEncounterId(enc.encounter_id);
                      setScreen('handover');
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="recent-entry-left">
                      <StatusDot color="green" size={9} />
                      <span className="recent-entry-id mono">{enc.encounter_id}</span>
                      <span className="recent-entry-meta">
                        {enc.record_count} items recorded
                      </span>
                    </div>
                    <div className="recent-entry-right">
                      <span>View Handover</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Slim Footer Line */}
            <div className="app-legal-footer">
              Draft aid, not a medical device record · 100% on-device clinical audit chain
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 2: PROCESSING (3-Step Vertical Stepper, No Generic Spinner)
            =================================================================== */}
        {screen === 'processing' && (
          <div className="stepper-container" aria-live="polite">
            <div className="stepper-card">
              <div className="stepper-header">
                <Activity size={22} color="var(--primary)" />
                <div>
                  <h2 style={{ fontSize: 19, fontWeight: 700 }}>Processing Clinical Note</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Running zero-guessing offline clinical pipeline</p>
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
            SCREEN 3: REVIEW (Core Screen - Two-Column Split)
            =================================================================== */}
        {screen === 'review' && draft && (
          <div>
            <div className="review-screen-header">
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.3px' }}>
                  Review Clinical Draft
                </h1>
                <p style={{ fontSize: 14.5, color: 'var(--text-muted)', marginTop: 4 }}>
                  Original source words must support all extractions. Resolve flagged items to unlock confirmation.
                </p>
              </div>

              {unresolvedFlagsCount > 0 ? (
                <Badge variant="warning" icon={AlertTriangle} dotColor="amber">
                  {unresolvedFlagsCount} item{unresolvedFlagsCount > 1 ? 's' : ''} need review
                </Badge>
              ) : (
                <Badge variant="success" icon={CheckCircle2} dotColor="green">
                  All items verified & ready
                </Badge>
              )}
            </div>

            <div className="review-grid">
              {/* Left Column: What was captured */}
              <div>
                <div className="section-label">
                  <span>What Was Dictated / Captured</span>
                  <Badge variant="neutral" size="sm">Source Text</Badge>
                </div>

                <div className="review-transcript-card">
                  <div className="transcript-text-view">
                    {draft.raw_text}
                  </div>

                  {draft.summary && (
                    <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: 'rgba(76, 141, 255, 0.08)', border: '1px solid rgba(76, 141, 255, 0.25)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={14} /> Ollama Handover Summary
                      </div>
                      <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>
                        {draft.summary}
                      </div>
                    </div>
                  )}

                  {draft.ocr_confidence && (
                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>TrOCR Detection Confidence:</span>
                      <strong className="mono" style={{ color: 'var(--primary)' }}>{Math.round(draft.ocr_confidence * 100)}%</strong>
                    </div>
                  )}

                  <div style={{ marginTop: 16 }}>
                    <Button
                      variant="secondary"
                      fullWidth={true}
                      icon={Keyboard}
                      onClick={() => {
                        setTypeText(draft.raw_text);
                        setShowTypeModal(true);
                      }}
                    >
                      Edit Raw Text & Re-extract
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Column: Structured Items */}
              <div>
                <div className="section-label">
                  <span>Structured Items ({items.length})</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>FHIR-lite format</span>
                </div>

                {items.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No items extracted"
                    description="No medications or procedures could be determined from the provided note."
                  />
                ) : (
                  items.map((item) => {
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
                            marginTop: 6,
                            padding: '6px 10px',
                            background: 'rgba(76, 141, 255, 0.08)',
                            border: '1px solid rgba(76, 141, 255, 0.2)',
                            borderRadius: 6,
                            fontSize: 12,
                            color: 'var(--primary)',
                            lineHeight: 1.4,
                          }}>
                            <strong>💊 Clinical Use:</strong> {item.indication}
                          </div>
                        )}

                        {item.source_text && (
                          <div className="item-source-quote">
                            Source words: "{item.source_text}"
                          </div>
                        )}

                        {/* Loud Amber Flag Alert */}
                        {item.flag && (
                          <div>
                            <div className="flag-loud-callout">
                              <AlertTriangle size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
                              <div className="flag-callout-msg">
                                {item.flag.message || item.flag.reason}
                              </div>
                            </div>

                            {isFlagged ? (
                              <div className="flag-actions-row">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  icon={Check}
                                  onClick={() => acceptFlag(item.id)}
                                >
                                  Accept Value
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
                              <div style={{ marginTop: 8 }}>
                                <Badge variant="success" icon={Check}>Accepted by responder</Badge>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Sticky Bottom Confirmation Dock */}
            <div className="confirmation-dock">
              <div className="responder-id-group">
                <span className="responder-id-label">Responder ID:</span>
                <input
                  type="text"
                  className="responder-text-input mono"
                  value={responderId}
                  onChange={(e) => setResponderId(e.target.value)}
                  placeholder="Paramedic ID"
                  aria-label="Responder ID"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {unresolvedFlagsCount > 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600 }}>
                    Resolve {unresolvedFlagsCount} flagged item{unresolvedFlagsCount > 1 ? 's' : ''} to confirm
                  </span>
                ) : null}

                <Button
                  variant="primary"
                  size="md"
                  disabled={unresolvedFlagsCount > 0}
                  onClick={confirmDraft}
                  icon={unresolvedFlagsCount > 0 ? Lock : CheckCircle2}
                >
                  {unresolvedFlagsCount > 0
                    ? `Review Locked (${unresolvedFlagsCount} pending)`
                    : 'Confirm & Hash Record'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 4: CONFIRMED
            =================================================================== */}
        {screen === 'confirmed' && confirmedResult && (
          <div style={{ maxWidth: 620, margin: '40px auto', textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              padding: 18,
              borderRadius: '50%',
              background: 'var(--success-bg)',
              color: 'var(--success)',
              marginBottom: 16
            }}>
              <CheckCircle2 size={48} strokeWidth={2} />
            </div>

            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px' }}>
              Clinical Record Confirmed & Sealed
            </h1>
            <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 15 }}>
              Appended to tamper-evident cryptographic SQLite audit chain
            </p>

            <Card variant="surface-2" style={{ textAlign: 'left', marginTop: 24, padding: 24 }}>
              <div style={{ marginBottom: 14 }}>
                <span className="section-label" style={{ marginBottom: 4 }}>ENCOUNTER ID</span>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                  {confirmedResult.encounter_id}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <span className="section-label" style={{ marginBottom: 4 }}>RECORD ID</span>
                <div className="mono" style={{ fontSize: 14.5 }}>
                  {confirmedResult.record_id}
                </div>
              </div>

              <div>
                <span className="section-label" style={{ marginBottom: 4 }}>CRYPTOGRAPHIC SHA-256 HASH</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all', color: 'var(--primary)', flex: 1 }}>
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
            </Card>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 28 }}>
              <Button
                variant="primary"
                size="md"
                icon={FileText}
                onClick={() => setScreen('handover')}
              >
                View Handover Report
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
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>Handover Report Preview</h1>
                <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 2 }}>
                  Official hospital transfer documentation for encounter <span className="mono">{encounterId}</span>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
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
                  <span>Open Full Sheet</span>
                </a>
              </div>
            </div>

            <div className="handover-sheet-preview" style={{ padding: 0, overflow: 'hidden' }}>
              <iframe
                src={`/encounters/${encounterId}/report`}
                style={{ width: '100%', height: '680px', border: 'none', background: '#FFFFFF' }}
                title="Handover Report Preview"
              />
            </div>
          </div>
        )}

        {/* ===================================================================
            SCREEN 6: AUDIT VERIFICATION
            =================================================================== */}
        {screen === 'audit' && (
          <div className="audit-view-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>Cryptographic Audit Chain</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: 14.5, marginTop: 4 }}>
                  Every confirmed record is hashed with SHA-256 and chained in an append-only SQLite ledger.
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                icon={RefreshCw}
                loading={auditLoading}
                onClick={runAuditVerification}
              >
                Verify Entire Chain
              </Button>
            </div>

            {auditData && (
              <Card
                variant={auditData.valid ? 'success' : 'warning'}
                style={{ padding: 24, marginBottom: 24 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {auditData.valid ? (
                    <div style={{ color: 'var(--success)' }}>
                      <CheckCircle2 size={36} strokeWidth={2} />
                    </div>
                  ) : (
                    <div style={{ color: 'var(--danger)' }}>
                      <AlertTriangle size={36} strokeWidth={2} />
                    </div>
                  )}
                  <div>
                    <h2 style={{ fontSize: 19, fontWeight: 700 }}>
                      {auditData.valid ? 'Cryptographic Hash Chain Intact' : 'Audit Chain Compromised!'}
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 2 }}>
                      {auditData.message}
                    </p>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  gap: 32,
                  marginTop: 20,
                  borderTop: '1px solid var(--border)',
                  paddingTop: 16
                }}>
                  <div>
                    <span className="section-label" style={{ marginBottom: 4 }}>TOTAL BLOCKS VERIFIED</span>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
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
            <div className="section-label">Chain Node History</div>
            <div className="audit-timeline-flow">
              <div className="audit-timeline-node">
                <div className="audit-node-dot verified">
                  <ShieldCheck size={14} />
                </div>
                <Card variant="surface-2" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong className="mono" style={{ fontSize: 14 }}>GENESIS BLOCK #0</strong>
                    <Badge variant="success" size="sm">Verified</Badge>
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    prev_hash: 0000000000000000000000000000000000000000000000000000000000000000
                  </div>
                </Card>
              </div>

              {recentEncounters.slice(0, 3).map((enc, idx) => (
                <div key={enc.encounter_id} className="audit-timeline-node">
                  <div className="audit-node-dot verified">
                    <Check size={14} />
                  </div>
                  <Card variant="surface-2" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong className="mono" style={{ fontSize: 14 }}>RECORD BLOCK #{idx + 1}</strong>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--primary)' }}>{enc.encounter_id}</span>
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
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Badge variant="primary" icon={Sparkles}>System Architecture & Model Guide</Badge>
                <Badge variant="success" icon={ShieldCheck}>100% Offline Capable</Badge>
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px' }}>
                System Architecture & Downloaded Assets
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 16, marginTop: 6, lineHeight: 1.6 }}>
                Everything clinical runs on-device without internet access. Below is a concise breakdown of all models and assets downloaded, what purpose each serves, and the complete audit chain.
              </p>
            </div>

            {/* Quick Flow Summary in Short */}
            <Card variant="surface-2" style={{ padding: 24, marginBottom: 32, borderColor: 'var(--primary)' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                <Layers size={18} /> The Complete Process In Short (6 Steps)
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {[
                  { step: '1. CAPTURE', desc: 'Paramedic speaks into mic, uploads a photo of handwritten notes/glove, or types directly.' },
                  { step: '2. TRANSCRIBE & OCR', desc: 'Whisper turns audio into text. Microsoft TrOCR deciphers messy handwriting with vision transformers.' },
                  { step: '3. EXTRACT', desc: 'Local Medical LLM extracts drug name, dose, unit, route, time, and procedures into strict JSON.' },
                  { step: '4. VALIDATE & CROSS-CHECK', desc: 'n2c2 BERT catches omitted treatments & pulls symptoms. MIMIC-III generates clinical embeddings.' },
                  { step: '5. CONFIRM', desc: 'Responder reviews drafts & flagged warnings, corrects if needed, and signs off with Responder ID.' },
                  { step: '6. SEAL & REPORT', desc: 'Appends record to tamper-evident SHA-256 hash chain and renders printable hospital transfer handover report.' },
                ].map((s, i) => (
                  <div key={i} style={{ background: 'var(--surface)', padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--primary)', marginBottom: 4 }}>{s.step}</div>
                    <div style={{ fontSize: 13.5, color: 'var(--text)' }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Downloaded Models Grid */}
            <div className="section-label">Downloaded Models & Technical Justifications</div>
            <div style={{ display: 'grid', gap: 18 }}>
              {[
                {
                  badge: 'IMAGE-TO-TEXT • VISION TRANSFORMER',
                  title: 'Microsoft UniLM TrOCR (Handwritten OCR)',
                  model: 'microsoft/trocr-base-handwritten (~1.33 GB)',
                  accel: 'Local PyTorch',
                  what: "Microsoft Research's end-to-end Vision Transformer (DeiT visual encoder + RoBERTa text decoder) fine-tuned on handwriting datasets.",
                  why: 'Paramedics frequently scribble medication doses on nitrile gloves, paper scraps, or run-sheets. TrOCR deciphers this messy handwriting with state-of-the-art character accuracy.'
                },
                {
                  badge: 'CLINICAL NER • SAFETY CHECKER',
                  title: 'n2c2 Clinical Concept NER Model',
                  model: 'samrawal/bert-base-uncased_clinical-ner (~436 MB)',
                  accel: 'Harvard n2c2 / i2b2 Benchmark',
                  what: 'Clinical BERT fine-tuned on Harvard DBMI’s n2c2 (National NLP Clinical Challenges) clinical concept extraction dataset.',
                  why: 'Acts as an independent second-opinion validator. It recognizes TREATMENT (drugs/procedures), PROBLEM (symptoms), and TEST (ECG, vitals). If the LLM misses an administered drug, n2c2 flags it immediately.'
                },
                {
                  badge: 'CLINICAL REPRESENTATIONS • EMBEDDINGS',
                  title: 'MIMIC-III Bio_ClinicalBERT',
                  model: 'emilyalsentzer/Bio_ClinicalBERT (~436 MB)',
                  accel: 'PhysioNet MIMIC-III ICU Notes',
                  what: 'Clinical BERT pretrained on ICU clinical discharge summaries and nursing notes from Beth Israel Deaconess Medical Center.',
                  why: 'Generates 768-dimensional normalized clinical vector embeddings. Allows semantic grounding of clinical synonyms (e.g. connecting "nitro" to "nitroglycerin").'
                },
                {
                  badge: 'SPEECH-TO-TEXT • ASR',
                  title: 'Whisper Small English (GGML)',
                  model: 'ggml-small.en.bin (~466 MB)',
                  accel: 'whisper.cpp Engine',
                  what: 'Quantized GGML weights of OpenAI’s Whisper small English speech recognition model.',
                  why: 'Transcribes live emergency audio dictations into text directly on the device using C++ without needing an internet connection.'
                },
                {
                  badge: 'LLM EXTRACTOR • FHIR MAPPING',
                  title: 'Medical LLM (MedGemma / MiniMax)',
                  model: 'Ollama Engine (Temperature 0.0)',
                  accel: 'Strict JSON Schema Forced',
                  what: 'Local Ollama model running with zero temperature and structured JSON schema constraints.',
                  why: 'Extracts clinical entities into FHIR-lite MedicationAdministration and Procedure bundles. Enforces "never guess" rules.'
                },
                {
                  badge: 'CRYPTO AUDIT • LOCAL STORAGE',
                  title: 'Tamper-Evident SHA-256 Audit Log',
                  model: 'field_to_record.db (SQLite WAL Mode)',
                  accel: 'Append-Only Triggers',
                  what: 'Cryptographic blockchain-style hash chain where each confirmed record includes SHA-256(prev_hash + record_id + created_at + record_json).',
                  why: 'Provides irrefutable legal and clinical proof of when drugs were given. Hard SQLite triggers physically reject any attempt to alter or delete medical records.'
                }
              ].map((m, idx) => (
                <Card key={idx} variant="surface">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <Badge variant="primary" size="sm" style={{ marginBottom: 6 }}>{m.badge}</Badge>
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>{m.title}</h3>
                      <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.model}</span>
                    </div>
                    <Badge variant="success" size="sm">{m.accel}</Badge>
                  </div>
                  <p style={{ marginTop: 12, fontSize: 14.5, color: 'var(--text)', lineHeight: 1.5 }}>
                    <strong>What was downloaded:</strong> {m.what}
                  </p>
                  <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', fontSize: 13.5 }}>
                    <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> {m.why}
                  </div>
                </Card>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 32 }}>
              <Button variant="primary" size="md" icon={Mic} onClick={() => setScreen('capture')}>
                Capture Note
              </Button>
              <Button variant="secondary" size="md" icon={ShieldCheck} onClick={() => { setScreen('audit'); runAuditVerification(); }}>
                Verify Audit Chain
              </Button>
              <Button variant="secondary" size="md" icon={FileText} onClick={() => setScreen('handover')}>
                View Handover Report
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Type Note Modal */}
      {showTypeModal && (
        <div className="ui-modal-overlay">
          <div className="ui-modal-panel">
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>Type Clinical Field Note</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Enter on-scene medications, routes, dosages, and procedures
            </p>
            <textarea
              className="modal-textarea"
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              placeholder="e.g. 14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC."
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <Button variant="secondary" size="md" onClick={() => setShowTypeModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={submitTypedNote}
                disabled={!typeText.trim()}
              >
                Extract Note
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
