import React, { memo, useCallback, useEffect, useState } from 'react';
import { hasHardwareWebGL } from '../utils/deviceTier';
import { GRAPHICS_MODES, graphicsMode, shouldAttemptWebGL } from '../utils/graphicsPolicy';
import CreatorOSFieldCanvas from './CreatorOSFieldCanvas';
import './CreatorOSFieldCanvas.css';

// The calendar reuses the field lab's Quasicrystal Chorus (CreatorOS mode 5) as
// its ambient scene, in light and dark, the way the Invoice Generator reuses
// Contour Drift. One localized half-resolution context, no pointer input, no
// calendar data in the scene. Changing views, events or the theme must never
// rebuild the context or restart its clock. Without hardware WebGL (or with
// forced colours, a CSS-only policy, or a local context failure) the page keeps
// its static Orb atmosphere.
export const QUASICRYSTAL_CHORUS_MODE = 5;

const matches = query => Boolean(window.matchMedia?.(query)?.matches);

function useMediaFlag(query) {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const list = window.matchMedia?.(query);
    const sync = () => setValue(Boolean(list?.matches));
    if (list?.addEventListener) list.addEventListener('change', sync);
    else list?.addListener?.(sync);
    return () => {
      if (list?.removeEventListener) list.removeEventListener('change', sync);
      else list?.removeListener?.(sync);
    };
  }, [query]);
  return value;
}

export function useCalendarScene() {
  const forcedColors = useMediaFlag('(forced-colors: active)');
  const reducedMotion = useMediaFlag('(prefers-reduced-motion: reduce)');
  const [failed, setFailed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const togglePaused = useCallback(() => setUserPaused(value => !value), []);
  const onFailure = useCallback(() => setFailed(true), []);
  const enabled = !forcedColors && shouldAttemptWebGL && (hasHardwareWebGL || graphicsMode === GRAPHICS_MODES.WEBGL);
  const live = enabled && !failed;
  return {
    live,
    // Reduced motion always wins: the field draws one settled frame.
    paused: userPaused || reducedMotion,
    canPause: live && !reducedMotion,
    userPaused,
    togglePaused,
    onFailure,
  };
}

const CalendarBackground = memo(({ live, paused, isDark, onFailure }) => {
  const handleState = useCallback(state => { if (state === 'fallback') onFailure(); }, [onFailure]);
  if (!live) return null;
  return (
    <div
      className="calendar-page__scene"
      aria-hidden="true"
      data-study="quasicrystal-chorus"
      data-motion={paused ? 'paused' : 'running'}
    >
      <CreatorOSFieldCanvas
        mode={QUASICRYSTAL_CHORUS_MODE}
        isDark={isDark}
        paused={paused}
        pointerReactive={false}
        onFieldStateChange={handleState}
      />
    </div>
  );
});

export default CalendarBackground;
