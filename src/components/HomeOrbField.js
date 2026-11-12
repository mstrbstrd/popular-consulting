import React, { Suspense, useEffect, useRef, useState } from 'react';
import { hasHardwareWebGL, isMobileTier } from '../utils/deviceTier';
import './HomeOrbField.css';

// The real Metabloom: the same CreatorOS field renderer and avatar mode that
// /orb mounts, loaded lazily so the Home chunk stays small. One localized
// half-resolution context; it pauses whenever the card is off screen or the
// workspace is still closed, and the SVG drawing remains the local fallback.
const CreatorOSFieldCanvas = React.lazy(() => Promise.all([
  import('./CreatorOSFieldCanvas'),
  import('./CreatorOSFieldCanvas.css'),
]).then(([module]) => module));

export const canRenderHomeOrbField = () => hasHardwareWebGL && !isMobileTier;

const finePointer = () => typeof window !== 'undefined'
  && Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches);

export default function HomeOrbField({ active, isDark, fallback }) {
  const rootRef = useRef(null);
  const [enabled] = useState(canRenderHomeOrbField);
  const [pointerReactive] = useState(finePointer);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState('loading');

  useEffect(() => {
    const node = rootRef.current;
    if (!enabled || !node) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  const live = enabled && state !== 'fallback';
  const ready = live && state === 'ready';
  return <div ref={rootRef} className="home-orb-field" data-field-state={live ? state : 'fallback'}
    data-pointer-reactive={pointerReactive ? 'true' : 'false'}>
    <div className="home-orb-field-fallback" data-hidden={ready ? 'true' : undefined}>{fallback}</div>
    {live && <div className="home-orb-field-live" data-ready={ready ? 'true' : undefined}>
      <Suspense fallback={null}>
        <CreatorOSFieldCanvas
          isDark={isDark}
          metabloomAvatarEnabled
          mode={0}
          paused={!active || !visible}
          pointerReactive={pointerReactive}
          onReady={() => setState(current => (current === 'fallback' ? current : 'ready'))}
          onFieldStateChange={next => { if (next === 'fallback') setState('fallback'); }}
        />
      </Suspense>
    </div>}
  </div>;
}
