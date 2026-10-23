'use client';

import { useEffect, useState } from 'react';

export default function IntegrityRing({ total }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const C = 2 * Math.PI * 38;
  return (
    <div className="ring-row">
      <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden="true">
        <circle cx="46" cy="46" r="38" fill="none" stroke="var(--surface-border)" strokeWidth="5" />
        <circle
          cx="46" cy="46" r="38" fill="none" stroke="var(--success)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={on ? 0 : C} transform="rotate(-90 46 46)"
          style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div>
        <div className="eyebrow">Chain integrity</div>
        <div className="ring-title">{total} {total === 1 ? 'record' : 'records'} in chain</div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>Verify the hashes in Audit Explorer</div>
      </div>
    </div>
  );
}
