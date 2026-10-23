/** Swimlane board: one lane per vehicle, one block per encounter, last 12 hours. */
export default function ShiftBoard({ encounters, now }) {
  const HOURS = 12;
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);
  const startMs = end.getTime() - HOURS * 3600000;
  const spanMs = HOURS * 3600000;
  const pct = (ms) => ((ms - startMs) / spanMs) * 100;

  const devices = Array.from(new Set(encounters.map((e) => e.device_id)));
  const lanes = devices.map((d) => ({
    id: d,
    blocks: encounters
      .filter((e) => e.device_id === d)
      .map((e) => {
        const a = new Date(e.first_created).getTime();
        const b = Math.max(new Date(e.last_created).getTime(), a + 10 * 60000);
        return { id: e.encounter_id, left: pct(a), width: ((b - a) / spanMs) * 100, visible: b >= startMs && a <= end.getTime() };
      })
      .filter((b) => b.visible),
  }));
  const any = lanes.some((l) => l.blocks.length);
  const labels = Array.from({ length: HOURS }, (_, i) => String(new Date(startMs + i * 3600000).getHours()).padStart(2, '0'));
  const nowPct = pct(now);

  return (
    <div className="card board">
      <div className="card-head" style={{ marginBottom: 20 }}>
        <span className="eyebrow">Shift timeline · last {HOURS} hours</span>
      </div>
      <div className="board-axis"><span /><div className="ticks">{labels.map((h, i) => <span key={i}>{h}</span>)}</div></div>
      {any ? (
        <div className="board-lanes">
          {lanes.map((l) => (
            <div className="board-lane" key={l.id}>
              <div className="nm" title={l.id}><i />{l.id}</div>
              <div className="board-track">
                {l.blocks.map((b) => (
                  <span
                    key={b.id}
                    className="board-blk"
                    title={b.id}
                    style={{ left: `${Math.max(0, b.left)}%`, width: `${Math.max(0.5, Math.min(b.width, 100 - Math.max(0, b.left)))}%` }}
                  >
                    {b.id.slice(0, 8)}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 124, right: 0, pointerEvents: 'none' }}>
            <div className="board-now" style={{ left: `${nowPct}%` }} />
          </div>
        </div>
      ) : (
        <p className="board-empty">No encounters in the last {HOURS} hours. Older ones are in the table below.</p>
      )}
    </div>
  );
}
