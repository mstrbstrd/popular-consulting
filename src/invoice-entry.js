import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from './contexts/AuthContext';
import { ThemeCtx } from './contexts/ThemeContext';
import { AppNavigationContext } from './contexts/AppNavigationContext';
import RequireAdmin from './components/RequireAdmin';
import { InvoiceGeneratorContent } from './components/InvoiceGeneratorPage';
import { invoiceForHandoff } from './components/metabloomInvoiceDraft';

// Only middleware-authorized requests can import this module. Its editor and
// tab-only draft never enter the public bundle, navigation state or telemetry.
let workspace = null;
let owner = null;
let logoutRevision = null;
let workspaceVersion = 0;
let workspaceGeneration = 0;
export function syncSession(auth) {
  if ((logoutRevision !== null && logoutRevision !== auth.logoutRevision) ||
    (auth.user?.id && owner && owner !== auth.user.id)) {
    workspace = null; workspaceVersion++; workspaceGeneration++;
  }
  logoutRevision = auth.logoutRevision;
  if (auth.status === 'authenticated') owner = auth.user.id;
}

// Called only after the user selects a chat review card and the protected
// manifest is rechecked. Return status/version only, never the local invoice.
export function stageChatInvoice(draft, auth, expectedWorkspaceVersion = null) {
  if (auth.status !== 'authenticated' || auth.user?.role !== 'admin' || !owner
    || auth.user.id !== owner || auth.logoutRevision !== logoutRevision) throw new Error('Sign in again before opening this invoice.');
  const invoice = invoiceForHandoff(draft);
  const chatDraftKey = `${draft.id}:${draft.revision}`;
  if (workspace?.chatDraftKey === chatDraftKey) return { status: 'ready' };
  if (workspace && expectedWorkspaceVersion !== workspaceVersion) return { status: 'replacement_required', version: workspaceVersion };
  workspace = { invoice, dirty: true, savedOnDevice: false, view: 'preview', chatDraftKey };
  workspaceVersion++; workspaceGeneration++;
  return { status: 'ready' };
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
  let mountedGeneration = workspaceGeneration;
  let activeOwner = owner, activeRevision = logoutRevision;
  const render = ({ auth, theme, navigation, onReady }) => {
    syncSession(auth);
    if (owner !== activeOwner || logoutRevision !== activeRevision) {
      mountedGeneration = workspaceGeneration; activeOwner = owner; activeRevision = logoutRevision;
    }
    const writerGeneration = mountedGeneration;
    if (owner !== mountedOwner || logoutRevision !== mountedRevision) initialWorkspace = null;
    root.render(<React.StrictMode><AuthContext.Provider value={auth}>
      <ThemeCtx.Provider value={theme}><AppNavigationContext.Provider value={navigation}>
        <RequireAdmin key={`${owner}:${logoutRevision}`}><InvoiceGeneratorContent initialWorkspace={initialWorkspace} onReady={onReady}
          onWorkspaceChange={value => {
            if (auth.status === 'authenticated' && owner === auth.user.id && logoutRevision === auth.logoutRevision
              && writerGeneration === workspaceGeneration) {
              workspace = value;
              workspaceVersion++;
            }
          }} /></RequireAdmin>
      </AppNavigationContext.Provider></ThemeCtx.Provider>
    </AuthContext.Provider></React.StrictMode>);
  };
  render(state);
  return { update: render, dispose: () => root.unmount() };
}
