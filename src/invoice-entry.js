import './patchResizeObserver';
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './aetheris-site.css';
import './navigation-cohesion.css';
import './spectral-icon-colorway.css';
import './immersive-viewport.css';
import { AuthProvider } from './contexts/AuthContext';
import RequireAdmin from './components/RequireAdmin';
import { InvoiceGeneratorContent } from './components/InvoiceGeneratorPage';
import { ThemeProvider } from './contexts/ThemeContext';
import { initImmersiveViewport } from './utils/immersiveViewport';
import { initGraphicsContextGovernor } from './utils/graphicsContextGovernor';
import { initGraphicsRuntimeBoundary } from './utils/graphicsRuntimeBoundary';
import InteractionAccessibilityBridge from './components/InteractionAccessibilityBridge';

// This entrypoint and all its emitted assets are delivered only after middleware authorization.
// No public telemetry or public application router runs inside the private workspace.
initImmersiveViewport();
initGraphicsContextGovernor();
initGraphicsRuntimeBoundary();
createRoot(document.getElementById('root')).render(
  <React.StrictMode><AuthProvider><InteractionAccessibilityBridge />
    <ThemeProvider enableBackground={false}><RequireAdmin><InvoiceGeneratorContent /></RequireAdmin></ThemeProvider>
  </AuthProvider></React.StrictMode>,
);
