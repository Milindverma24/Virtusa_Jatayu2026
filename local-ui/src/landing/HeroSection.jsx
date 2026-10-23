import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { prefersReducedMotion, sleep } from './lpUtils';

const NOTE = [
  ['14:32', 'gave aspirin 324 mg PO chewed', 'Aspirin 324 mg PO'],
  ['14:34', 'IV 18 gauge left AC', 'IV access 18G L AC'],
  ['14:38', 'nitro point four under the tongue', 'Nitroglycerin 0.4 SL'],
];
const TECH = ['Whisper.cpp', 'MedGemma', 'n2c2 clinical NER', 'Bio_ClinicalBERT', 'FHIR-lite', 'SQLite WAL', 'SHA-256 chain', 'Next.js dashboard', 'Supabase'];

function useHeroEcg(canvasRef) {
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const reduce = prefersReducedMotion();
    let W = 0;
    let H = 0;
    let x = 0;
    let ys = [];
    let raf = 0;
    const g = (t, c, w, a) => a * Math.exp(-Math.pow((t - c) / w, 2));
    const yAt = (px) => {
      const t = (px % 260) / 260;
      return H * 0.62 - (g(t, 0.18, 0.035, 0.12) - g(t, 0.36, 0.012, 0.14) + g(t, 0.39, 0.014, 1) - g(t, 0.42, 0.014, 0.3) + g(t, 0.64, 0.05, 0.22)) * H * 0.5;
    };
    const size = () => {
      const d = window.devicePixelRatio || 1;
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * d;
      cv.height = H * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ys = new Array(Math.max(1, Math.floor(W))).fill(null);
      x = 0;
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(75,242,162,.07)';
      ctx.lineWidth = 1;
      for (let i = 0; i < W; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
      for (let j = 0; j < H; j += 20) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke(); }
      ctx.strokeStyle = '#4BF2A2';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#4BF2A2';
      ctx.shadowBlur = 8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < ys.length; k++) {
        if (ys[k] == null) { started = false; continue; }
        if (!started) { ctx.moveTo(k, ys[k]); started = true; } else ctx.lineTo(k, ys[k]);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    size();
    window.addEventListener('resize', size);
    if (reduce) {
      for (let i = 0; i < ys.length; i++) ys[i] = yAt(i);
      draw();
    } else {
      const tick = () => {
        for (let s = 0; s < 2; s++) {
          ys[x] = yAt(x);
          x = (x + 1) % ys.length;
          for (let j = 0; j < 18; j++) ys[(x + j) % ys.length] = null;
        }
        draw();
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [canvasRef]);
}

export function TickerStrip() {
  const trRef = useRef(null);
  useEffect(() => {
    const el = trRef.current;
    if (!el || prefersReducedMotion()) return undefined;
    let tx = 0;
    let vel = 0;
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => { vel = window.scrollY - last; last = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    const tick = () => {
      const w = el.scrollWidth / 3;
      vel *= 0.9;
      tx -= 0.6 + Math.abs(vel) * 0.15;
      if (-tx > w) tx += w;
      el.style.transform = `translateX(${tx}px)`;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onScroll); };
  }, []);
  const words = [...TECH, ...TECH, ...TECH];
  return (
    <div className="ticker mon" aria-hidden="true">
      <div className="tr" ref={trRef}>{words.map((w, i) => <span key={i}>{w}</span>)}</div>
    </div>
  );
}

export default function HeroSection({ onOpenApp }) {
  const ecgRef = useRef(null);
  const compRef = useRef(null);
  const monRef = useRef(null);
  const sheetRef = useRef(null);
  const sayRef = useRef(null);
  const linesRef = useRef(null);
  const footRef = useRef(null);
  const vitalsRef = useRef({});
  useHeroEcg(ecgRef);

  // Vitals drift
  useEffect(() => {
    const id = setInterval(() => {
      const v = vitalsRef.current;
      if (v.hr) v.hr.textContent = 80 + Math.round(Math.random() * 5);
      if (v.sp) v.sp.textContent = 96 + Math.round(Math.random() * 2);
      if (v.bp) v.bp.textContent = `${126 + Math.round(Math.random() * 4)}/${80 + Math.round(Math.random() * 3)}`;
    }, 2200);
    return () => clearInterval(id);
  }, []);

  // Dictation -> run sheet loop
  useEffect(() => {
    const say = sayRef.current;
    const lines = linesRef.current;
    const foot = footRef.current;
    if (!say || !lines || !foot) return undefined;
    let dead = false;
    const row = (n, on) => {
      const d = document.createElement('div');
      d.className = `ln${on ? ' on' : ''}`;
      d.innerHTML = `<span>${n[0]}</span><em>${n[2]}</em>`;
      return d;
    };
    if (prefersReducedMotion()) {
      NOTE.forEach((n) => lines.appendChild(row(n, true)));
      foot.innerHTML = '<span class="stamp">Confirmed</span>';
      return undefined;
    }
    (async () => {
      while (!dead) {
        lines.innerHTML = '';
        foot.innerHTML = '';
        for (let i = 0; i < NOTE.length && !dead; i++) {
          say.innerHTML = '<span></span><span class="c"></span>';
          const tgt = say.firstChild;
          const s = `${NOTE[i][0]} ${NOTE[i][1]}`;
          for (let c = 0; c < s.length && !dead; c++) { tgt.textContent += s[c]; await sleep(28); }
          await sleep(380);
          const r = row(NOTE[i], false);
          lines.appendChild(r);
          await sleep(30);
          r.classList.add('on');
          await sleep(500);
        }
        if (dead) return;
        say.innerHTML = '<span style="color:var(--herb)">✓ all values found in your words · hash #9f3a7c21</span>';
        foot.innerHTML = '<span class="stamp thunk">Confirmed</span>';
        await sleep(4200);
      }
    })();
    return () => { dead = true; };
  }, []);

  const onMove = (e) => {
    if (prefersReducedMotion() || !compRef.current) return;
    const r = compRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    monRef.current.style.setProperty('--ry', `${x * 7}deg`);
    monRef.current.style.setProperty('--rx', `${-y * 6}deg`);
    sheetRef.current.style.setProperty('--px', `${x * -14}px`);
    sheetRef.current.style.setProperty('--py', `${y * -10}px`);
  };
  const onLeave = () => {
    if (!monRef.current || !sheetRef.current) return;
    ['--ry', '--rx'].forEach((k) => monRef.current.style.setProperty(k, '0deg'));
    ['--px', '--py'].forEach((k) => sheetRef.current.style.setProperty(k, '0'));
  };

  return (
    <header className="hero" id="hero">
      <div className="ruler" aria-hidden="true"><div className="wrap"><span>25 mm/s</span><span>10 mm/mV</span><span>EMS RUN SHEET</span></div></div>
      <div className="wrap hero-in">
        <div>
          <div className="eyebrow rv">Offline clinical record for first responders</div>
          <h1 className="rv" style={{ '--d': 1 }}>The run sheet that <span className="u">writes itself</span>.</h1>
          <p className="lead rv" style={{ '--d': 2 }}>Say what you gave, type it, or photograph the note on your glove. You get a timestamped record you can hand over and nobody can quietly change. No signal needed.</p>
          <div className="cta rv" style={{ '--d': 3 }}>
            <button type="button" className="btn pri" data-cur onClick={() => onOpenApp && onOpenApp('/app')}>
              Open the field app <ArrowRight size={14} strokeWidth={2} />
            </button>
            <a className="btn" href="#tamper-demo" data-cur>Try to tamper with a record</a>
          </div>
          <div className="deva-mark rv" style={{ '--d': 4 }}>संजीवनी <small>the herb that revives · lekh, a written record</small></div>
        </div>
        <div className="comp rv" style={{ '--d': 2 }} ref={compRef} onPointerMove={onMove} onPointerLeave={onLeave}>
          <div className="monitor mon" ref={monRef}>
            <div className="mhead"><span>MEDIC-07 · AMBULANCE 01</span><span style={{ color: 'var(--herb)' }}>● LIVE</span></div>
            <div className="vit">
              <div><small>HR</small><b ref={(el) => { vitalsRef.current.hr = el; }}>82</b><i>bpm</i></div>
              <div><small>SpO₂</small><b ref={(el) => { vitalsRef.current.sp = el; }}>97</b><i>%</i></div>
              <div><small>NIBP</small><b ref={(el) => { vitalsRef.current.bp = el; }}>128/82</b></div>
            </div>
            <canvas id="hecg" ref={ecgRef} aria-hidden="true" />
            <div className="say" ref={sayRef} aria-hidden="true" />
          </div>
          <div className="sheet" ref={sheetRef}>
            <h4><span>Medication &amp; procedures</span><span>ENC-4CAAE434</span></h4>
            <div ref={linesRef} />
            <div className="foot" ref={footRef} />
          </div>
        </div>
      </div>
    </header>
  );
}
