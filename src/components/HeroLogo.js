// HeroLogo.js
// Renders the logo + welcome typewriter as a position:fixed overlay so it
// is completely decoupled from the parallax section-container transforms.
// If it lived inside the section-container it would be yanked off-screen
// by the parent's translateY(100vh) exit in 90ms, making any scale/fade
// animation on the logo invisible.

import React, { useState, useEffect, useRef } from 'react';
import logo from '../assets/icons/popcon_svg.svg';
import './IntroBranding.css';

const WELCOME = 'Welcome';

const HeroLogo = ({ active, onEnter, immediate = false, label = 'Popular Consulting — enter the site' }) => {
  const controlled = active !== undefined;
  const [reducedMotion, setReducedMotion] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches));
  // ── Visibility ────────────────────────────────────────────────────────────
  const [logoVisible,   setLogoVisible]   = useState(false);
  const [observedHeroActive, setIsHeroActive] = useState(true);
  const isHeroActive = controlled ? active : observedHeroActive;
  const [isExiting,     setIsExiting]     = useState(false);

  // Fade logo in after the dither reveal is underway (one-shot on load)
  useEffect(() => {
    if (immediate || reducedMotion) { setLogoVisible(true); return undefined; }
    const t = setTimeout(() => setLogoVisible(true), 1700);
    return () => clearTimeout(t);
  }, [immediate, reducedMotion]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(Boolean(query?.matches));
    query?.addEventListener?.('change', sync);
    return () => query?.removeEventListener?.('change', sync);
  }, []);

  // Track active section via MutationObserver on section-dots (same pattern as NavMenu)
  useEffect(() => {
    if (controlled) return undefined;
    const checkSection = () => {
      const dots      = document.querySelectorAll('.section-dot');
      const activeDot = document.querySelector('.section-dot.active');
      if (!activeDot) return;
      setIsHeroActive(Array.from(dots).indexOf(activeDot) === 0);
    };

    // Dots may not exist yet on first render — poll until they appear,
    // with the poll timer tracked so unmount cancels it.
    let obs = null;
    let pollTimer = 0;
    const attach = () => {
      const dots = document.querySelectorAll('.section-dot');
      if (!dots.length) { pollTimer = setTimeout(attach, 100); return; }
      checkSection();
      obs = new MutationObserver(checkSection);
      dots.forEach(d => obs.observe(d, { attributes: true }));
    };

    const timer = setTimeout(attach, 300);
    return () => {
      clearTimeout(timer);
      clearTimeout(pollTimer);
      if (obs) obs.disconnect();
    };
  }, [controlled]);

  // Exit: scale-up + fade when leaving hero; instant snap on return
  useEffect(() => {
    if (!isHeroActive && logoVisible) setIsExiting(true);
    else if (isHeroActive)            setIsExiting(false);
  }, [isHeroActive, logoVisible]);

  // ── Welcome typewriter ────────────────────────────────────────────────────
  const isFirstVisitRef = useRef(true);
  const typeIntervalRef = useRef(null);
  const typeTimeoutRef  = useRef(null);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [welcomeText,    setWelcomeText]    = useState('');

  useEffect(() => {
    if (!logoVisible || !isFirstVisitRef.current) return;
    if (reducedMotion) { setWelcomeVisible(true); setWelcomeText(WELCOME); return undefined; }
    typeTimeoutRef.current = setTimeout(() => {
      if (!isFirstVisitRef.current) return;
      setWelcomeVisible(true);
      let i = 0;
      typeIntervalRef.current = setInterval(() => {
        i++;
        setWelcomeText(WELCOME.slice(0, i));
        if (i >= WELCOME.length) clearInterval(typeIntervalRef.current);
      }, 100);
    }, 900);
    return () => {
      clearTimeout(typeTimeoutRef.current);
      clearInterval(typeIntervalRef.current);
    };
  }, [logoVisible, reducedMotion]);

  useEffect(() => {
    if (!isHeroActive) {
      isFirstVisitRef.current = false;
      clearTimeout(typeTimeoutRef.current);
      clearInterval(typeIntervalRef.current);
      setWelcomeVisible(false);
      setWelcomeText('');
    }
  }, [isHeroActive]);

  // ── Click: navigate to next section ──────────────────────────────────────
  const handleClick = (e) => {
    e.stopPropagation();
    if (onEnter) { onEnter(); return; }
    const dots = document.querySelectorAll('.section-dot');
    if (dots[1]) dots[1].click();
  };

  return (
    <>
      {/* Fixed centred wrapper — never moves with section transitions */}
      <div
        className="intro-branding__hero"
        aria-hidden={!isHeroActive}
        inert={!isHeroActive ? '' : undefined}
        style={{
          position:      'fixed',
          top:           '50%',
          left:          '50%',
          transform:     'translate(-50%, -50%)',
          zIndex:        25,
          pointerEvents: (isHeroActive && logoVisible && !isExiting) ? 'auto' : 'none',
        }}
      >
        {/* Scale + fade wrapper (no conflict with flip animation on <img>) */}
        <div
          style={{
            opacity:    !logoVisible ? 0 : isExiting ? 0 : 1,
            transform:  isExiting && !reducedMotion ? 'scale(15.5)' : 'scale(1)',
            transition: reducedMotion ? 'none' : isExiting
              ? 'opacity 0.45s ease-out, transform 0.72s cubic-bezier(0.4, 0, 1, 1)'
              : !logoVisible
                ? 'opacity 1.0s ease-out'
                : 'none',
          }}
        >
          <button
            className="intro-branding__enter"
            onClick={handleClick}
            aria-label={label}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'block',
              borderRadius: '12px',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); } }}
          >
            <img
              className="intro-branding__logo"
              src={logo}
              alt="Popular Consulting"
              style={{
                height:    'auto',
                display:   'block',
                pointerEvents: 'none',
                animation: logoVisible && !reducedMotion ? 'ditherLogoFlip 6s ease-in-out infinite' : 'none',
              }}
            />
          </button>
        </div>

        {/* Welcome typewriter — centred over the logo */}
        {welcomeVisible && (
          <div
            className="intro-branding__text"
            style={{
              position:    'absolute',
              top:         '50%',
              left:        '50%',
              transform:   'translate(-50%, -50%)',
              color:       'rgba(255, 255, 255, 0.95)',
              fontFamily:  'monospace',
              fontWeight:  '700',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              textShadow:  '0 2px 14px rgba(0, 0, 0, 0.55)',
              userSelect:  'none',
              whiteSpace:  'nowrap',
              pointerEvents: 'none',
            }}
          >
            {welcomeText}
            <span
              style={{
                display:       'inline-block',
                width:         '2px',
                height:        '0.85em',
                background:    'rgba(255, 255, 255, 0.85)',
                marginLeft:    '3px',
                verticalAlign: 'middle',
                animation:     reducedMotion ? 'none' : 'cursorBlink 0.7s step-end infinite',
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        /* Hero logo button focus ring */
        .intro-branding__enter:focus { outline: none; }
        .intro-branding__enter:focus-visible {
          outline: 2px solid rgba(255,255,255,0.8);
          outline-offset: 6px;
        }
        @media (forced-colors: active) {
          .intro-branding__enter { outline: 2px solid ButtonText; }
          .intro-branding__text { color: CanvasText !important; text-shadow: none !important; }
        }
        @keyframes ditherLogoFlip {
          0%   { transform: perspective(600px) rotateY(0deg);   }
          50%  { transform: perspective(600px) rotateY(180deg); }
          100% { transform: perspective(600px) rotateY(360deg); }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </>
  );
};

export default HeroLogo;
