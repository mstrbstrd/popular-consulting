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
import { initCoreWebVitals, initSectionTiming, initLongTaskObserver } from './utils/telemetry';

// ResizeObserver loop errors are prevented at the source by patchResizeObserver
// (imported first, above): it wraps callbacks in requestAnimationFrame so
// notifications never overflow a single frame.

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