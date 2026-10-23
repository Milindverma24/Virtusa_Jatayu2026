import React, { useEffect, useRef, useState } from 'react';
import { clamp } from './lpUtils';

const EVENTS = [
  { t: 52320, label: '14:32', hr: 94, sp: 96 },
  { t: 52440, label: '14:34', hr: 98, sp: 96 },
  { t: 52680, label: '14:38', hr: 104, sp: 95 },
  { t: 53040, label: '14:44', hr: 101, sp: 97 },
  { t: 53460, label: '14:51', hr: 88, sp: 98 },
];
const START = 52200; // 14:30:00

const fmt = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return [h, m, x].map((n) => String(n).padStart(2, '0')).join(':');
};

export default function TimelineSection() {
  const cardRefs = useRef([]);
  const [state, setState] = useState({ t: EVENTS[0].t, f: 0, a: 0 });
  const stampRef = useRef(null);
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    const update = () => {
      const mid = window.innerHeight * 0.5;
      const cs = cardRefs.current.map((e) => {
        if (!e) return 0;
        const r = e.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      let idx = 0;
      cs.forEach((c, i) => { if (c <= mid + 40) idx = i; });
      const a = clamp(idx, 0, EVENTS.length - 1);
      const b = Math.min(a + 1, EVENTS.length - 1);
      let t;
      let f;
      if (cs[0] > mid) { t = EVENTS[0].t; f = 0; }
      else if (a === b) { t = EVENTS[a].t; f = a / (EVENTS.length - 1); }
      else {
        const u = clamp((mid - cs[a]) / (cs[b] - cs[a]), 0, 1);
        t = EVENTS[a].t + (EVENTS[b].t - EVENTS[a].t) * u;
        f = (a + u) / (EVENTS.length - 1);
      }
      setState((s) => (s.a === a && Math.abs(s.t - t) < 0.5 && Math.abs(s.f - f) < 0.002 ? s : { t, f, a }));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);

  useEffect(() => {
    if (!stampRef.current) return undefined;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { setStamped(true); io.disconnect(); } });
    }, { threshold: 1 });
    io.observe(stampRef.current);
    return () => io.disconnect();
  }, []);

  const set = (i) => (el) => { cardRefs.current[i] = el; };
  const cur = EVENTS[state.a];

  return (
    <section className="pad sheetUp mon" id="timeline">
      <div className="wrap">
        <div className="head">
          <div className="eyebrow rv">One call, start to handover</div>
          <h2 className="rv" style={{ '--d': 1 }}>Scroll through nineteen minutes on scene.</h2>
          <p className="rv" style={{ '--d': 2 }}>The clock follows you down the page. Each step is something the system does for the responder.</p>
        </div>
        <div className="tl">
          <div className="tl-side">
            <div className="clock tnum">{fmt(state.t)}<small>T+{fmt(Math.max(state.t - START, 0))} · ENC-4CAAE434</small></div>
            <div className="rail">
              {Array.from({ length: 41 }, (_, k) => (k % 10 ? <i key={k} style={{ top: `${(k / 40) * 100}%` }} /> : null))}
              {EVENTS.map((e, i) => (
                <React.Fragment key={e.label}>
                  <i className="m" style={{ top: `${(i / 4) * 100}%` }} />
                  <span className={`lb${state.a === i ? ' on' : ''}`} style={{ top: `${(i / 4) * 100}%` }}>{e.label}</span>
                </React.Fragment>
              ))}
              <span className="pin" style={{ top: `${state.f * 100}%` }} />
            </div>
            <div className="mini">
              <div><b>{cur.hr}</b><small>HR</small></div>
              <div><b>{cur.sp}</b><small>SpO₂</small></div>
            </div>
          </div>
          <div className="evs">
            <article className={`pcard ev${state.a === 0 ? ' act' : ''}`} ref={set(0)}>
              <div className="tag">14:32 · CAPTURE</div>
              <h3>Said once, heard on the device.</h3>
              <p className="d">Aspirin goes in, the words come out as text, and nothing is sent anywhere.</p>
              <div className="ttxt">“gave aspirin three twenty-four milligrams by mouth, chewed”</div>
            </article>
            <article className={`pcard ev${state.a === 1 ? ' act' : ''}`} ref={set(1)}>
              <div className="tag">14:34 · EXTRACT</div>
              <h3>Pulled out, then checked against your words.</h3>
              <p className="d">Every value must appear in the original note, or it does not get filled in.</p>
              <div className="chk">
                {[['drug', 'Aspirin'], ['dose', '324 mg'], ['route', 'PO'], ['time', '14:32']].map(([k, v]) => (
                  <div key={k}><span>{k}</span><span>{v}</span><b className="ok">✓ in note</b></div>
                ))}
              </div>
            </article>
            <article className={`pcard ev${state.a === 2 ? ' act' : ''}`} ref={set(2)}>
              <div className="tag">14:38 · FLAG</div>
              <h3>Missing stays missing.</h3>
              <p className="d">“Nitro point four” has no unit. The system asks you instead of choosing one.</p>
              <div className="chk">
                <div><span>drug</span><span>Nitroglycerin</span><b className="ok">✓ in note</b></div>
                <div><span>dose</span><span>0.4</span><b className="ok">✓ in note</b></div>
                <div><span>unit</span><span>not heard</span><b className="no">! confirm</b></div>
              </div>
            </article>
            <article className={`pcard ev${state.a === 3 ? ' act' : ''}`} ref={set(3)}>
              <div className="tag">14:44 · SAFETY NET</div>
              <h3>A second model reads over its shoulder.</h3>
              <p className="d">A clinical language model tags treatments, problems and tests, then looks for anything the extractor skipped.</p>
              <div className="ner">Applied <u className="t">oxygen 4 L</u> via nasal cannula for <u className="p">acute chest pain</u>, <u className="x">12-lead ECG</u> done.</div>
              <div className="legend">
                <span><i style={{ background: 'var(--herb)' }} />treatment</span>
                <span><i style={{ background: 'var(--alert)' }} />problem</span>
                <span><i style={{ background: 'var(--test)' }} />test</span>
              </div>
              <div className="sugg">! Possible omitted treatment: oxygen 4 L</div>
            </article>
            <article className={`pcard ev${state.a === 4 ? ' act' : ''}`} ref={set(4)}>
              <div className="tag">14:51 · HANDOVER</div>
              <h3>A report that can prove itself.</h3>
              <p className="d">The hospital gets a printable summary with the hash of the last record on it.</p>
              <div className="rep">
                <div>ASPIRIN 324 mg PO · 14:32<br />IV ACCESS 18G L AC · 14:34<br />NITROGLYCERIN 0.4 mg SL · 14:38<br />hash #9f3a7c21e04b · chain verified</div>
                <span className={`stamp${stamped ? ' thunk' : ''}`} ref={stampRef}>Verified</span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
