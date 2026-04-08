import './patchResizeObserver'; // must be first — patches global before React/MUI load
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initCoreWebVitals, initSectionTiming, initLongTaskObserver } from './utils/telemetry';

// ResizeObserver fires this benign warning when its callback can't deliver all
// notifications within a single animation frame. It does not indicate a bug and
// is safe to ignore. Without this suppression, CRA's dev overlay treats it as a
// fatal error and crashes the UI whenever DevTools or the viewport resizes.

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

initCoreWebVitals();
initSectionTiming();
initLongTaskObserver();
