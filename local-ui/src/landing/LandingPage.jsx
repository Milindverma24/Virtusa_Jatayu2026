import React, { useEffect, useRef, useState } from 'react';
import Lenis from 'lenis';
import CardNav from './CardNav';
import HeroSection, { TickerStrip } from './HeroSection';
import ModesSection from './ModesSection';
import TimelineSection from './TimelineSection';
import SyncSection from './SyncSection';
import TamperDemoSection from './TamperDemoSection';
import LaunchSection from './LaunchSection';
import { Activity } from 'lucide-react';
import { NAV_ITEMS } from '../navItems';
import { NetContext, prefersReducedMotion } from './lpUtils';
import './landing.css';

export default function LandingPage({ onOpenApp, onOpenDocs }) {
  const rootRef = useRef(null);
  const barRef = useRef(null);
  const curRef = useRef(null);
  const [online, setOnline] = useState(false);

  // Smooth scroll (Lenis) + progress hairline
  useEffect(() => {
    const reduce = prefersReducedMotion();
    let lenis;
    let raf = 0;
    if (!reduce) {
      try {
        lenis = new Lenis({
          duration: 1.1,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          smoothWheel: true,
        });
        const loop = (time) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
      } catch (e) {
        console.warn('Lenis init failed:', e);
      }
    }
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current) barRef.current.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      if (lenis) lenis.destroy();
    };
  }, []);

  // Reveal on scroll
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.1 });
    root.querySelectorAll('.rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Cursor ring + magnetic buttons (fine pointers only)
  useEffect(() => {
    const cur = curRef.current;
    if (!cur || prefersReducedMotion() || !window.matchMedia('(pointer:fine)').matches) return undefined;
    let cx = 0;
    let cy = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    const onMove = (e) => {
      tx = e.clientX; ty = e.clientY;
      cur.style.opacity = 1;
      const m = e.target.closest && e.target.closest('[data-cur]');
      cur.classList.toggle('big', !!m);
      if (m && m.classList.contains('btn')) {
        const r = m.getBoundingClientRect();
        m.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.12}px,${(e.clientY - r.top - r.height / 2) * 0.2}px)`;
      }
    };
    const onOut = (e) => { if (e.target.classList && e.target.classList.contains('btn')) e.target.style.transform = ''; };
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerout', onOut);
    const loop = () => { cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2; cur.style.transform = `translate(${cx}px,${cy}px)`; raf = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); document.removeEventListener('pointerout', onOut); };
  }, []);

  const logoElement = (
    <div className="card-nav-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title="Sanjeevani Lekh - Return to top">
      <div className="card-nav-brand-icon"><Activity size={16} strokeWidth={2.4} /></div>
      <span className="card-nav-brand-text">Sanjeevani Lekh</span>
    </div>
  );

  const handleLinkClick = (link, item, event) => {
    if (link.onClick) { event.preventDefault(); link.onClick(event); return; }
    if (link.href && (link.href.startsWith('#') || link.href.startsWith('/#'))) {
      event.preventDefault();
      const id = link.href.includes('#') ? link.href.split('#')[1] : '';
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (link.href && link.href.startsWith('/docs')) {
      event.preventDefault();
      if (onOpenDocs) onOpenDocs(); else window.location.href = '/docs';
    } else if (link.href && link.href.startsWith('/app')) {
      event.preventDefault();
      if (onOpenApp) onOpenApp(link.href); else window.location.href = link.href;
    }
  };

  const onAnchor = (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    const el = document.getElementById(a.getAttribute('href').slice(1));
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth' }); }
  };

  return (
    <NetContext.Provider value={{ online, setOnline }}>
      <div className="lp" ref={rootRef} onClick={onAnchor}>
        <div className="lp-bar" ref={barRef} aria-hidden="true" />
        <div className="lp-cur" ref={curRef} aria-hidden="true" />

        <header className="card-nav-container">
          <CardNav
            logo={logoElement}
            logoAlt="Sanjeevani Lekh"
            logoHref="#"
            items={NAV_ITEMS}
            cta={{ label: 'Open the app', onClick: onOpenApp }}
            docsHref="/docs"
            onDocsClick={onOpenDocs}
            githubHref="https://github.com/Milindverma24/Virtusa_Jatayu2026"
            cardEffect="rise"
            openOn="click"
            theme="dark"
            surface="glass"
            maxWidth="100%"
            cardHeight={140}
            onLinkClick={handleLinkClick}
          />
        </header>

        <button
          type="button"
          className="net"
          role="switch"
          aria-checked={online}
          aria-label="Simulate network connection"
          data-cur
          onClick={() => setOnline((v) => !v)}
        >
          <span className="led" />
          <span>{online ? 'ONLINE' : 'OFFLINE'}</span>
          <span className="sw" />
        </button>

        <HeroSection onOpenApp={onOpenApp} />
        <TickerStrip />
        <ModesSection />
        <TimelineSection />
        <SyncSection />
        <TamperDemoSection />
        <LaunchSection onOpenApp={onOpenApp} onOpenDocs={onOpenDocs} />
      </div>
    </NetContext.Provider>
  );
}
