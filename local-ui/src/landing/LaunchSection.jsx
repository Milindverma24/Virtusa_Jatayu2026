import React from 'react';
import {
  ArrowRight,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Lock
} from 'lucide-react';

export default function LaunchSection({ onOpenApp }) {
  return (
    <section id="launch-section" className="launch-unique-section">
      {/* Background Lighting Aura */}
      <div className="launch-ambient-glow" aria-hidden="true" />

      <div className="launch-unique-container">
        {/* Mission Ready Indicator */}
        <div className="launch-status-pill">
          <span className="pulse-dot-teal" />
          <span>Offline System Armed · Standalone Fast Mode</span>
        </div>

        {/* Cinematic Headline */}
        <h2 className="launch-unique-title">
          In the golden hour, every second matters.<br />
          <em>So does the record.</em>
        </h2>

        <p className="launch-unique-sub">
          No cloud dependency. No erased notes. No guesswork hours later.<br />
          Immediate, structured medical handover the moment the ambulance doors open.
        </p>

        {/* Single Confident Action (No secondary 'inspect audit chain') */}
        <div className="launch-action-wrap">
          <button
            type="button"
            className="launch-main-button"
            onClick={onOpenApp}
          >
            <span>Open Sanjeevani Lekh</span>
            <ArrowRight size={18} strokeWidth={2.4} />
          </button>

          <div className="launch-sub-note mono">
            <span>Runs 100% in browser RAM</span>
            <span className="note-dot">·</span>
            <span>Zero cloud telemetry</span>
            <span className="note-dot">·</span>
            <span>Works completely offline</span>
          </div>
        </div>

        {/* Unique Clinical Ledger Seal Badge */}
        <div className="field-seal-badge mono">
          <div className="seal-badge-left">
            <ShieldCheck size={15} color="var(--accent)" />
            <span>FIELD-TO-RECORD DEPLOYMENT</span>
          </div>
          <span className="seal-badge-divider">·</span>
          <span className="seal-badge-hash">ENC: B1F073D8 · SHA-256 LEDGER INTACT</span>
        </div>
      </div>

      {/* Minimalist Clinical Footer */}
      <footer className="landing-site-footer">
        <div className="footer-inner-content">
          <div className="footer-brand-meta">
            <div className="footer-logo-mark">
              <Activity size={15} strokeWidth={2.5} />
            </div>
            <span className="footer-brand-name">Sanjeevani Lekh</span>
            <span className="footer-divider-dot">·</span>
            <span className="footer-desc">Field-to-Record Paramedic Documentation</span>
          </div>

          <div className="footer-compliance-tags mono">
            <span>FHIR-Lite</span>
            <span className="footer-divider-dot">·</span>
            <span>100% On-Device</span>
            <span className="footer-divider-dot">·</span>
            <span>SHA-256 Tamper-Proof Chain</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
