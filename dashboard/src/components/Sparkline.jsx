/** Encounters-per-day sparkline, drawn to scale from real data. */
export default function Sparkline({ values }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  const pts = values.map((v, i) => [(i * 400) / Math.max(1, n - 1), 92 - (v / max) * 80]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" viewBox="0 0 400 100" preserveAspectRatio="none" role="img" aria-label={`Encounters per day for the last ${n} days, peak ${max}`}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E7A5C" stopOpacity=".25" />
          <stop offset="1" stopColor="#0E7A5C" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="rgba(12,27,34,.08)" />)}
      <path d={`${line} L400 100 L0 100Z`} fill="url(#spark-fill)" />
      <path d={line} fill="none" stroke="#0E7A5C" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="4" fill="#0E7A5C" />
    </svg>
  );
}
