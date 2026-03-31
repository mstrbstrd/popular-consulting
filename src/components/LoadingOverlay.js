// LoadingOverlay.js
// Replays the site's intro reveal + logo animation on demand.
//
// ENTRY (mirrors site load exactly):
//   white overlay → dither crystallizes in (u_reveal 0→1, 2500ms) →
//   overlay fades transparent in sync → logo fades in at 1700ms →
//   text types in at 2600ms (110ms/char)
//
// EXIT (strict reverse of entry):
//   text un-types (110ms/char, right→left) →
//   logo fades out (1000ms) →
//   dither crystallizes back out (u_reveal 1→0, 2500ms) +
//   overlay fades to white simultaneously →
//   unmount

import React, { useState, useEffect, useRef, useCallback } from 'react';
import logo from '../assets/icons/popcon_png.png';
import { useThemeMode } from '../contexts/ThemeContext';

const LOADING_TEXT = 'Loading';
const INTRO_DUR    = 2500;  // must match DitherBackground INTRO_DUR
const CHAR_SPEED   = 110;   // ms per character (type and un-type)
const LOGO_FADE_IN = 1700;  // ms after entry start before logo appears
const TEXT_START   = 2600;  // ms after entry start before typing begins
const LOGO_FADE_DUR = 1000; // ms for logo opacity transition

// z-indices — above everything (NavMenu: 1000, expanded cards: 998-1000)
const Z_OVERLAY = 19000;
const Z_CONTENT = 19001;

const LoadingOverlay = ({ visible, onExitComplete }) => {
  const { isDark } = useThemeMode();
  const pageBg = isDark ? '#0b0b18' : '#ffffff';
  const [phase,        setPhase]        = useState('idle');
  const [logoVisible,  setLogoVisible]  = useState(false);
  const [logoOpacity,  setLogoOpacity]  = useState(0);
  const [textVisible,  setTextVisible]  = useState(false);
  const [displayText,  setDisplayText]  = useState('');
  // Overlay alpha + its transition duration (changes between entry and exit)
  const [overlayAlpha,       setOverlayAlpha]       = useState(1);
  const [overlayTransition,  setOverlayTransition]  = useState('none');

  const timers      = useRef([]);
  const displayTextRef = useRef(''); // kept in sync for exit un-typing

  const clearAllTimers = useCallback(() => {
    timers.current.forEach(id => clearTimeout(id));
    timers.current = [];
  }, []);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  // ── Entry ────────────────────────────────────────────────────────────────────
  const enter = useCallback(() => {
    clearAllTimers();
    setPhase('entering');
    setLogoVisible(false);
    setLogoOpacity(0);
    setTextVisible(false);
    setDisplayText('');
    displayTextRef.current = '';
    setOverlayAlpha(1);
    setOverlayTransition('none');

    // Raise canvas above all site content, lock to hero preset, then crystallize in
    window.__ditherRaiseCanvas?.();
    window.__ditherLockToHero?.();
    window.__ditherRevealIn?.();

    // Fade white overlay → transparent, matching dither reveal pace
    later(() => {
      setOverlayTransition(`opacity ${INTRO_DUR}ms cubic-bezier(0.22, 1, 0.36, 1)`);
      setOverlayAlpha(0);
    }, 50);

    // Logo fades in
    later(() => {
      setLogoVisible(true);
      later(() => setLogoOpacity(1), 20); // small delay so transition fires
    }, LOGO_FADE_IN);

    // Typewriter
    later(() => {
      setTextVisible(true);
      let i = 0;
      const iv = setInterval(() => {
        i++;
        const t = LOADING_TEXT.slice(0, i);
        setDisplayText(t);
        displayTextRef.current = t;
        if (i >= LOADING_TEXT.length) clearInterval(iv);
      }, CHAR_SPEED);
      timers.current.push(iv);
    }, TEXT_START);

    later(() => setPhase('showing'), INTRO_DUR);
  }, [clearAllTimers, later]);

  // ── Exit (strict reverse) ────────────────────────────────────────────────────
  const exit = useCallback(() => {
    clearAllTimers();
    setPhase('exiting');

    // Step 1 — un-type text right→left
    const currentLen = displayTextRef.current.length;
    const unTypeDur = currentLen * CHAR_SPEED;

    if (currentLen > 0) {
      let i = currentLen;
      const iv = setInterval(() => {
        i--;
        const t = LOADING_TEXT.slice(0, i);
        setDisplayText(t);
        displayTextRef.current = t;
        if (i <= 0) clearInterval(iv);
      }, CHAR_SPEED);
      timers.current.push(iv);
    }

    // Step 2 — logo fades out after text is gone
    later(() => {
      setTextVisible(false);
      setLogoOpacity(0);
    }, unTypeDur);

    // Step 3 — crystallize dither out + overlay fades back to white simultaneously
    later(() => {
      setLogoVisible(false);
      // Overlay fades to white over same duration as dither crystallize-out
      setOverlayTransition(`opacity ${INTRO_DUR}ms cubic-bezier(0.22, 1, 0.36, 1)`);
      setOverlayAlpha(1);
      window.__ditherRevealOut?.(() => {
        // Release lock and lower canvas back to normal stacking
        window.__ditherUnlock?.();
        window.__ditherLowerCanvas?.();
        setPhase('idle');
        setDisplayText('');
        displayTextRef.current = '';
        onExitComplete?.();
      });
    }, unTypeDur + LOGO_FADE_DUR);
  }, [clearAllTimers, later, onExitComplete]);

  // ── Drive from visible prop ──────────────────────────────────────────────────
  useEffect(() => {
    if (visible  && phase === 'idle')    enter();
    if (!visible && phase === 'showing') exit();
  }, [visible, phase, enter, exit]);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  if (phase === 'idle') return null;

  return (
    <>
      {/* Page-colour overlay — covers all site content; fades in/out with dither */}
      <div
        style={{
          position:      'fixed',
          inset:         0,
          zIndex:        Z_OVERLAY,
          background:    pageBg,
          opacity:       overlayAlpha,
          transition:    overlayTransition,
          pointerEvents: phase === 'showing' ? 'none' : 'all',
        }}
      />

      {/* Glass vignette — mirrors hero glass-overlay from ParallaxBackground */}
      <div
        style={{
          position:              'fixed',
          inset:                 0,
          zIndex:                Z_OVERLAY,
          backdropFilter:        'blur(2px) saturate(100%)',
          WebkitBackdropFilter:  'blur(2px) saturate(100%)',
          pointerEvents:         'none',
          background:            'linear-gradient(to bottom, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.005) 50%, rgba(99,68,245,0.01) 100%)',
        }}
      />

      {/* Logo + typewriter */}
      {logoVisible && (
        <div
          style={{
            position:  'fixed',
            top:       '50%',
            left:      '50%',
            transform: 'translate(-50%, -50%)',
            zIndex:    Z_CONTENT,
          }}
        >
          {/* Opacity wrapper — fades in on entry, fades out on exit */}
          <div
            style={{
              opacity:    logoOpacity,
              transition: `opacity ${LOGO_FADE_DUR}ms ease-out`,
            }}
          >
            <img
              src={logo}
              alt="Popular Consulting"
              style={{
                width:     'clamp(125px, 31.25vw, 312px)',
                height:    'auto',
                display:   'block',
                animation: 'ditherLogoFlip 6s ease-in-out infinite',
              }}
            />
          </div>

          {/* Typewriter text */}
          {textVisible && (
            <div
              style={{
                position:      'absolute',
                top:           '50%',
                left:          '50%',
                transform:     'translate(-50%, -50%)',
                color:         'rgba(255,255,255,0.95)',
                fontFamily:    'monospace',
                fontSize:      'clamp(1.5625rem, 3.75vw, 2.344rem)',
                fontWeight:    700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                textShadow:    '0 2px 14px rgba(0,0,0,0.55)',
                userSelect:    'none',
                whiteSpace:    'nowrap',
                pointerEvents: 'none',
                opacity:       logoOpacity,
                transition:    `opacity ${LOGO_FADE_DUR}ms ease-out`,
              }}
            >
              {displayText}
              <span
                style={{
                  display:       'inline-block',
                  width:         '2px',
                  height:        '0.85em',
                  background:    'rgba(255,255,255,0.85)',
                  marginLeft:    '3px',
                  verticalAlign: 'middle',
                  animation:     'cursorBlink 0.7s step-end infinite',
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default LoadingOverlay;
