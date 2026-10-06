import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from './contexts/AuthContext';
import { ThemeCtx } from './contexts/ThemeContext';
import { AppNavigationContext } from './contexts/AppNavigationContext';
import RequireAdmin from './components/RequireAdmin';
import { InvoiceGeneratorContent } from './components/InvoiceGeneratorPage';

// Only middleware-authorized requests can import this module. Its editor and
// tab-only draft never enter the public bundle, navigation state or telemetry.
let workspace = null;
let owner = null;
let logoutRevision = null;
export function syncSession(auth) {
  if ((logoutRevision !== null && logoutRevision !== auth.logoutRevision) ||
    (auth.user?.id && owner && owner !== auth.user.id)) workspace = null;
  logoutRevision = auth.logoutRevision;
  if (auth.status === 'authenticated') owner = auth.user.id;
}

window.addEventListener('beforeunload', event => {
  if (!workspace?.dirty) return;
  event.preventDefault(); event.returnValue = '';
});

export function mountInvoice(host, state) {
  const root = createRoot(host);
  let initialWorkspace = workspace;
  const mountedOwner = owner;
  const mountedRevision = logoutRevision;
  const render = ({ auth, theme, navigation, onReady }) => {
    syncSession(auth);
    if (owner !== mountedOwner || logoutRevision !== mountedRevision) initialWorkspace = null;
    root.render(<React.StrictMode><AuthContext.Provider value={auth}>
      <ThemeCtx.Provider value={theme}><AppNavigationContext.Provider value={navigation}>
        <RequireAdmin key={`${owner}:${logoutRevision}`}><InvoiceGeneratorContent initialWorkspace={initialWorkspace} onReady={onReady}
          onWorkspaceChange={value => {
            if (auth.status === 'authenticated' && owner === auth.user.id && logoutRevision === auth.logoutRevision) workspace = value;
          }} /></RequireAdmin>
      </AppNavigationContext.Provider></ThemeCtx.Provider>
    </AuthContext.Provider></React.StrictMode>);
  };
  render(state);
  return { update: render, dispose: () => root.unmount() };
}
