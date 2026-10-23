import React, { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './lpUtils';
import { useNet } from './lpUtils';

const EXTRA = ['14:44 Oxygen 4 L', '14:47 12-lead ECG', '14:49 Ondansetron 4 mg'];

export default function SyncSection() {
  const { online } = useNet();
  const [queue, setQueue] = useState(['14:32 Aspirin 324 mg', '14:34 IV access 18G', '14:38 Nitroglycerin 0.4 mg']);
  const [cloud, setCloud] = useState(41);
  const linkRef = useRef(null);
  const extraIdx = useRef(0);
  const timers = useRef([]);

  const sendPacket = useCallback((delay) => {
    const t = setTimeout(() => {
      const link = linkRef.current;
      if (!link) return;
      const reduce = prefersReducedMotion();
      const dur = reduce ? 0 : 1100;
      const p = document.createElement('span');
      p.className = 'pkt';
      link.appendChild(p);
      if (p.animate && dur) {
        p.animate([{ left: '0%' }, { left: 'calc(100% - 10px)' }], { duration: dur, easing: 'ease-in-out', fill: 'forwards' });
      }
      const t2 = setTimeout(() => { p.remove(); setCloud((c) => c + 1); }, dur);
      timers.current.push(t2);
    }, delay);
    timers.current.push(t);
  }, []);

  // Flush the queue when the connection returns
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) {
      queue.forEach((_, i) => sendPacket(i * 350));
      setQueue([]);
    }
    wasOnline.current = online;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const logRecord = () => {
    const item = EXTRA[extraIdx.current++ % EXTRA.length];
    if (online) sendPacket(0);
    else setQueue((q) => [...q, item]);
  };

  return (
    <section className="pad mon" id="sync" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="wrap">
        <div className="head">
          <div className="eyebrow rv">Offline first</div>
          <h2 className="rv" style={{ '--d': 1 }}>The signal drops. The record does not.</h2>
          <p className="rv" style={{ '--d': 2 }}>Flip the switch in the corner, or log a record here. Records queue on the device and go to the supervisor dashboard when the connection returns.</p>
        </div>
        <div className="sync rv">
          <div className="node">
            <h4><span>Device · ambulance-01</span><span className="tnum">{queue.length} queued</span></h4>
            <ul>{queue.map((q, i) => <li key={`${q}-${i}`}><span>{q}</span><span style={{ color: 'var(--warn)' }}>waiting</span></li>)}</ul>
          </div>
          <div className={`link${online ? '' : ' off'}`} ref={linkRef} />
          <div className="node">
            <h4><span>Supervisor cloud</span><span>Supabase</span></h4>
            <div className="big tnum">{cloud}</div>
            <p className="mono" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>records received</p>
          </div>
        </div>
        <div style={{ marginTop: 22, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn pri" data-cur onClick={logRecord}>Log a record</button>
          <span className="mono" style={{ color: 'var(--muted)', fontSize: 12, alignSelf: 'center' }}>
            {online ? 'Connected. New records sync immediately.' : 'No signal. New records wait on the device.'}
          </span>
        </div>
      </div>
    </section>
  );
}
