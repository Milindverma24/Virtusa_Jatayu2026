import React, { useEffect, useRef } from 'react';
import {
  ArrowRight,
  Activity,
  ShieldCheck,
  Cpu,
  UserCheck,
  WifiOff,
  BookOpen
} from 'lucide-react';
import { HugeiconsIcon } from '@hugeicons/react';
import { GithubIcon } from '@hugeicons/core-free-icons';

export default function HeroSection({ onOpenApp, onOpenDocs }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isVisibleRef = useRef(true);

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

  // Full-width Multi-Trace Clinical Physiological Monitor (Lead II, SpO2 Pleth, and VOX Dictation Audio)
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

      // Clean background with subtle clinical scanline atmosphere
      ctx.clearRect(0, 0, w, h);

      // Medical grid (1mm / 5mm scale)
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
      const yAudio = h * 0.85;  // Bottom channel: Paramedic Dictation Audio Modulation

      // Channel divider hairline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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
      ctx.shadowColor = 'rgba(45, 212, 191, 0.4)';
      ctx.shadowBlur = 6;

      for (let x = 0; x <= w; x += 2) {
        const beatPos = (x + timeTick * 1.8) % period;
        let y = yECG;

        if (beatPos > 35 && beatPos < 55) {
          y = yECG - Math.sin(((beatPos - 35) / 20) * Math.PI) * 5;
        } else if (beatPos >= 60 && beatPos < 65) {
          y = yECG + 4;
        } else if (beatPos >= 65 && beatPos < 76) {
          y = yECG - 26;
        } else if (beatPos >= 76 && beatPos < 84) {
          y = yECG + 8;
        } else if (beatPos >= 105 && beatPos < 135) {
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
      ctx.strokeStyle = '#4C8DFF';
      ctx.shadowColor = 'rgba(76, 141, 255, 0.4)';
      ctx.shadowBlur = 5;

      for (let x = 0; x <= w; x += 2) {
        const beatPos = (x + timeTick * 1.8) % period;
        let y = yPleth;

        if (beatPos >= 68 && beatPos < 160) {
          const t = (beatPos - 68) / 92;
          const primary = Math.sin(t * Math.PI) * 15;
          const dicrotic = (t > 0.45 && t < 0.75) ? Math.sin(((t - 0.45) / 0.3) * Math.PI) * 4.5 : 0;
          y = yPleth - primary + dicrotic;
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // ==========================================
      // CHANNEL 3: PARAMEDIC DICTATION AUDIO LINE (Warm Amber)
      // ==========================================
      ctx.beginPath();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#F5A524';
      ctx.shadowColor = 'rgba(245, 165, 36, 0.4)';
      ctx.shadowBlur = 4;

      for (let x = 0; x <= w; x += 3) {
        const freq1 = Math.sin((x + timeTick * 3) * 0.08);
        const freq2 = Math.cos((x * 0.15) - timeTick * 2);
        const freq3 = Math.sin((x + timeTick) * 0.22);
        const wave = (freq1 * 4.5 + freq2 * 3.5 + freq3 * 2.5);

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
      eraseGrad.addColorStop(0, 'rgba(9, 13, 19, 0.85)');
      eraseGrad.addColorStop(1, 'rgba(9, 13, 19, 0)');
      ctx.fillStyle = eraseGrad;
      ctx.fillRect(sweepX, 0, sweepWidth, h);

      ctx.strokeStyle = '#2DD4BF';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#4C8DFF';
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
          SCREEN-WIDE LIVE CLINICAL ECG WAVEFORM & PARAMEDIC DICTATION TELEMETRY
          ===================================================================== */}
      <div className="hero-telemetry-fullwidth" aria-label="Real-time Lead II ECG and Physiological Telemetry">
        <div className="telemetry-canvas-container">
          <canvas ref={canvasRef} className="fullwidth-telemetry-canvas" />
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
