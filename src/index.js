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
import { initGraphicsContextGovernor } from './utils/graphicsContextGovernor';
import { initGraphicsRuntimeBoundary } from './utils/graphicsRuntimeBoundary';
import { initVisualRuntimePolicy } from './utils/visualRuntimePolicy';
import { initCoreWebVitals, initSectionTiming, initLongTaskObserver } from './utils/telemetry';

// The visual-runtime policy establishes the permanent reference/optimized
// comparison boundary before any renderer mounts. Stage zero resolves every
// request to the current reference implementation.
initVisualRuntimePolicy();

// The context governor is installed before React mounts any renderer. It only
// touches canvases explicitly marked by ManagedDitherBackground, bounding their
// drawing buffer before the first draw and suppressing over-budget draw calls.
initGraphicsContextGovernor();

// Graphics failures degrade locally. The runtime boundary records context loss,
// hides the failed canvas, releases exclusive renderer ownership, and never
// reloads the document.
initGraphicsRuntimeBoundary();

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
