// DitherHero.js
// Transparent click/drag surface covering the hero section.
// Forwards pointer events to DitherBackground via window.__addDitherRipple
// so ripple interactions work.
//
// The logo + welcome typewriter live in HeroLogo.js (position:fixed) so they
// are never moved by the parallax section-container transforms.

import React, { useRef } from 'react';

const DitherHero = () => {
  const touchStartRef = useRef(null);

  const addRipple = (clientX, clientY) => {
    if (window.__addDitherRipple) window.__addDitherRipple(clientX, clientY);
  };

  const handleClick = (e) => { addRipple(e.clientX, e.clientY); };

  // Touch tap (not drag) — fire ripple at tap position
  const handleTouchStart = (e) => { touchStartRef.current = e.touches[0]; };
  const handleTouchEnd   = (e) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.clientX;
    const dy = touch.clientY - start.clientY;
    if (Math.sqrt(dx * dx + dy * dy) < 10) {
      addRipple(touch.clientX, touch.clientY);
    }
    touchStartRef.current = null;
  };

  return (
    <div
      className="hero-section"
      style={{
        position:   'relative',
        width:      '100%',
        height:     '100dvh',
        background: 'transparent',
        cursor:     'default',
      }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    />
  );
};

export default DitherHero;
