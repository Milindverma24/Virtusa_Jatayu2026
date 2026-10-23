import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function LaunchSection({ onOpenApp, onOpenDocs }) {
  return (
    <section className="pad mon sheetUp" id="launch-section">
      <div className="wrap">
        <div className="launch">
          <h2 className="rv">In the golden hour, every second matters. <em>So does the record.</em></h2>
          <div className="rv" style={{ '--d': 1 }}>
            <p>No cloud dependency. No erased notes. No guesswork hours later. A structured handover the moment the doors open.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn pri" data-cur onClick={() => onOpenApp && onOpenApp('/app')}>
                Launch the field app <ArrowRight size={14} strokeWidth={2} />
              </button>
              <button type="button" className="btn" data-cur onClick={() => onOpenDocs && onOpenDocs()}>Read the architecture</button>
            </div>
          </div>
        </div>
        <div className="foot-row">
          <span><b>संजीवनी लेख</b> &nbsp; Sanjeevani Lekh</span>
          <span>Research and portfolio project. Not a medical device. Every record is confirmed by a responder.</span>
          <a href="https://github.com/Milindverma24/Virtusa_Jatayu2026" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </section>
  );
}
