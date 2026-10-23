import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Check
} from 'lucide-react';

async function calculateSha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CLINICAL_RECORDS = [
  {
    num: 1,
    time: '14:02 EST',
    badge: 'SCENE INTAKE',
    text: 'Patient assessment initiated. 64-year-old male, conscious, severe retrosternal chest pain. 12-lead shows anterior STEMI pattern.',
  },
  {
    num: 2,
    time: '14:22 EST',
    badge: 'TREATMENT GIVEN',
    text: 'Administered chewable Aspirin 324 mg PO. Established 18-gauge IV in left AC fossa with normal saline flush.',
    tamperedText: 'Administered chewable Aspirin 648 mg PO [ALTERED DOSAGE]. Established 18-gauge IV in left AC fossa with normal saline flush.',
  },
  {
    num: 3,
    time: '14:35 EST',
    badge: 'ED HANDOVER',
    text: 'Patient transferred to St. Jude Cath Lab team with signed digital handover. Vital signs stable at SBP 138/84, HR 78.',
  },
];

export default function TamperDemoSection() {
  const [blocks, setBlocks] = useState([]);
  const [isTampered, setIsTampered] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyIndex, setVerifyIndex] = useState(-1);

  // Compute live SHA-256 chain using browser Web Crypto API
  const buildChain = async (recordsList, tampered = false) => {
    const chain = [];
    let prev = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < recordsList.length; i++) {
      const rec = recordsList[i];
      const textToUse = (tampered && i === 1 && rec.tamperedText) ? rec.tamperedText : rec.text;
      const payload = `${prev}:${rec.num}:${rec.time}:${textToUse}`;
      const hash = await calculateSha256(payload);

      chain.push({
        num: rec.num,
        time: rec.time,
        badge: rec.badge,
        text: textToUse,
        prevHash: prev,
        hash: hash,
        isBroken: tampered && i >= 1,
        isTamperedOrigin: tampered && i === 1,
      });

      prev = hash;
    }
    return chain;
  };

  // Initial load
  useEffect(() => {
    buildChain(CLINICAL_RECORDS, false).then(setBlocks);
  }, []);

  // Action: Simulate Tampering with Entry #2
  const handleTamper = async () => {
    setIsTampered(true);
    const brokenChain = await buildChain(CLINICAL_RECORDS, true);
    setBlocks(brokenChain);
  };

  // Action: Verify Chain (Step-by-step audit sweep)
  const handleVerify = () => {
    setIsVerifying(true);
    setVerifyIndex(0);

    let idx = 0;
    const interval = setInterval(() => {
      idx += 1;
      setVerifyIndex(idx);
      if (idx >= blocks.length) {
        clearInterval(interval);
        setTimeout(() => {
          setIsVerifying(false);
          setVerifyIndex(-1);
        }, 1000);
      }
    }, 350);
  };

  // Action: Reset
  const handleReset = async () => {
    setIsTampered(false);
    setIsVerifying(false);
    setVerifyIndex(-1);
    const freshChain = await buildChain(CLINICAL_RECORDS, false);
    setBlocks(freshChain);
  };

  return (
    <section id="tamper-demo" className="tamper-demo-section">
      <div className="tamper-section-header">
        <div className="section-eyebrow-pill">
          <ShieldCheck size={14} color="var(--accent)" />
          <span>Tamper-Evident Audit Ledger</span>
        </div>

        <h2 className="tamper-display-title">
          Change one word, and the entire <em>chain</em> breaks.
        </h2>

        <p className="tamper-lead-text">
          Every confirmed clinical note is hashed with SHA-256 and cryptographically bound to the
          previous record. If a single character is altered after signing, mathematical verification fails instantly.
        </p>

        {/* Humanlike Action Buttons */}
        <div className="tamper-actions-row">
          <button
            type="button"
            className="clinical-action-btn btn-primary-verify"
            onClick={handleVerify}
            disabled={isVerifying}
          >
            <CheckCircle2 size={15} />
            <span>{isVerifying ? 'Verifying Hashes...' : 'Verify Ledger Integrity'}</span>
          </button>

          {!isTampered ? (
            <button
              type="button"
              className="clinical-action-btn btn-secondary-tamper"
              onClick={handleTamper}
            >
              <AlertTriangle size={15} />
              <span>Simulate Altering Entry #2</span>
            </button>
          ) : (
            <button
              type="button"
              className="clinical-action-btn btn-secondary-reset"
              onClick={handleReset}
            >
              <RefreshCw size={15} />
              <span>Restore Original Record</span>
            </button>
          )}
        </div>

        {/* Clean, Humanlike Status Strip */}
        <div className="tamper-status-strip">
          {!isTampered ? (
            <div className="status-indicator-box status-ok">
              <CheckCircle2 size={16} color="var(--success)" style={{ flexShrink: 0 }} />
              <span>
                <strong>All 3 records verified:</strong> Hashes match digital signatures. Chain is intact.
              </span>
            </div>
          ) : (
            <div className="status-indicator-box status-alert">
              <AlertOctagon size={16} color="var(--danger)" style={{ flexShrink: 0 }} />
              <span>
                <strong>Hash mismatch detected:</strong> Entry #2 dosage was modified. Cryptographic chain broken.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 3 Clinical Cards Container (Fits Screen Naturally · Zero Horizontal Scroll) */}
      <div className="clinical-chain-container">
        {blocks.map((block, idx) => {
          const isSweepActive = verifyIndex === idx;
          const isBroken = block.isBroken;
          const isOrigin = block.isTamperedOrigin;

          return (
            <React.Fragment key={block.num}>
              {/* Connector between cards */}
              {idx > 0 && (
                <div className={`chain-step-connector ${isBroken ? 'connector-broken' : 'connector-intact'}`}>
                  <svg className="connector-svg" viewBox="0 0 44 20" fill="none">
                    <path
                      d="M0 10 H14 L18 3 L22 17 L26 7 L30 10 H44"
                      stroke={isBroken ? 'var(--danger)' : isSweepActive ? '#FFFFFF' : 'var(--accent)'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}

              {/* Individual Clinical Record Card */}
              <div
                className={`clinical-record-card ${
                  isBroken ? 'card-broken' : 'card-intact'
                } ${isOrigin ? 'card-tampered-origin' : ''} ${
                  isSweepActive ? 'card-sweep-active' : ''
                }`}
              >
                {/* Header */}
                <div className="record-card-top">
                  <div className="record-id-wrap">
                    <span className="record-number-tag mono">RECORD {block.num}</span>
                    <span className="record-badge-type">{block.badge}</span>
                  </div>
                  <span className="record-time-tag mono">{block.time}</span>
                </div>

                {/* Patient / Clinical Care Content */}
                <div className="record-content-box">
                  <p className={`record-narrative-text ${isOrigin ? 'altered-text-alert' : ''}`}>
                    "{block.text}"
                  </p>
                </div>

                {/* Cryptographic Hash Summary */}
                <div className="record-crypto-bar mono">
                  <div className="crypto-row">
                    <span className="crypto-label">PREV HASH:</span>
                    <span className="crypto-hash-val" title={block.prevHash}>
                      {block.prevHash ? block.prevHash.slice(0, 12) + '…' : '000000000000…'}
                    </span>
                  </div>
                  <div className="crypto-row">
                    <span className="crypto-label">BLOCK HASH:</span>
                    <span className={`crypto-hash-val ${isBroken ? 'text-broken' : 'text-secure'}`} title={block.hash}>
                      {block.hash ? block.hash.slice(0, 12) + '…' : 'computing…'}
                    </span>
                  </div>
                </div>

                {/* Status Footer */}
                <div className="record-card-status">
                  {isBroken ? (
                    <span className="status-tag-broken mono">
                      <AlertOctagon size={12} />
                      {isOrigin ? 'DATA ALTERED' : 'CHAIN LINK BROKEN'}
                    </span>
                  ) : (
                    <span className="status-tag-sealed mono">
                      <ShieldCheck size={12} />
                      SIGNED & VERIFIED
                    </span>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}
