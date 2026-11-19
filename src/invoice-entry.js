import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext } from './contexts/AuthContext';
import { ThemeCtx } from './contexts/ThemeContext';
import { AppNavigationContext } from './contexts/AppNavigationContext';
import RequireAdmin from './components/RequireAdmin';
import { InvoiceGeneratorContent } from './components/InvoiceGeneratorPage';
import { invoiceForHandoff } from './components/metabloomInvoiceDraft';
import { createGuidedInvoice, createInvoiceWorkspaceController } from './utils/invoiceWorkspaceController';
import { generateInvoiceNumber, invoiceDateToday } from './utils/invoice';
import { isMetabloomThreadId } from './components/metabloomThreadProtocol';

// Only middleware-authorized requests can import this module. Its editor and
// tab-only draft never enter the public bundle, navigation state or telemetry.
let workspace = null;
let owner = null;
let logoutRevision = null;
let workspaceVersion = 0;
let workspaceGeneration = 0;
const mountedWorkspaces = new Set();
const authorized = auth => auth.status === 'authenticated' && auth.user?.role === 'admin'
  && owner && auth.user.id === owner && auth.logoutRevision === logoutRevision;
export function syncSession(auth) {
  if ((logoutRevision !== null && logoutRevision !== auth.logoutRevision) ||
    (auth.user?.id && owner && owner !== auth.user.id)) {
    workspace = null; workspaceVersion++; workspaceGeneration++;
  }
  logoutRevision = auth.logoutRevision;
  if (auth.status === 'authenticated') owner = auth.user.id;
}

export function getWorkspaceStatus(auth) {
  if (!authorized(auth)) throw new Error('Sign in again before opening this invoice.');
  return { exists: Boolean(workspace), version: workspaceVersion,
    connectedConversationId: workspace?.assistance?.conversationId || null };
}

export function stageGuidedInvoice(auth, { conversationId, expectedWorkspaceVersion = null } = {}) {
  if (!authorized(auth) || !isMetabloomThreadId(conversationId)) throw new Error('Sign in again before opening this invoice.');
  if (!globalThis.crypto?.getRandomValues) throw new Error('This browser cannot securely connect an invoice to chat. The manual editor is still available.');
  if (workspace?.assistance?.conversationId === conversationId) return { status: 'ready' };
  if (workspace && expectedWorkspaceVersion !== workspaceVersion) return { status: 'replacement_required', version: workspaceVersion };
  const invoice = createGuidedInvoice(generateInvoiceNumber(invoiceDateToday()));
  const controller = createInvoiceWorkspaceController({ invoice, assistance: { guided: true, conversationId } });
  workspace = { invoice, assistance: controller.getAssistance(), dirty: true, savedOnDevice: false, view: 'editor' };
  workspaceVersion++; workspaceGeneration++;
  mountedWorkspaces.forEach(refresh => refresh());
  return { status: 'ready' };
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
  mountedWorkspaces.forEach(refresh => refresh());
  return { status: 'ready' };
}

window.addEventListener('beforeunload', event => {
  if (!workspace?.dirty) return;
  event.preventDefault(); event.returnValue = '';
});

export function mountInvoice(host, state) {
  const root = createRoot(host);
  let initialWorkspace = workspace;
  let currentState = state;
  const mountedOwner = owner;
  const mountedRevision = logoutRevision;
  let mountedGeneration = workspaceGeneration;
  let activeOwner = owner, activeRevision = logoutRevision;
  const render = ({ auth, theme, navigation, onReady, workspaceBridge }) => {
    currentState = { auth, theme, navigation, onReady, workspaceBridge };
    syncSession(auth);
    if (owner !== activeOwner || logoutRevision !== activeRevision) {
      mountedGeneration = workspaceGeneration; activeOwner = owner; activeRevision = logoutRevision;
    }
    if (mountedGeneration !== workspaceGeneration && owner === mountedOwner && logoutRevision === mountedRevision) {
      mountedGeneration = workspaceGeneration; initialWorkspace = workspace;
    }
    const writerGeneration = mountedGeneration;
    if (owner !== mountedOwner || logoutRevision !== mountedRevision) initialWorkspace = null;
    root.render(<React.StrictMode><AuthContext.Provider value={auth}>
      <ThemeCtx.Provider value={theme}><AppNavigationContext.Provider value={navigation}>
        <RequireAdmin key={`${owner}:${logoutRevision}:${workspaceGeneration}`}><InvoiceGeneratorContent initialWorkspace={initialWorkspace} onReady={onReady}
          workspaceBridge={workspaceBridge} isWorkspaceAuthorized={() => authorized(currentState.auth)
            && writerGeneration === workspaceGeneration}
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
  const refresh = () => { if (authorized(currentState.auth)) render(currentState); };
  mountedWorkspaces.add(refresh);
  render(state);
  return { update: render, dispose: () => { mountedWorkspaces.delete(refresh); root.unmount(); } };
}
