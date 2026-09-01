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
import './immersive-viewport.css';
import SiteRouter from './SiteRouter';
import InteractionAccessibilityBridge from './components/InteractionAccessibilityBridge';
import VisualRuntimeShellHost from './components/VisualRuntimeShellHost';
import { initGraphicsContextGovernor } from './utils/graphicsContextGovernor';
import { initGraphicsRuntimeBoundary } from './utils/graphicsRuntimeBoundary';
import { initImmersiveViewport } from './utils/immersiveViewport';
import { initVisualCaptureHarness } from './utils/visualCaptureHarness';
import { initVisualRuntimeDarkPolicy } from './utils/visualRuntimeDarkPolicy';
import { initVisualRuntimeGpuEvidence } from './utils/visualRuntimeGpuEvidence';
import { initVisualRuntimeLightPolicy } from './utils/visualRuntimeLightPolicy';
import { initVisualRuntimePolicy } from './utils/visualRuntimePolicy';
import { initVisualRuntimeShellPolicy } from './utils/visualRuntimeShellPolicy';
import { initCoreWebVitals, initSectionTiming, initLongTaskObserver } from './utils/telemetry';

// Establish the measured immersive viewport before React mounts. This repairs
// restored iOS/WebKit tabs where the browser keeps an obsolete 100dvh value.
initImmersiveViewport();

// The visual-runtime policy establishes the permanent reference/optimized
// comparison boundary before any renderer mounts. The complete optimized
// renderer still fails closed to the current reference implementation.
initVisualRuntimePolicy();

// Explicit dark evidence instruments only the known reference black-hole or
// optimized shell context. It is installed before capture instrumentation so
// both paths measure the same complete 17-draw frame boundary.
const cleanupVisualRuntimeGpuEvidence =
  initVisualRuntimeGpuEvidence();

// The shell is available only through the explicit optimized probe. Its query
// suppresses reference WebGL before React mounts, so the comparison path cannot
// own two live full-screen contexts.
initVisualRuntimeShellPolicy();

// Stage three's light candidate remains explicit-only. Capture initialization
// pins the requested theme and uses the existing section-dot contract before
// the shell renders its deterministic comparison frame.
const cleanupVisualRuntimeLightPolicy = initVisualRuntimeLightPolicy();

// Stage four's dark candidate is also explicit-only. A deterministic dark
// capture pins theme, camera, pointer, time, and section before React mounts.
const cleanupVisualRuntimeDarkPolicy = initVisualRuntimeDarkPolicy();
window.addEventListener(
  'pagehide',
  () => {
    cleanupVisualRuntimeDarkPolicy();
    cleanupVisualRuntimeLightPolicy();
    cleanupVisualRuntimeGpuEvidence();
  },
  { once: true },
);

// The context governor is installed before React mounts any renderer. It only
// touches canvases explicitly marked by ManagedDitherBackground, bounding their
// drawing buffer before the first draw and suppressing over-budget draw calls.
initGraphicsContextGovernor();

// Explicit reference captures wrap the already-governed contexts. Normal routes
// remain untouched, while capture URLs can pin authored uniform values and
// collect deterministic baseline metadata without editing the oracle shaders.
initVisualCaptureHarness();

// Graphics failures degrade locally. The runtime boundary records context loss,
// hides the failed canvas, releases exclusive renderer ownership, and never
// reloads the document.
initGraphicsRuntimeBoundary();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <>
    <VisualRuntimeShellHost />
    <React.StrictMode>
      <InteractionAccessibilityBridge />
      <SiteRouter />
    </React.StrictMode>
  </>
);

initCoreWebVitals();
initSectionTiming();
initLongTaskObserver();
