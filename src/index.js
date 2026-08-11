import './patchResizeObserver'; // must be first: patches global before React/MUI load
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './aetheris-site.css';
import './service-dialog-layer-fix.css';
import './service-example-link-gradient.css';
import './navigation-cohesion.css';
import './spectral-icon-colorway.css';
import './work-responsive.css';
import './work-navigation-refinement.css';
import './work-card-consistency.css';
import SiteRouter from './SiteRouter';
import InteractionAccessibilityBridge from './components/InteractionAccessibilityBridge';
import { disableWebGLForSession } from './utils/deviceTier';
import { initCoreWebVitals, initSectionTiming, initLongTaskObserver } from './utils/telemetry';

// ResizeObserver loop errors are prevented at the source by patchResizeObserver
// (imported first, above): it wraps callbacks in requestAnimationFrame so
// notifications never overflow a single frame.

// A GPU reset or driver failure can invalidate a WebGL context after the initial
// capability probe has succeeded. Fail closed for the rest of this tab/session,
// then reload once so ParallaxBackground mounts the CSS fallback instead of
// repeatedly attempting the immersive renderer.
let recoveringFromWebGLLoss = false;
document.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (recoveringFromWebGLLoss) return;

  recoveringFromWebGLLoss = true;
  disableWebGLForSession();
  window.location.reload();
}, true);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <InteractionAccessibilityBridge />
    <SiteRouter />
  </React.StrictMode>
);

initCoreWebVitals();
initSectionTiming();
initLongTaskObserver();