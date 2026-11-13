import React, { Suspense, useEffect, useRef, useState } from 'react';
import { hasHardwareWebGL, isMobileTier } from '../utils/deviceTier';
import './HomeOrbField.css';

// The real Metabloom: the same CreatorOS field renderer and avatar mode that
// /orb mounts, loaded lazily so the Home chunk stays small. One localized
// half-resolution context. It is purely ambient here: no pointer input, it
// just floats in its card. The SVG drawing is the fallback.
const CreatorOSFieldCanvas = React.lazy(() => Promise.all([
  import('./CreatorOSFieldCanvas'),
  import('./CreatorOSFieldCanvas.css'),
]).then(([module]) => module));

export const canRenderHomeOrbField = () => hasHardwareWebGL && !isMobileTier;

// The creature arrives last: after the workspace has opened, the document has
// finished loading, and the cards have settled.
export const HOME_ORB_ARRIVAL_DELAY_MS = 450;

export default function HomeOrbField({ active, isDark, fallback }) {
  const rootRef = useRef(null);
  const [enabled] = useState(canRenderHomeOrbField);
  const [armed, setArmed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!enabled || !active || armed) return undefined;
    let timer;
    const arm = () => { timer = window.setTimeout(() => setArmed(true), HOME_ORB_ARRIVAL_DELAY_MS); };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });
    return () => { window.clearTimeout(timer); window.removeEventListener('load', arm); };
  }, [enabled, active, armed]);

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
  return <div ref={rootRef} className="home-orb-field" data-field-state={live ? (armed ? state : 'waiting') : 'fallback'}>
    {!live && <div className="home-orb-field-fallback">{fallback}</div>}
    {live && armed && <div className="home-orb-field-live" data-ready={ready ? 'true' : undefined}>
      <Suspense fallback={null}>
        <CreatorOSFieldCanvas
          isDark={isDark}
          metabloomAvatarEnabled
          mode={0}
          paused={!active || !visible}
          pointerReactive={false}
          onReady={() => setState(current => (current === 'fallback' ? current : 'ready'))}
          onFieldStateChange={next => { if (next === 'fallback') setState('fallback'); }}
        />
      </Suspense>
    </div>}
  </div>;
}
