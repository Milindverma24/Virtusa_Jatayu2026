import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Activity,
  ShieldCheck,
  Cpu,
  UserCheck,
  WifiOff,
  Radio,
  Pill,
  Syringe,
  Clock,
  Volume2,
  Check,
  Sparkles,
  Heart,
  Zap,
  MapPin,
  Mic,
  FileText,
  Lock,
  Play,
  RotateCcw,
  Sliders,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon } from '@hugeicons/core-free-icons';

const DICTATION_SCRIPT = [
  { text: "64-year-old male, conscious, severe retrosternal chest pain radiating to left jaw, 8 out of 10. Diaphoretic. ", type: "intro" },
  { text: "At 14:32:04, gave chewable aspirin 324 mg by mouth... ", type: "aspirin" },
  { text: "established 18-gauge IV in left antecubital fossa with normal saline flush... ", type: "iv" },
  { text: "administered 0.4 milligrams sublingual nitroglycerin spray, repeat vitals pending. ", type: "nitro" },
  { text: "Transporting priority Code 3 to Cath Lab, ETA 6 minutes.", type: "outro" }
];

const FULL_TEXT = DICTATION_SCRIPT.map(s => s.text).join("");

export default function HeroSection({ onOpenApp, onOpenDocs }) {
  const [typedLen, setTypedLen] = useState(0);
  const [showAspirin, setShowAspirin] = useState(false);
  const [showIV, setShowIV] = useState(false);
  const [showNitro, setShowNitro] = useState(false);
  const [flagResolved, setFlagResolved] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(true);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isVisibleRef = useRef(true);
  const charIndexRef = useRef(0);

  // Pause heavy rendering when scrolled out of viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.05 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Natural speech typewriter synchronized with clinical ePCR extraction
  useEffect(() => {
    let charTimer;
    let loopTimeout;

    const runLoop = () => {
      setTypedLen(0);
      charIndexRef.current = 0;
      setShowAspirin(false);
      setShowIV(false);
      setShowNitro(false);
      setFlagResolved(false);
      setIsPlayingAudio(true);

      const total = FULL_TEXT.length;

      charTimer = setInterval(() => {
        if (!isVisibleRef.current) return;
        charIndexRef.current += 1;
        const cur = charIndexRef.current;
        setTypedLen(cur);

        // Milestone 1: Aspirin completed (~160 chars)
        if (cur >= 160 && !showAspirin) {
          setShowAspirin(true);
        }
        // Milestone 2: IV completed (~240 chars)
        if (cur >= 240 && !showIV) {
          setShowIV(true);
        }
        // Milestone 3: Nitro completed (~325 chars)
        if (cur >= 325 && !showNitro) {
          setShowNitro(true);
        }

        if (cur >= total) {
          clearInterval(charTimer);
          setIsPlayingAudio(false);
          loopTimeout = setTimeout(() => {
            runLoop();
          }, 5500);
        }
      }, 35);
    };

    runLoop();

    return () => {
      clearInterval(charTimer);
      clearTimeout(loopTimeout);
    };
  }, []);

  // Full-width Multi-Trace Clinical Physiological Monitor (Lead II, SpO2 Pleth, and VOX Audio)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let sweepX = 0;
    let timeTick = 0;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      if (!isVisibleRef.current) {
        animId = requestAnimationFrame(draw);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      timeTick += 1;

      // Clean background with very subtle clinical scanline atmosphere
      ctx.clearRect(0, 0, w, h);

      // Subtle medical grid (1mm / 5mm scale)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 20;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 3 Baselines for the 3 distinct physiological channels
      const yECG = h * 0.25;    // Top channel: Lead II ECG
      const yPleth = h * 0.58;  // Middle channel: SpO2 Plethysmograph
      const yAudio = h * 0.85;  // Bottom channel: Microphone Audio Modulation

      // Channel divider hairline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.42);
      ctx.lineTo(w, h * 0.42);
      ctx.moveTo(0, h * 0.73);
      ctx.lineTo(w, h * 0.73);
      ctx.stroke();

      const period = 260; // Heartbeat distance in pixels (~78 BPM)

      // ==========================================
      // CHANNEL 1: LEAD II ECG (Phosphor Emerald/Teal)
      // ==========================================
      ctx.beginPath();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = '#2DD4BF';
      ctx.shadowColor = 'rgba(45, 212, 191, 0.7)';
      ctx.shadowBlur = 6;

      for (let x = 0; x <= w; x += 2) {
        const beatPos = (x + timeTick * 1.8) % period;
        let y = yECG;

        if (beatPos > 35 && beatPos < 55) {
          // P Wave (Atrial depolarization)
          y = yECG - Math.sin(((beatPos - 35) / 20) * Math.PI) * 5;
        } else if (beatPos >= 60 && beatPos < 65) {
          // Q Dip
          y = yECG + 4;
        } else if (beatPos >= 65 && beatPos < 76) {
          // R Spike (Ventricular depolarization)
          y = yECG - 26;
        } else if (beatPos >= 76 && beatPos < 84) {
          // S Dip
          y = yECG + 8;
        } else if (beatPos >= 105 && beatPos < 135) {
          // T Wave (Ventricular repolarization)
          y = yECG - Math.sin(((beatPos - 105) / 30) * Math.PI) * 8;
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ==========================================
      // CHANNEL 2: SPO2 PLETHYSMOGRAPH (Ocean Cyan)
      // ==========================================
      ctx.beginPath();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#38BDF8';
      ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = 5;

      for (let x = 0; x <= w; x += 2) {
        const beatPos = (x + timeTick * 1.8) % period;
        let y = yPleth;

        if (beatPos >= 68 && beatPos < 160) {
          const t = (beatPos - 68) / 92;
          // Arterial pulse with dicrotic notch
          const primary = Math.sin(t * Math.PI) * 15;
          const dicrotic = (t > 0.45 && t < 0.75) ? Math.sin(((t - 0.45) / 0.3) * Math.PI) * 4.5 : 0;
          y = yPleth - primary + dicrotic;
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ==========================================
      // CHANNEL 3: LIVE AUDIO MODULATION (Warm Amber)
      // ==========================================
      ctx.beginPath();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#F59E0B';
      ctx.shadowColor = 'rgba(245, 158, 11, 0.5)';
      ctx.shadowBlur = 4;

      const isSpeaking = charIndexRef.current < FULL_TEXT.length;

      for (let x = 0; x <= w; x += 3) {
        let wave = 0;
        if (isSpeaking) {
          const freq1 = Math.sin((x + timeTick * 3) * 0.08);
          const freq2 = Math.cos((x * 0.15) - timeTick * 2);
          const freq3 = Math.sin((x + timeTick) * 0.22);
          wave = (freq1 * 4.5 + freq2 * 3.5 + freq3 * 2.5);
        } else {
          wave = Math.sin((x + timeTick) * 0.05) * 1.2;
        }

        const y = yAudio + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.shadowBlur = 0;

      // ==========================================
      // PHOSPHOR SWEEP BAR (Authentic Medical CRT Sweep)
      // ==========================================
      sweepX = (timeTick * 2.2) % w;

      const sweepWidth = 28;
      const eraseGrad = ctx.createLinearGradient(sweepX, 0, sweepX + sweepWidth, 0);
      eraseGrad.addColorStop(0, 'rgba(9, 13, 19, 0.95)');
      eraseGrad.addColorStop(1, 'rgba(9, 13, 19, 0)');
      ctx.fillStyle = eraseGrad;
      ctx.fillRect(sweepX, 0, sweepWidth, h);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#2DD4BF';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(sweepX, 6);
      ctx.lineTo(sweepX, h - 6);
      ctx.stroke();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  const displayedText = FULL_TEXT.slice(0, typedLen);

  return (
    <section id="hero" className="landing-hero-section" ref={containerRef}>
      {/* Background ambient lighting */}
      <div className="hero-radial-glow" aria-hidden="true" />

      {/* Main Headline & Lead */}
      <div className="hero-content-wrap">
        <div className="hero-badge-pill">
          <Activity size={14} className="hero-badge-pulse" />
          <span>Offline Mission-Critical Clinical Documentation</span>
        </div>

        <h1 className="hero-display-title">
          Say it once. It becomes the <em>record</em>.
        </h1>

        <p className="hero-lead-text">
          Sanjeevani Lekh turns a paramedic's chaotic field notes into structured, human-confirmed
          medical records, offline, and sealed so nothing can be changed quietly.
        </p>

        {/* CTA Group */}
        <div className="hero-cta-group">
          <button
            type="button"
            className="hero-primary-btn"
            onClick={onOpenApp}
          >
            <span>Open the app</span>
            <ArrowRight size={15} strokeWidth={2.2} />
          </button>
          <a
            href="/docs"
            onClick={(e) => {
              if (onOpenDocs) {
                e.preventDefault();
                onOpenDocs();
              }
            }}
            className="hero-docs-btn"
            title="Read System Architecture & Documentation"
            aria-label="Documentation"
          >
            <BookOpen size={15} strokeWidth={2.2} />
            <span>Documentation</span>
          </a>
          <a
            href="https://github.com/Milindverma24/Virtusa_Jatayu2026"
            target="_blank"
            rel="noopener noreferrer"
            className="hero-github-btn"
            title="View Project on GitHub"
            aria-label="View Project on GitHub"
          >
            <HugeiconsIcon icon={GithubIcon} size={15} strokeWidth={2} />
            <span>GitHub</span>
          </a>
        </div>
      </div>

      {/* =====================================================================
          SCREEN-WIDE LIVE CLINICAL ECG WAVEFORM (CLEAN · FULL SCREEN FIT · NO UNWANTED LABELS)
          ===================================================================== */}
      <div className="hero-telemetry-fullwidth" aria-label="Real-time Lead II ECG and Physiological Telemetry">
        <div className="telemetry-canvas-container">
          <canvas ref={canvasRef} className="fullwidth-telemetry-canvas" />
        </div>
      </div>

      {/* =====================================================================
          TWO-SIDED CLINICAL TRANSFORMATION (HUMAN INPUT -> STRUCTURED RECORD)
          ===================================================================== */}
      <div id="hero-demo" className="hero-transformation-wrap">
        <div className="clinical-transformation-grid">
          {/* LEFT: Humanlike Paramedic Field Audio Stream */}
          <div className="dictation-panel">
            <div className="panel-header-strip">
              <div className="panel-title-group">
                <div className="medic-avatar-chip">
                  <Mic size={16} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="panel-main-title">Spoken Field Dictation</div>
                  <div className="panel-sub-title mono">Continuous Offline Speech Recognition</div>
                </div>
              </div>
              <span className="audio-live-pill mono">
                <span className="rec-beacon" /> {isPlayingAudio ? "RECORDING" : "AUDIO READY"}
              </span>
            </div>

            {/* Audio Waveform Scrubber */}
            <div className="audio-player-bar mono">
              <div className="audio-play-indicator">
                <Radio size={13} color="var(--accent)" />
                <span className="time-scrub">00:14 / 00:26</span>
              </div>
              <div className="mini-equalizer-bars">
                {[40, 70, 95, 60, 30, 85, 100, 75, 45, 90, 65, 35, 55, 80].map((h, i) => (
                  <span
                    key={i}
                    className="mini-bar"
                    style={{
                      height: `${h}%`,
                      animationDelay: `${(i * 0.08).toFixed(2)}s`
                    }}
                  />
                ))}
              </div>
              <span className="noise-cancel-tag">Ambient Noise Filtered</span>
            </div>

            {/* Real Paramedic Verbal Dictation with Color-Coded Entity Linking */}
            <div className="dictation-speech-card">
              <div className="speech-meta-bar mono">
                <span>[14:32:00] FIELD TRANSCRIPT</span>
                <span style={{ color: 'var(--accent)' }}>OFFLINE LOCAL MODEL</span>
              </div>

              <div className="human-dictated-text">
                <span className="text-intro">
                  “64-year-old male, conscious, severe retrosternal chest pain radiating to left jaw, 8 out of 10. Diaphoretic.{" "}
                </span>

                {/* Highlighted Aspirin Span */}
                {typedLen >= 160 ? (
                  <span className="entity-highlight hl-aspirin">
                    At 14:32:04, gave chewable aspirin 324 mg by mouth
                    <span className="hl-chip mono">14:32:04</span>
                  </span>
                ) : (
                  <span>{displayedText.slice(107, 160)}</span>
                )}

                {/* Highlighted IV Access Span */}
                {typedLen > 160 && (
                  typedLen >= 240 ? (
                    <span className="entity-highlight hl-iv">
                      ... established 18-gauge IV in left antecubital fossa with normal saline flush
                      <span className="hl-chip mono">14:32:38</span>
                    </span>
                  ) : (
                    <span>{displayedText.slice(160, 240)}</span>
                  )
                )}

                {/* Highlighted Nitro Span with Safety Trigger */}
                {typedLen > 240 && (
                  typedLen >= 325 ? (
                    <span className="entity-highlight hl-nitro">
                      ... administered 0.4 milligrams sublingual nitroglycerin spray
                      <span className="hl-chip chip-warn mono">TIME NOT STATED ⚠️</span>
                    </span>
                  ) : (
                    <span>{displayedText.slice(240, 325)}</span>
                  )
                )}

                {typedLen >= 325 && (
                  <span className="text-outro">
                    , repeat vitals pending. Transporting priority Code 3 to Cath Lab, ETA 6 minutes.”
                  </span>
                )}

                <span className="natural-type-cursor" aria-hidden="true" />
              </div>

              <div className="speech-card-footer mono">
                <span className="acoustic-confidence">Acoustic Word Error Rate: 0.0%</span>
                <span>100% Offline On-Device Processing</span>
              </div>
            </div>
          </div>

          {/* RIGHT: High-Precision Structured Clinical Record */}
          <div className="handover-panel">
            <div className="panel-header-strip">
              <div>
                <div className="panel-main-title">Structured Clinical Record</div>
                <div className="panel-sub-title mono">FHIR-Compliant Schema · Hash Chained</div>
              </div>
              <span className="chain-badge-sealed mono">
                <ShieldCheck size={13} /> {flagResolved ? "SEALED IN CHAIN" : "REVIEW PENDING"}
              </span>
            </div>

            <div className="structured-records-container">
              {/* Record 1: Aspirin Administration */}
              <div className={`epcr-resource-card ${showAspirin ? 'card-shown' : 'card-hidden'}`}>
                <div className="resource-card-header">
                  <span className="resource-type-badge type-med">
                    <Pill size={12} strokeWidth={2.5} /> MEDICATION ADMINISTRATION
                  </span>
                  <span className="resource-audit-status mono">
                    <CheckCircle2 size={12} color="var(--success)" /> VERIFIED & CONFIRMED
                  </span>
                </div>

                <div className="resource-body">
                  <div className="resource-name-row">
                    <span className="resource-primary-name">Aspirin (Chewable)</span>
                    <span className="resource-rx-chip mono">RxNorm: 1191</span>
                  </div>

                  <div className="resource-grid-metrics mono">
                    <div className="metric-cell">
                      <span className="metric-tag">DOSE</span>
                      <strong className="metric-data text-blue">324 mg</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">ROUTE</span>
                      <strong className="metric-data">Oral (Chewed)</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">TIME</span>
                      <strong className="metric-data">14:32:04 EST</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">INDICATION</span>
                      <strong className="metric-data text-blue">ACS / STEMI</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Record 2: Procedure - IV Cannulation */}
              <div className={`epcr-resource-card ${showIV ? 'card-shown' : 'card-hidden'}`}>
                <div className="resource-card-header">
                  <span className="resource-type-badge type-proc">
                    <Syringe size={12} strokeWidth={2.5} /> VASCULAR ACCESS PROCEDURE
                  </span>
                  <span className="resource-audit-status mono">
                    <CheckCircle2 size={12} color="var(--success)" /> RECORDED & CONFIRMED
                  </span>
                </div>

                <div className="resource-body">
                  <div className="resource-name-row">
                    <span className="resource-primary-name">Peripheral IV Cannulation</span>
                    <span className="resource-rx-chip mono">18 Gauge (Green)</span>
                  </div>

                  <div className="resource-grid-metrics mono">
                    <div className="metric-cell">
                      <span className="metric-tag">ANATOMY</span>
                      <strong className="metric-data text-teal">Left AC Fossa</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">FLUID</span>
                      <strong className="metric-data">NS 10mL Flush</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">TIME</span>
                      <strong className="metric-data">14:32:38 EST</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">STATUS</span>
                      <strong className="metric-data text-teal">Patent / Flushed</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Record 3: Nitroglycerin (Flagged: Time Missing - Never-Guess Safety Rule) */}
              <div className={`epcr-resource-card card-attention-flag ${showNitro ? 'card-shown' : 'card-hidden'}`}>
                <div className="resource-card-header">
                  <span className="resource-type-badge type-flagged">
                    <Pill size={12} strokeWidth={2.5} /> MEDICATION · SAFETY AUDIT
                  </span>
                  <span className={`resource-audit-status mono ${flagResolved ? 'text-success' : 'flag-amber'}`}>
                    {flagResolved ? (
                      <>
                        <CheckCircle2 size={12} color="var(--success)" /> CONFIRMED BY PARAMEDIC
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={12} color="var(--warning)" /> CONFIRMATION LOCKED
                      </>
                    )}
                  </span>
                </div>

                <div className="resource-body">
                  <div className="resource-name-row">
                    <span className="resource-primary-name">Nitroglycerin Sublingual Spray</span>
                    <span className="resource-rx-chip mono">RxNorm: 7052</span>
                  </div>

                  <div className="resource-grid-metrics mono">
                    <div className="metric-cell">
                      <span className="metric-tag">DOSE</span>
                      <strong className="metric-data text-amber">0.4 mg (1 spray)</strong>
                    </div>
                    <div className="metric-cell">
                      <span className="metric-tag">ROUTE</span>
                      <strong className="metric-data">Sublingual (SL)</strong>
                    </div>
                    <div className={`metric-cell ${flagResolved ? 'cell-resolved' : 'cell-flagged'}`}>
                      <span className="metric-tag">ADMIN TIME</span>
                      <strong className="metric-data">{flagResolved ? "14:33:05 EST" : "NOT STATED ⚠️"}</strong>
                    </div>
                  </div>

                  {/* High-visibility Safety Audit Banner with One-Click Resolution */}
                  <div className={`audit-flag-callout ${flagResolved ? 'callout-resolved' : ''}`}>
                    <div className="callout-text-row">
                      <AlertTriangle size={15} color={flagResolved ? "var(--success)" : "var(--warning)"} style={{ flexShrink: 0 }} />
                      <span className="callout-msg">
                        {flagResolved ? (
                          <span><strong>Time verified:</strong> Paramedic confirmed administration at 14:33:05 EST. Ready to seal block.</span>
                        ) : (
                          <span><strong>Never-guess policy:</strong> Administration timestamp omitted from verbal report. Paramedic review required.</span>
                        )}
                      </span>
                    </div>

                    {!flagResolved ? (
                      <div className="callout-action-chips">
                        <button
                          type="button"
                          className="chip-btn-stamp"
                          onClick={() => setFlagResolved(true)}
                          title="Auto-stamp current incident time"
                        >
                          <Check size={12} /> Auto-stamp 14:33:05
                        </button>
                        <button
                          type="button"
                          className="chip-btn-custom"
                          onClick={() => setFlagResolved(true)}
                        >
                          <Clock size={12} /> Enter Custom Time
                        </button>
                      </div>
                    ) : (
                      <div className="callout-resolved-note mono">
                        <CheckCircle2 size={13} color="var(--success)" /> Digitally signed by responder (14:33:05 EST)
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!showAspirin && !showIV && !showNitro && (
                <div className="empty-stream-placeholder mono">
                  <div className="pulse-loader" />
                  <span>Streaming verbal dictation into local clinical model...</span>
                </div>
              )}
            </div>

            {/* Cryptographic Ledger Block Seal Bar */}
            <div className="handover-seal-strip mono">
              <div className="seal-left">
                <span className="seal-block-num">BLOCK #0482</span>
                <span className="seal-hash">SHA256: 8f2c9e4a11b084e7…c7e2</span>
              </div>
              <div className="seal-status-tag">
                <ShieldCheck size={13} color="var(--accent)" />
                <span>HASH CHAIN SECURED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Badges Row */}
      <div className="hero-trust-row" id="trust-row">
        <div className="trust-item">
          <WifiOff size={15} strokeWidth={1.8} className="trust-icon" />
          <span>100% Offline Capable</span>
        </div>
        <span className="trust-sep">·</span>
        <div className="trust-item">
          <Cpu size={15} strokeWidth={1.8} className="trust-icon" />
          <span>Local On-Device Clinical NLP</span>
        </div>
        <span className="trust-sep">·</span>
        <div className="trust-item">
          <UserCheck size={15} strokeWidth={1.8} className="trust-icon" />
          <span>Human-in-the-Loop Locked</span>
        </div>
        <span className="trust-sep">·</span>
        <div className="trust-item">
          <ShieldCheck size={15} strokeWidth={1.8} className="trust-icon" />
          <span>SHA-256 Tamper-Evident Ledger</span>
        </div>
      </div>
    </section>
  );
}
