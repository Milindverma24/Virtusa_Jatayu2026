import React, { useEffect, useMemo, useState } from 'react';
import { sha256Hex } from './lpUtils';

const RECORDS = [
  ['Aspirin', '324 mg PO'],
  ['IV access', '18G left AC'],
  ['Nitroglycerin', '0.4 mg SL'],
  ['Ondansetron', '4 mg IV'],
];
const EDITABLE = 2;

async function buildChain(values) {
  let prev = 'genesis';
  const out = [];
  for (const v of values) {
    const h = await sha256Hex(`${prev}|${v}`);
    out.push({ prev, hash: h });
    prev = h;
  }
  return out;
}

export default function TamperDemoSection() {
  const original = useMemo(() => RECORDS.map((r) => r[1]), []);
  const [values, setValues] = useState(original);
  const [baseline, setBaseline] = useState(null);
  const [chain, setChain] = useState(null);

  useEffect(() => {
    let live = true;
    buildChain(original).then((c) => { if (live) { setBaseline(c); setChain(c); } });
    return () => { live = false; };
  }, [original]);

  useEffect(() => {
    if (!baseline) return undefined;
    let live = true;
    buildChain(values).then((c) => { if (live) setChain(c); });
    return () => { live = false; };
  }, [values, baseline]);

  const broken = chain && baseline ? chain.findIndex((c, i) => c.hash !== baseline[i].hash) : -1;
  const tampered = broken >= 0;

  return (
    <section className="pad" id="tamper-demo">
      <div className="wrap">
        <div className="head">
          <div className="eyebrow rv">Tamper evidence</div>
          <h2 className="rv" style={{ '--d': 1 }}>Change one dose. See exactly where the trust ends.</h2>
          <p className="rv" style={{ '--d': 2 }}>Each record is hashed with SHA-256 together with the one before it. This is a live chain: edit the nitroglycerin line.</p>
        </div>
        <div className="pcard ledger rv">
          <div>
            {RECORDS.map(([name], i) => {
              const bad = tampered && i >= broken;
              return (
                <div className={`lr${bad ? ' bad' : ''}`} key={name}>
                  <span className="n">{String(i + 1).padStart(2, '0')}</span>
                  <h4>{name}</h4>
                  <input
                    value={values[i]}
                    disabled={i !== EDITABLE}
                    aria-label={`${name} dose`}
                    onChange={(e) => setValues((v) => v.map((x, k) => (k === i ? e.target.value : x)))}
                  />
                  <div className="h">
                    prev #{i ? (baseline ? baseline[i - 1].hash.slice(0, 8) : '········') : 'genesis'}<br />
                    hash <u>#{chain ? chain[i].hash.slice(0, 12) : '············'}</u>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lfoot">
            <div className={`verd${tampered ? ' bad' : ''}`} role="status">
              {tampered
                ? `Chain broken at record ${broken + 1}. Records ${broken + 1} to ${RECORDS.length} no longer verify.`
                : `Chain intact. All ${RECORDS.length} records verified.`}
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span key={tampered ? 'bad' : 'ok'} className={`stamp thunk${tampered ? ' bad' : ''}`}>{tampered ? 'Tampered' : 'Verified'}</span>
              <button type="button" className="btn" data-cur onClick={() => setValues(original)}>Restore original</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
