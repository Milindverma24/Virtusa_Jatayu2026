import React, { useMemo, useState } from 'react';
import { Mic, Keyboard, Camera } from 'lucide-react';

const MODES = [
  { id: 'voice', label: 'VOICE', Icon: Mic, title: 'Say it as you do it.', body: 'Speech is transcribed on the device with Whisper. Audio is deleted right after.' },
  { id: 'type', label: 'TYPE', Icon: Keyboard, title: 'Quiet scene? Type it.', body: 'Shorthand is fine. Abbreviations are normalised to full drug names.' },
  { id: 'photo', label: 'PHOTO', Icon: Camera, title: 'Photograph the glove note.', body: 'Handwriting is read offline. Low-confidence lines are marked for you to check.' },
];

export default function ModesSection() {
  const [active, setActive] = useState('voice');
  const bars = useMemo(
    () => Array.from({ length: 46 }, (_, i) => Math.round(20 + 70 * Math.abs(Math.sin(i * 0.5) * Math.cos(i * 0.19)))),
    []
  );

  return (
    <section className="pad" id="how-it-works">
      <div className="wrap">
        <div className="head">
          <div className="eyebrow rv">Three ways in</div>
          <h2 className="rv" style={{ '--d': 1 }}>Whatever your hands are doing, there is a way in.</h2>
          <p className="rv" style={{ '--d': 2 }}>Pick a mode. Each one ends in the same checked, structured draft.</p>
        </div>
        <div className="modes rv">
          {MODES.map(({ id, label, Icon, title, body }) => (
            <div
              key={id}
              className={`mode${active === id ? ' on' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={active === id}
              data-cur
              onClick={() => setActive(id)}
              onFocus={() => setActive(id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(id); } }}
            >
              <div className="meta"><span className="idx">{label}</span><Icon size={22} strokeWidth={1.6} /></div>
              <div className="viz">
                {id === 'voice' && (
                  <div className="wave">
                    {bars.map((h, i) => <i key={i} style={{ '--i': i, '--h': h }} />)}
                  </div>
                )}
                {id === 'type' && (
                  <div className="ttxt">
                    14:35 IV 18 gauge left AC<br />
                    14:38 nitro point four under the tongue
                    <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--herb)', marginLeft: 3, verticalAlign: -2, animation: 'lp-blink 1s infinite' }} />
                  </div>
                )}
                {id === 'photo' && active === 'photo' && (
                  <div className="note">
                    14:32 aspirin 324<br />mg PO &nbsp;IV 18G L AC
                    <span className="bx" style={{ '--k': 0, left: 62, top: 10, width: 78, height: 30 }}><b>aspirin .97</b></span>
                    <span className="bx" style={{ '--k': 1, left: 142, top: 10, width: 58, height: 30 }}><b>324 .94</b></span>
                    <span className="bx" style={{ '--k': 2, left: 158, top: 44, width: 84, height: 30 }}><b>IV 18G .88</b></span>
                    <span className="scan" />
                  </div>
                )}
              </div>
              <div><h3>{title}</h3><p>{body}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
