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
  Sparkles
} from 'lucide-react';

function generateEncounterId() {
  const chars = '0123456789ABCDEF';
  let id = 'ENC-';
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export default function App() {
  const [screen, setScreen] = useState('capture'); // 'capture' | 'processing' | 'review' | 'confirmed' | 'handover' | 'audit'
  const [encounterId, setEncounterId] = useState(generateEncounterId());
  const [responderId, setResponderId] = useState('Medic-07');
  
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
  const [items, setItems] = useState([]); // Array of { id, type, name, dose, unit, route, time, source_text, isFlagged, flagReason }
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

        parsed.push({
          id: itemId,
          type: 'medication',
          name: drug,
          dose: dose !== undefined ? dose : '',
          unit: unit,
          route: route,
          time: time,
          source_text: source_text,
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

  // Start Mic
  // Start Mic & Live Speech-to-Text
  const startRecording = async () => {
    try {
      setLiveTranscript('');
      liveTranscriptRef.current = '';

      // Start Web Speech API in parallel if supported
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
          // Instant direct processing with fast extractor
          submitDirectText(captured);
        } else {
          // Fallback to audio upload / whisper.cpp
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

  // Submit direct transcribed text for instant report generation
  const submitDirectText = async (textToProcess) => {
    setScreen('processing');
    setProcessingSteps([
      { title: 'Speech transcribed to text', status: 'done', ms: 40 },
      { title: 'Extracting medications & procedures…', status: 'loading' },
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
        { title: 'Speech transcribed to text', status: 'done' },
        { title: `Extracted items (${draftData.timings_ms.extract} ms)`, status: 'done' },
        { title: `Validated safety rules (${draftData.timings_ms.validate} ms)`, status: 'done' },
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
      { title: 'Transcribing speech with whisper.cpp…', status: 'loading' },
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
        { title: 'Audio received', status: 'done' },
        { title: `Transcribed (${draftData.timings_ms.transcribe} ms)`, status: 'done' },
        { title: `Extracted items (${draftData.timings_ms.extract} ms)`, status: 'done' },
        { title: `Validated safety rules (${draftData.timings_ms.validate} ms)`, status: 'done' },
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
      { title: 'Text note received', status: 'done' },
      { title: 'Extracting clinical medications and procedures…', status: 'loading' },
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
        { title: 'Text received', status: 'done' },
        { title: `Extracted items (${draftData.timings_ms.extract} ms)`, status: 'done' },
        { title: `Validated (${draftData.timings_ms.validate} ms)`, status: 'done' },
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
      { title: 'Image photo received', status: 'done' },
      { title: 'Running offline OCR with EasyOCR…', status: 'loading' },
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
        { title: 'Image received', status: 'done' },
        { title: `OCR completed (${draftData.timings_ms.transcribe} ms)`, status: 'done' },
        { title: `Extracted items (${draftData.timings_ms.extract} ms)`, status: 'done' },
        { title: `Validated (${draftData.timings_ms.validate} ms)`, status: 'done' },
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

  return (
    <div className="app-wrapper">
      {/* Top Header */}
      <header className="app-header">
        <div className="brand-title">
          <span>🚑 Sanjeevani Lekh</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
            {encounterId}
          </span>
        </div>
        <div className="header-status">
          {serviceHealth?.ollama_running && serviceHealth?.model_available ? (
            <div className="status-pill verified" title={`Connected to online Ollama model: ${serviceHealth.model_name}`}>
              <span style={{ fontSize: 9, color: 'var(--success)' }}>●</span> Ollama: {serviceHealth.model_name}
            </div>
          ) : (
            <div className="status-pill offline">
              <span style={{ fontSize: 9 }}>●</span> Standalone Fast Mode
            </div>
          )}
          <button
            className="status-pill verified"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setScreen('audit');
              runAuditVerification();
            }}
          >
            <ShieldCheck size={14} /> Audit Chain
          </button>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="nav-tabs">
        <button
          className={`nav-tab ${screen === 'capture' ? 'active' : ''}`}
          onClick={() => setScreen('capture')}
        >
          <Mic size={15} /> Capture
        </button>
        {draft && (
          <button
            className={`nav-tab ${screen === 'review' ? 'active' : ''}`}
            onClick={() => setScreen('review')}
          >
            <AlertTriangle size={15} /> Review Draft
            {unresolvedFlagsCount > 0 && (
              <span style={{ background: 'var(--warning)', color: '#000', borderRadius: '50%', padding: '1px 6px', fontSize: 11 }}>
                {unresolvedFlagsCount}
              </span>
            )}
          </button>
        )}
        <button
          className={`nav-tab ${screen === 'handover' ? 'active' : ''}`}
          onClick={() => setScreen('handover')}
        >
          <FileText size={15} /> Handover Report
        </button>
        <button
          className={`nav-tab ${screen === 'audit' ? 'active' : ''}`}
          onClick={() => {
            setScreen('audit');
            runAuditVerification();
          }}
        >
          <ShieldCheck size={15} /> Audit Verification
        </button>
        <button
          className={`nav-tab ${screen === 'docs' ? 'active' : ''}`}
          onClick={() => setScreen('docs')}
        >
          <BookOpen size={15} /> Docs & Architecture
        </button>
      </nav>

      {/* Main Content Body */}
      <main className="main-content">
        {/* SCREEN 1: CAPTURE */}
        {screen === 'capture' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700 }}>Record Field Observation</h2>
              <p style={{ color: 'var(--muted)', fontSize: 15, marginTop: 4 }}>
                Hold to speak, type a quick note, or capture a vital monitor photo
              </p>
            </div>

            {/* Mode Switcher */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{
                background: 'var(--surface-alt)',
                border: '1px solid var(--surface-border)',
                borderRadius: 20,
                padding: 3,
                display: 'inline-flex',
                gap: 4
              }}>
                <button
                  type="button"
                  onClick={() => setRecordMode('tap')}
                  style={{
                    background: recordMode === 'tap' ? 'var(--primary)' : 'transparent',
                    color: recordMode === 'tap' ? '#FFF' : 'var(--muted)',
                    border: 'none',
                    borderRadius: 16,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Click to Speak (Hands-free)
                </button>
                <button
                  type="button"
                  onClick={() => setRecordMode('hold')}
                  style={{
                    background: recordMode === 'hold' ? 'var(--primary)' : 'transparent',
                    color: recordMode === 'hold' ? '#FFF' : 'var(--muted)',
                    border: 'none',
                    borderRadius: 16,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Hold to Speak (PTT)
                </button>
              </div>
            </div>

            {/* Central Mic Button */}
            <div className="mic-button-wrapper">
              <button
                className={`mic-button ${isRecording ? 'recording' : ''}`}
                onClick={recordMode === 'tap' ? (isRecording ? stopRecording : startRecording) : undefined}
                onMouseDown={recordMode === 'hold' ? startRecording : undefined}
                onMouseUp={recordMode === 'hold' ? stopRecording : undefined}
                onTouchStart={recordMode === 'hold' ? startRecording : undefined}
                onTouchEnd={recordMode === 'hold' ? stopRecording : undefined}
              >
                <Mic size={48} />
                <span className="mic-label">
                  {isRecording
                    ? (recordMode === 'tap' ? 'Click to Finish & Generate Report' : 'Release to Finish')
                    : (recordMode === 'tap' ? 'Click to Speak' : 'Hold to Speak')}
                </span>
              </button>

              {isRecording && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <div className="recording-timer mono" style={{ display: 'inline-block' }}>
                    REC 00:{recordSeconds < 10 ? `0${recordSeconds}` : recordSeconds}
                  </div>
                  {recordMode === 'tap' && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={stopRecording}
                        className="btn-confirm"
                        style={{ padding: '8px 18px', fontSize: 13 }}
                      >
                        ✓ Done Speaking · Generate Report
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Real-Time Live Speech Bubble */}
              {isRecording && liveTranscript && (
                <div
                  style={{
                    marginTop: 16,
                    maxWidth: 520,
                    margin: '16px auto 0',
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--primary)',
                    borderRadius: 8,
                    padding: '12px 16px',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--primary)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
                    Live Spoken Transcript
                  </div>
                  <div style={{ fontSize: 15, color: 'var(--text)', fontStyle: 'italic' }}>
                    "{liveTranscript}"
                  </div>
                </div>
              )}
            </div>

            {/* Alternative Input Buttons */}
            <div className="alt-inputs-row">
              <button className="btn-secondary" onClick={() => setShowTypeModal(true)}>
                <Keyboard size={18} /> Type Field Note
              </button>
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                <Camera size={18} /> Photo / Scan Note
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handlePhotoSelect}
              />
            </div>

            {/* Recent Encounters List */}
            {recentEncounters.length > 0 && (
              <div style={{ marginTop: 48 }}>
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 12 }}>
                  Recent Confirmed Encounters
                </h3>
                <div style={{ display: 'grid', gap: 10 }}>
                  {recentEncounters.slice(0, 5).map((enc) => (
                    <div
                      key={enc.encounter_id}
                      className="card"
                      style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, cursor: 'pointer' }}
                      onClick={() => {
                        setEncounterId(enc.encounter_id);
                        setScreen('handover');
                      }}
                    >
                      <div>
                        <strong className="mono">{enc.encounter_id}</strong>
                        <span style={{ color: 'var(--muted)', fontSize: 13, marginLeft: 12 }}>
                          {enc.record_count} items recorded
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)', fontSize: 14 }}>
                        View Handover <ChevronRight size={16} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 2: PROCESSING */}
        {screen === 'processing' && (
          <div style={{ maxWidth: 540, margin: '60px auto' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Processing Clinical Note</h2>
            <div className="card" style={{ padding: 24 }}>
              {processingSteps.map((step, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  {step.status === 'done' ? (
                    <CheckCircle2 color="var(--success)" size={22} />
                  ) : (
                    <RefreshCw className="animate-spin" color="var(--primary)" size={22} />
                  )}
                  <span style={{ fontSize: 16, fontWeight: step.status === 'done' ? 600 : 500 }}>
                    {step.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SCREEN 3: REVIEW (Core Screen) */}
        {screen === 'review' && draft && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>Review Clinical Draft</h2>
                <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>
                  Original source words are highlighted on the left. Verify every item before confirming.
                </div>
              </div>
              {unresolvedFlagsCount > 0 ? (
                <div className="flag-badge">
                  <AlertTriangle size={15} /> {unresolvedFlagsCount} items need review
                </div>
              ) : (
                <div className="status-pill verified">
                  <CheckCircle2 size={15} /> All items verified
                </div>
              )}
            </div>

            <div className="review-grid">
              {/* Left Column: What You Said */}
              <div>
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 10 }}>
                  What Was Dictated / Captured
                </h3>
                <div className="transcript-box">
                  {draft.raw_text}
                </div>

                {draft.ocr_confidence && (
                  <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
                    OCR Detection Confidence: <strong>{Math.round(draft.ocr_confidence * 100)}%</strong>
                  </div>
                )}

                <div style={{ marginTop: 16 }}>
                  <button
                    className="btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      setTypeText(draft.raw_text);
                      setShowTypeModal(true);
                    }}
                  >
                    Edit Raw Text & Re-extract
                  </button>
                </div>
              </div>

              {/* Right Column: What Was Recorded */}
              <div>
                <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', marginBottom: 10 }}>
                  Structured Items ({items.length})
                </h3>

                {items.length === 0 ? (
                  <div className="card" style={{ color: 'var(--muted)' }}>
                    No medications or procedures extracted.
                  </div>
                ) : (
                  items.map((item) => {
                    const isFlagged = item.flag && !resolvedFlags[item.id];
                    return (
                      <div key={item.id} className={`card ${isFlagged ? 'flagged' : resolvedFlags[item.id] ? 'accepted' : ''}`}>
                        <div className="item-title">
                          <span>
                            {item.time && <span className="mono" style={{ color: 'var(--muted)', marginRight: 8 }}>{item.time}</span>}
                            {item.name}
                          </span>
                          {item.type === 'medication' && (
                            <span className="mono" style={{ fontSize: 16, color: 'var(--primary)' }}>
                              {item.dose} {item.unit} · {item.route}
                            </span>
                          )}
                        </div>

                        {item.type === 'procedure' && item.details && (
                          <div className="item-details">{item.details}</div>
                        )}

                        {item.source_text && (
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontStyle: 'italic' }}>
                            Source: "{item.source_text}"
                          </div>
                        )}

                        {/* Validation Flag Warning */}
                        {item.flag && (
                          <div style={{ marginTop: 10 }}>
                            <div className="flag-badge" style={{ width: '100%' }}>
                              <AlertTriangle size={14} />
                              <span>{item.flag.message || item.flag.reason}</span>
                            </div>

                            {isFlagged && (
                              <div className="card-actions">
                                <button className="btn-small accept" onClick={() => acceptFlag(item.id)}>
                                  <Check size={14} /> Accept Value
                                </button>
                                <button className="btn-small remove" onClick={() => removeItem(item.id)}>
                                  <Trash2 size={14} /> Remove Item
                                </button>
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

            {/* Bottom Confirm Bar */}
            <div className="confirm-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>Responder ID:</span>
                <input
                  type="text"
                  className="responder-input"
                  value={responderId}
                  onChange={(e) => setResponderId(e.target.value)}
                  placeholder="e.g. Medic-07"
                />
              </div>

              <button
                className="btn-confirm"
                disabled={unresolvedFlagsCount > 0}
                onClick={confirmDraft}
              >
                <CheckCircle2 size={18} />
                {unresolvedFlagsCount > 0 ? `Review Locked (${unresolvedFlagsCount} pending)` : 'Confirm Record'}
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 4: CONFIRMED */}
        {screen === 'confirmed' && confirmedResult && (
          <div style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', padding: 16, borderRadius: '50%', background: 'var(--success-bg)', marginBottom: 16 }}>
              <CheckCircle2 size={48} color="var(--success)" />
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 700 }}>Clinical Record Confirmed & Saved</h2>
            <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 15 }}>
              Appended to tamper-evident cryptographic SQLite audit chain
            </p>

            <div className="card" style={{ textAlign: 'left', marginTop: 24, padding: 20 }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>ENCOUNTER ID:</span>
                <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{confirmedResult.encounter_id}</div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>RECORD ID:</span>
                <div className="mono" style={{ fontSize: 14 }}>{confirmedResult.record_id}</div>
              </div>
              <div>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>SHA-256 HASH:</span>
                <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--primary)' }}>
                  {confirmedResult.hash}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 24 }}>
              <button
                className="btn-confirm"
                onClick={() => setScreen('handover')}
              >
                <FileText size={18} /> View Handover Report
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setEncounterId(generateEncounterId());
                  setDraft(null);
                  setItems([]);
                  setScreen('capture');
                }}
              >
                <Plus size={18} /> New Note
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 5: HANDOVER REPORT */}
        {screen === 'handover' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Handover Report Preview</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <a
                  href={`/encounters/${encounterId}/report.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ textDecoration: 'none' }}
                >
                  <Printer size={16} /> Download PDF
                </a>
                <a
                  href={`/encounters/${encounterId}/report`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-confirm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={16} /> Open Full Printable Sheet
                </a>
              </div>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <iframe
                src={`/encounters/${encounterId}/report`}
                style={{ width: '100%', height: '640px', border: 'none', background: '#FFF' }}
                title="Handover Report Frame"
              />
            </div>
          </div>
        )}

        {/* SCREEN 6: AUDIT VERIFICATION */}
        {screen === 'audit' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700 }}>Cryptographic Audit Chain</h2>
                <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>
                  Every confirmed record is hashed and chained with SHA-256 in an append-only SQLite ledger.
                </p>
              </div>
              <button className="btn-confirm" onClick={runAuditVerification} disabled={auditLoading}>
                <RefreshCw size={16} className={auditLoading ? 'animate-spin' : ''} />
                Verify Entire Chain
              </button>
            </div>

            {auditData && (
              <div className="card" style={{ borderColor: auditData.valid ? 'var(--success)' : 'var(--danger)', padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  {auditData.valid ? (
                    <CheckCircle2 color="var(--success)" size={32} />
                  ) : (
                    <AlertTriangle color="var(--danger)" size={32} />
                  )}
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700 }}>
                      {auditData.valid ? 'Cryptographic Hash Chain Intact' : 'Audit Chain Compromised!'}
                    </h3>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                      {auditData.message}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 24, marginTop: 16, borderTop: '1px solid var(--surface-border)', paddingTop: 16 }}>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>TOTAL BLOCKS VERIFIED:</span>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 700 }}>{auditData.total_records}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>STATUS:</span>
                    <div style={{ color: auditData.valid ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                      {auditData.valid ? 'GENESIS ROOT INTACT' : 'TAMPERING DETECTED'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 5: DOCUMENTATION & SYSTEM ARCHITECTURE */}
        {screen === 'docs' && (
          <div style={{ maxWidth: 940, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span className="status-pill online" style={{ fontSize: 13 }}>
                  <Sparkles size={14} /> System Architecture & Model Guide
                </span>
                <span className="status-pill verified" style={{ fontSize: 13 }}>
                  <ShieldCheck size={14} /> 100% Offline Capable
                </span>
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' }}>
                System Architecture & Downloaded Assets
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: 16, marginTop: 6, lineHeight: 1.6 }}>
                Everything clinical runs on-device without internet access. Below is a concise breakdown of what all models and assets were downloaded, what purpose each serves, and the complete end-to-end processing pipeline.
              </p>
            </div>

            {/* Quick Flow Summary in Short */}
            <div className="card" style={{ padding: 24, marginBottom: 28, background: 'var(--surface-alt)', borderColor: 'var(--primary)' }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                <Layers size={18} /> The Complete Process In Short (6 Steps)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>1. CAPTURE</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    Paramedic speaks into mic, uploads a photo of handwritten notes/glove, or types directly.
                  </div>
                </div>
                <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>2. TRANSCRIBE & OCR</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    <strong>Whisper</strong> turns audio into text. <strong>Microsoft TrOCR</strong> deciphers messy handwriting with vision transformers.
                  </div>
                </div>
                <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>3. EXTRACT</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    Local <strong>Medical LLM</strong> extracts drug name, dose, unit, route, time, and procedures into strict JSON.
                  </div>
                </div>
                <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>4. VALIDATE & CROSS-CHECK</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    <strong>n2c2 BERT</strong> catches omitted treatments & pulls symptoms. <strong>MIMIC-III</strong> generates clinical embeddings.
                  </div>
                </div>
                <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>5. CONFIRM</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    Responder reviews drafts & flagged warnings, corrects if needed, and signs off with Responder ID.
                  </div>
                </div>
                <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 6, border: '1px solid var(--surface-border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)', marginBottom: 4 }}>6. SEAL & REPORT</div>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    Appends record to tamper-evident <strong>SHA-256 hash chain</strong> and renders printable hospital transfer handover report.
                  </div>
                </div>
              </div>
            </div>

            {/* Downloaded Models Grid */}
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={20} color="var(--primary)" /> Downloaded Models & Assets: What Each Does
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 32 }}>
              {/* Card 1: Microsoft UniLM TrOCR */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="status-pill online" style={{ fontSize: 11, marginBottom: 6 }}>
                      IMAGE-TO-TEXT • VISION TRANSFORMER
                    </span>
                    <h4 style={{ fontSize: 18, fontWeight: 700 }}>
                      Microsoft UniLM TrOCR (Handwritten OCR)
                    </h4>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                      microsoft/trocr-base-handwritten (~1.33 GB)
                    </span>
                  </div>
                  <span className="status-pill verified" style={{ fontSize: 12 }}>
                    MPS Metal Accelerated
                  </span>
                </div>
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>What was downloaded:</strong> Microsoft Research's end-to-end Vision Transformer (DeiT visual encoder + RoBERTa text decoder) fine-tuned on handwriting datasets.
                </p>
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: 14 }}>
                  <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> Paramedics frequently scribble medication doses on nitrile gloves, paper scraps, or run-sheets. TrOCR deciphers this messy handwriting with state-of-the-art character accuracy so it can be extracted into the audit trail.
                </div>
              </div>

              {/* Card 2: n2c2 Clinical NER */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="status-pill online" style={{ fontSize: 11, marginBottom: 6 }}>
                      CLINICAL NER • SAFETY CHECKER
                    </span>
                    <h4 style={{ fontSize: 18, fontWeight: 700 }}>
                      n2c2 Clinical Concept NER Model
                    </h4>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                      samrawal/bert-base-uncased_clinical-ner (~436 MB)
                    </span>
                  </div>
                  <span className="status-pill verified" style={{ fontSize: 12 }}>
                    Harvard n2c2 / i2b2 Benchmark
                  </span>
                </div>
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>What was downloaded:</strong> Clinical BERT fine-tuned on Harvard DBMI's n2c2 (National NLP Clinical Challenges) clinical concept extraction dataset.
                </p>
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: 14 }}>
                  <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> Acts as an independent second-opinion validator. It recognizes <span className="mono" style={{ color: 'var(--primary)' }}>TREATMENT</span> (drugs/procedures), <span className="mono" style={{ color: 'var(--warning)' }}>PROBLEM</span> (symptoms, chest pain, STEMI), and <span className="mono" style={{ color: 'var(--success)' }}>TEST</span> (ECG, vitals). If the LLM misses an administered drug, n2c2 flags it immediately as a potential omitted treatment.
                </div>
              </div>

              {/* Card 3: MIMIC-III Bio_ClinicalBERT */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="status-pill online" style={{ fontSize: 11, marginBottom: 6 }}>
                      CLINICAL REPRESENTATIONS • EMBEDDINGS
                    </span>
                    <h4 style={{ fontSize: 18, fontWeight: 700 }}>
                      MIMIC-III Bio_ClinicalBERT
                    </h4>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                      emilyalsentzer/Bio_ClinicalBERT (~436 MB)
                    </span>
                  </div>
                  <span className="status-pill verified" style={{ fontSize: 12 }}>
                    PhysioNet MIMIC-III ICU Notes
                  </span>
                </div>
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>What was downloaded:</strong> Clinical BERT pretrained on all ICU clinical discharge summaries and nursing notes from Beth Israel Deaconess Medical Center's MIMIC-III database.
                </p>
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: 14 }}>
                  <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> Generates 768-dimensional normalized clinical vector embeddings. This allows semantic grounding of clinical synonyms (e.g. connecting "nitro" to "nitroglycerin" or "epi" to "epinephrine") and powers semantic search.
                </div>
              </div>

              {/* Card 4: Whisper Speech Model */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="status-pill online" style={{ fontSize: 11, marginBottom: 6 }}>
                      SPEECH-TO-TEXT • ASR
                    </span>
                    <h4 style={{ fontSize: 18, fontWeight: 700 }}>
                      Whisper Small English (GGML)
                    </h4>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                      ggml-small.en.bin (~466 MB)
                    </span>
                  </div>
                  <span className="status-pill verified" style={{ fontSize: 12 }}>
                    whisper.cpp Engine
                  </span>
                </div>
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>What was downloaded:</strong> Quantized GGML weights of OpenAI's Whisper small English speech recognition model.
                </p>
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: 14 }}>
                  <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> Transcribes live emergency audio dictations into text directly on the device using C++ Metal GPU bindings without needing an internet connection.
                </div>
              </div>

              {/* Card 5: Local Medical LLM */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="status-pill online" style={{ fontSize: 11, marginBottom: 6 }}>
                      LLM EXTRACTOR • FHIR MAPPING
                    </span>
                    <h4 style={{ fontSize: 18, fontWeight: 700 }}>
                      Medical LLM (MedGemma / MiniMax)
                    </h4>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                      Ollama Engine (Temperature 0.0)
                    </span>
                  </div>
                  <span className="status-pill verified" style={{ fontSize: 12 }}>
                    Strict JSON Schema Forced
                  </span>
                </div>
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>What was downloaded:</strong> Local Ollama model running with zero temperature and structured JSON schema constraints.
                </p>
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: 14 }}>
                  <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> Extracts clinical entities into FHIR-lite MedicationAdministration and Procedure bundles. Enforces "never guess" rules: if dose, route, or unit is not explicitly stated in the words, it is left empty and flagged for human review.
                </div>
              </div>

              {/* Card 6: Tamper-Evident Database */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="status-pill online" style={{ fontSize: 11, marginBottom: 6 }}>
                      CRYPTO AUDIT • LOCAL STORAGE
                    </span>
                    <h4 style={{ fontSize: 18, fontWeight: 700 }}>
                      Tamper-Evident SHA-256 Audit Log
                    </h4>
                    <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
                      field_to_record.db (SQLite WAL Mode)
                    </span>
                  </div>
                  <span className="status-pill verified" style={{ fontSize: 12 }}>
                    Append-Only Triggers
                  </span>
                </div>
                <p style={{ marginTop: 12, fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }}>
                  <strong>What it does:</strong> Implements a cryptographic blockchain-style hash chain where each confirmed record includes <span className="mono">hash = SHA-256(prev_hash + record_id + created_at + record_json)</span>.
                </p>
                <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface-alt)', borderRadius: 6, fontSize: 14 }}>
                  <strong style={{ color: 'var(--primary)' }}>Purpose in the System:</strong> Provides irrefutable legal and clinical proof of when drugs were given. Hard SQLite triggers (<span className="mono">trig_audit_log_no_update</span> and <span className="mono">trig_audit_log_no_delete</span>) physically reject any attempt to alter or delete medical records.
                </div>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 24 }}>
              <button className="btn-confirm" onClick={() => setScreen('capture')}>
                <Mic size={16} /> Capture Note
              </button>
              <button className="btn-secondary" onClick={() => { setScreen('audit'); runAuditVerification(); }}>
                <ShieldCheck size={16} /> Verify Audit Chain
              </button>
              <button className="btn-secondary" onClick={() => setScreen('handover')}>
                <FileText size={16} /> View Handover Report
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Type Note Modal */}
      {showTypeModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 540, margin: 0, padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Type Clinical Field Note</h3>
            <textarea
              style={{
                width: '100%', height: 160, background: 'var(--surface-alt)', border: '1px solid var(--surface-border)',
                borderRadius: 6, color: 'var(--text)', padding: 12, fontSize: 15, lineHeight: 1.5, resize: 'vertical'
              }}
              value={typeText}
              onChange={(e) => setTypeText(e.target.value)}
              placeholder="e.g. 14:32 gave aspirin 324 mg PO chewed. IV 18 gauge left AC."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setShowTypeModal(false)}>
                Cancel
              </button>
              <button className="btn-confirm" onClick={submitTypedNote} disabled={!typeText.trim()}>
                Extract Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
