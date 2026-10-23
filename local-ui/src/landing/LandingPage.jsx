import React, { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import CardNav from './CardNav';
import HeroSection from './HeroSection';
import TamperDemoSection from './TamperDemoSection';
import LaunchSection from './LaunchSection';
import { Activity } from 'lucide-react';
import { NAV_ITEMS } from '../navItems';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage({ onOpenApp, onOpenDocs }) {
  const landingRef = useRef(null);

  // Lenis smooth scroll + GSAP ScrollTrigger Ticker Synchronization
  useEffect(() => {
    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let lenis;
    let lenisRaf;

    try {
      lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
      });

      // Synchronize Lenis scroll updates with GSAP ScrollTrigger
      lenis.on('scroll', ScrollTrigger.update);

      lenisRaf = (time) => {
        lenis.raf(time * 1000);
      };

      gsap.ticker.add(lenisRaf);
      gsap.ticker.lagSmoothing(0);

      // GSAP Animations Context
      const ctx = gsap.context(() => {
        // 1. Hero text and actions entrance reveal
        gsap.from('.hero-badge-pill, .hero-display-title, .hero-lead-text, .hero-cta-group', {
          opacity: 0,
          y: 32,
          duration: 0.9,
          stagger: 0.12,
          ease: 'power3.out'
        });

        // 2. Full-width telemetry canvas container entrance
        gsap.from('.hero-telemetry-fullwidth', {
          opacity: 0,
          scale: 0.97,
          duration: 1.1,
          delay: 0.4,
          ease: 'power2.out'
        });

        // 3. Transformation Grid Reveal (Dictation from left, ePCR cards from right)
        gsap.from('.dictation-panel', {
          scrollTrigger: {
            trigger: '.hero-transformation-wrap',
            start: 'top 82%',
          },
          opacity: 0,
          x: -40,
          duration: 0.85,
          ease: 'power3.out'
        });

        gsap.from('.epcr-cards-column', {
          scrollTrigger: {
            trigger: '.hero-transformation-wrap',
            start: 'top 82%',
          },
          opacity: 0,
          x: 40,
          duration: 0.85,
          delay: 0.15,
          ease: 'power3.out'
        });

        // 4. Tamper Demo Section reveal
        gsap.from('.tamper-section-header', {
          scrollTrigger: {
            trigger: '#tamper-demo',
            start: 'top 80%',
          },
          opacity: 0,
          y: 30,
          duration: 0.8,
          ease: 'power3.out'
        });

        gsap.from('.tamper-card', {
          scrollTrigger: {
            trigger: '#tamper-demo',
            start: 'top 75%',
          },
          opacity: 0,
          y: 40,
          duration: 0.9,
          ease: 'power3.out'
        });

        // 5. Dedicated Launch CTA Section reveal
        gsap.from('.launch-unique-container', {
          scrollTrigger: {
            trigger: '#launch-section',
            start: 'top 82%',
          },
          opacity: 0,
          y: 35,
          duration: 0.9,
          ease: 'power3.out'
        });
      }, landingRef);

      return () => {
        ctx.revert();
        gsap.ticker.remove(lenisRaf);
        ScrollTrigger.getAll().forEach((t) => t.kill());
        lenis.destroy();
      };
    } catch (e) {
      console.warn('Lenis + GSAP initialization error:', e);
    }
  }, []);

  // Centered logo / title heading element
  const logoElement = (
    <div
      className="card-nav-brand"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Sanjeevani Lekh - Return to top"
    >
      <div className="card-nav-brand-icon">
        <Activity size={16} strokeWidth={2.4} />
      </div>
      <span className="card-nav-brand-text">Sanjeevani Lekh</span>
    </div>
  );

  // Link handler for anchors and SPA routes
  const handleLinkClick = (link, item, event) => {
    if (link.onClick) {
      event.preventDefault();
      link.onClick(event);
      return;
    }
    if (link.href && (link.href.startsWith('#') || link.href.startsWith('/#'))) {
      event.preventDefault();
      const id = link.href.includes('#') ? link.href.split('#')[1] : '';
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else if (link.href && link.href.startsWith('/docs')) {
      event.preventDefault();
      onOpenDocs ? onOpenDocs() : (window.location.href = '/docs');
    } else if (link.href && link.href.startsWith('/app')) {
      event.preventDefault();
      onOpenApp ? onOpenApp() : (window.location.href = '/app');
    }
  };

  return (
    <div className="landing-page-root" ref={landingRef}>
      {/* Film Grain Texture Overlay */}
      <div className="film-grain-overlay" aria-hidden="true" />

      {/* Full-width Glassy CardNav Menu spanning left to right completely */}
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

      {/* 1. HERO SECTION (With live typewriter, canvas ECG waveform, and flying structured cards) */}
      <HeroSection onOpenApp={onOpenApp} onOpenDocs={onOpenDocs} />

      {/* 2. TAMPER-EVIDENT BY DESIGN (With genuine SubtleCrypto SHA-256 calculation & interactive fracture) */}
      <TamperDemoSection />

      {/* 3. DEDICATED LAUNCH CTA SECTION & MINIMALIST FOOTER */}
      <LaunchSection onOpenApp={onOpenApp} />
    </div>
  );
}
