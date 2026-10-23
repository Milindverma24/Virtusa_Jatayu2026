'use client';

import { useEffect, useRef, useState } from 'react';

function useCountUp(target) {
  const [value, setValue] = useState(typeof target === 'number' ? target : 0);
  useEffect(() => {
    if (typeof target !== 'number') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / 1200, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

/** Stat tile with a count-up number and a soft cursor spotlight. `value` may be a number or a node. */
export default function StatCard({ label, value, color }) {
  const ref = useRef(null);
  const counted = useCountUp(value);
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
    ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <div className="stat-card" ref={ref} onPointerMove={onMove}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={color ? { color } : undefined}>
        {typeof value === 'number' ? counted : value}
      </div>
    </div>
  );
}
