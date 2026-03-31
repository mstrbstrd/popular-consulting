// HeroLogo.js
// Renders the logo + welcome typewriter as a position:fixed overlay so it
// is completely decoupled from the parallax section-container transforms.
// If it lived inside the section-container it would be yanked off-screen
// by the parent's translateY(100vh) exit in 90ms, making any scale/fade
// animation on the logo invisible.

import React, { useState, useEffect, useRef } from 'react';
import logo from '../assets/icons/popcon_png.png';

const WELCOME = 'Welcome';

const HeroLogo = () => {
  // ── Visibility ────────────────────────────────────────────────────────────
  const [logoVisible,   setLogoVisible]   = useState(false);
  const [isHeroActive,  setIsHeroActive]  = useState(true);
  const [isExiting,     setIsExiting]     = useState(false);

  // Fade logo in after the dither reveal is underway (one-shot on load)
  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 1700);
    return () => clearTimeout(t);
  }, []);

  // Track active section via MutationObserver on section-dots (same pattern as NavMenu)
  useEffect(() => {
    const checkSection = () => {
      const dots      = document.querySelectorAll('.section-dot');
      const activeDot = document.querySelector('.section-dot.active');
      if (!activeDot) return;
      setIsHeroActive(Array.from(dots).indexOf(activeDot) === 0);
    };

    // Dots may not exist yet on first render — poll until they appear
    const attach = () => {
      const dots = document.querySelectorAll('.section-dot');
      if (!dots.length) { setTimeout(attach, 100); return; }
      checkSection();
      const observer = new MutationObserver(checkSection);
      dots.forEach(d => observer.observe(d, { attributes: true }));
      return observer;
    };

    let obs = null;
    const timer = setTimeout(() => { obs = attach(); }, 300);
    return () => {
      clearTimeout(timer);
      if (obs) obs.disconnect();
    };
  }, []);

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
  }, [logoVisible]);

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
    const dots = document.querySelectorAll('.section-dot');
    if (dots[1]) dots[1].click();
  };

  return (
    <>
      {/* Fixed centred wrapper — never moves with section transitions */}
      <div
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
            transform:  isExiting ? 'scale(15.5)' : 'scale(1)',
            transition: isExiting
              ? 'opacity 0.45s ease-out, transform 0.72s cubic-bezier(0.4, 0, 1, 1)'
              : !logoVisible
                ? 'opacity 1.0s ease-out'
                : 'none',
          }}
        >
          <button
            onClick={handleClick}
            aria-label="Popular Consulting — enter the site"
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
              src={logo}
              alt="Popular Consulting"
              style={{
                width:     'clamp(125px, 31.25vw, 312px)',
                height:    'auto',
                display:   'block',
                pointerEvents: 'none',
                animation: logoVisible ? 'ditherLogoFlip 6s ease-in-out infinite' : 'none',
              }}
            />
          </button>
        </div>

        {/* Welcome typewriter — centred over the logo */}
        {welcomeVisible && (
          <div
            style={{
              position:    'absolute',
              top:         '50%',
              left:        '50%',
              transform:   'translate(-50%, -50%)',
              color:       'rgba(255, 255, 255, 0.95)',
              fontFamily:  'monospace',
              fontSize:    'clamp(1.5625rem, 3.75vw, 2.344rem)',
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
                animation:     'cursorBlink 0.7s step-end infinite',
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        /* Hero logo button focus ring */
        [aria-label="Popular Consulting — enter the site"]:focus { outline: none; }
        [aria-label="Popular Consulting — enter the site"]:focus-visible {
          outline: 2px solid rgba(255,255,255,0.8);
          outline-offset: 6px;
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
