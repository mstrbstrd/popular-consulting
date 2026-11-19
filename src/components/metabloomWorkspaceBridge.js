import { loadPrivateInvoice } from '../utils/privateInvoiceLoader';
import { parseMetabloomWorkspaceContext, parseMetabloomWorkspaceProposal,
  parseMetabloomWorkspaceReceipt, canonicalWorkspacePayload } from './metabloomWorkspaceProtocol';

const LOCAL_OPERATION_TIMEOUT_MS = 12000;
const INVOICE_PATH = '/invoice-generator';
const authority = auth => auth?.status === 'authenticated' && auth.user?.role === 'admin' && typeof auth.user.id === 'string';
const authKey = auth => JSON.stringify([auth?.status, auth?.user?.id, auth?.user?.role, auth?.logoutRevision]);
const failure = (status, message) => Object.assign(new Error(message), { status });
const aborted = () => failure('cancelled', 'The invoice update was stopped.');
const noAccess = () => failure('unavailable', 'Invoice assistance is unavailable. Your invoice is unchanged.');

// The public application holds only this narrow reference. The editor/controller
// are supplied by the protected module and never imported into this bundle.
export function createMetabloomWorkspaceBridge({ loadInvoice = loadPrivateInvoice, fetchImpl = (...args) => globalThis.fetch(...args),
  digest = async value => {
    if (!globalThis.crypto?.subtle) throw noAccess();
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }, getPath = () => typeof window === 'undefined' ? '' : window.location.pathname,
  timeoutMs = LOCAL_OPERATION_TIMEOUT_MS } = {}) {
  let configuration = {}, controller = null, unsubscribeController = null, generation = 0;
  let configuredAuthKey = null, configuredThread = null, configuredPath = null;
  let state = 'idle', message = '', replacementVersion = null;
  const listeners = new Set(), operations = new Set(), registrations = new Set(), requests = new Map(), receipts = new Map();
  const conversation = () => {
    try { return configuration.getConversationId?.() || null; } catch { return null; }
  };
  const path = () => configuration.pathname ?? getPath();
  const connected = () => {
    if (!authority(configuration.auth) || path() !== INVOICE_PATH || !controller) return false;
    try {
      const status = controller.getStatus?.();
      return Boolean(status?.connected && (!status.conversationId || status.conversationId === conversation()))
        || Boolean(controller.getContext({ conversationId: conversation() }));
    } catch { return false; }
  };
  const getStatus = () => ({ state, message, replacementVersion, connected: connected() });
  const notify = () => {
    const value = getStatus();
    listeners.forEach(listener => { try { listener(value); } catch { /* An optional view cannot own application correctness. */ } });
    try { configuration.onStatus?.(value); } catch { /* View-only callback. */ }
  };
  const status = (next, text = '', version = null) => { state = next; message = text; replacementVersion = version; notify(); };
  const invalidate = () => {
    generation++; requests.clear(); receipts.clear();
    operations.forEach(operation => operation.controller.abort());
    registrations.forEach(wake => wake());
  };
  const check = operation => {
    if (operation.controller.signal.aborted || operation.generation !== generation) throw aborted();
    if (!authority(configuration.auth) || operation.authKey !== authKey(configuration.auth)
      || operation.conversationId !== conversation()) throw aborted();
  };
  const begin = ({ conversationId, signal }, kind, budget = LOCAL_OPERATION_TIMEOUT_MS) => {
    if (!authority(configuration.auth)) throw noAccess();
    if (!conversationId || conversationId !== conversation()) throw aborted();
    const local = new AbortController();
    const operation = { controller: local, generation, authKey: authKey(configuration.auth), conversationId, kind, expired: false };
    const abort = () => local.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { operation.expired = true; local.abort(); registrations.forEach(wake => wake()); },
      Math.min(budget, LOCAL_OPERATION_TIMEOUT_MS, Math.max(1, timeoutMs)));
    operation.close = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); operations.delete(operation); };
    operations.add(operation);
    try { check(operation); } catch (error) { operation.close(); throw error; }
    return operation;
  };
  // Bound even an adapter that ignores AbortSignal. No late continuation below
  // this boundary may commit without its own final synchronous authority check.
  const bounded = (promise, operation) => new Promise((resolve, reject) => {
    const signal = operation.controller.signal;
    const abort = () => reject(operation.expired
      ? failure('unavailable', 'Invoice assistance timed out. Review the invoice before trying again.') : aborted());
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
  const availability = async operation => {
    check(operation);
    const response = await bounded(fetchImpl('/api/metabloom-workspace', { method: 'GET', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', signal: operation.controller.signal, headers: { Accept: 'application/json' } }), operation);
    check(operation);
    if (!response.ok || !response.headers?.get?.('content-type')?.includes('application/json')) throw noAccess();
    let text = '';
    if (response.body?.getReader) {
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      let bytes = 0;
      try {
        for (;;) {
          const part = await bounded(reader.read(), operation); check(operation);
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2048) throw noAccess();
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.cancel().catch(() => {}); reader.releaseLock(); }
    } else {
      text = await bounded(response.text(), operation);
      if (new TextEncoder().encode(text).byteLength > 2048) throw noAccess();
    }
    check(operation);
    let value; try { value = JSON.parse(text); } catch { throw noAccess(); }
    if (!value || Object.keys(value).sort().join(',') !== 'enabled,version' || value.version !== 1 || value.enabled !== true) throw noAccess();
  };
  const waitForController = operation => bounded(new Promise((resolve, reject) => {
    const wake = () => {
      try {
        check(operation);
        if (path() !== INVOICE_PATH || !controller) return;
        const context = parseMetabloomWorkspaceContext(controller.getContext({ conversationId: operation.conversationId }));
        if (!context || context.status !== 'connected' || context.conversationId !== operation.conversationId) return;
        registrations.delete(wake); resolve(context);
      } catch (error) { registrations.delete(wake); reject(error); }
    };
    registrations.add(wake);
    operation.controller.signal.addEventListener('abort', () => { registrations.delete(wake); reject(aborted()); }, { once: true });
    wake();
  }), operation);
  const openWorkspace = async (operation, expectedWorkspaceVersion = null) => {
    status('opening', 'Opening the invoice workspace.');
    await availability(operation); check(operation);
    const entry = await bounded(loadInvoice(operation.controller.signal), operation); check(operation);
    if (typeof entry?.module?.stageGuidedInvoice !== 'function' || typeof configuration.navigate !== 'function') throw noAccess();
    entry.module.syncSession?.(configuration.auth);
    const result = entry.module.stageGuidedInvoice(configuration.auth, { conversationId: operation.conversationId, expectedWorkspaceVersion });
    check(operation);
    if (!['ready', 'replacement_required'].includes(result?.status)) throw noAccess();
    configuration.navigate(INVOICE_PATH);
    if (result.status === 'replacement_required') {
      status('replacement_required', 'An invoice is already open. Choose whether to use it or start a new one.', result.version);
      return { status: 'replacement_required', version: result.version, message };
    }
    // Development StrictMode may register, dispose and register the same editor
    // before this continuation runs. Readiness belongs to the current facade.
    for (;;) {
      const ready = await waitForController(operation); check(operation);
      const current = controller && parseMetabloomWorkspaceContext(controller.getContext({ conversationId: operation.conversationId }));
      if (current?.status === 'connected' && current.workspaceInstanceId === ready.workspaceInstanceId) break;
    }
    status('ready', 'The invoice workspace is ready.');
    return { status: 'ready', message };
  };
  const receipt = (proposal, outcome, text) => ({ version: 1, requestId: proposal?.requestId || 'invalid',
    operationId: proposal?.operationId || 'invalid', status: outcome,
    workspaceInstanceId: proposal?.workspaceInstanceId || null, dataRevision: proposal?.expectedDataRevision || 0,
    message: text, missing: [], total: null, currency: null });
  const remember = (proposal, accepted, operation) => {
    if (operation.generation !== generation) return;
    receipts.set(proposal.operationId, { payload: canonicalWorkspacePayload(proposal), hash: proposal.payloadHash,
      receipt: accepted, generation, authKey: operation.authKey, conversationId: operation.conversationId });
    while (receipts.size > 20) receipts.delete(receipts.keys().next().value);
  };
  const api = {
    configure(next) {
      const oldPath = configuredPath, oldKey = configuredAuthKey, oldThread = configuredThread;
      configuration = { ...configuration, ...next };
      configuredAuthKey = authKey(configuration.auth); configuredThread = conversation(); configuredPath = path();
      const identityChanged = oldKey !== null && (oldKey !== configuredAuthKey || oldThread !== configuredThread);
      const departed = oldPath !== null && oldPath !== configuredPath && configuredPath !== INVOICE_PATH;
      if (identityChanged || departed) invalidate();
      if (identityChanged) {
        controller?.disconnect?.(); status('idle');
      }
      registrations.forEach(wake => wake());
    },
    register(value) {
      if (!value || typeof value.getContext !== 'function' || typeof value.apply !== 'function') throw new Error('Invalid invoice workspace controller.');
      unsubscribeController?.(); controller = value;
      unsubscribeController = typeof value.subscribe === 'function' ? value.subscribe(notify) : null;
      registrations.forEach(wake => wake()); notify();
      return () => {
        if (controller !== value) return;
        unsubscribeController?.(); unsubscribeController = null; controller = null;
        requests.clear(); receipts.clear();
        // Disposing a page always revokes edits. An explicit opening operation
        // can still await its replacement facade within the original deadline.
        // Navigation away, identity changes and Stop invalidate it separately.
        operations.forEach(operation => { if (operation.kind !== 'open') operation.controller.abort(); });
        notify();
      };
    },
    capture({ conversationId, requestId } = {}) {
      if (!authority(configuration.auth) || conversationId !== conversation()) return null;
      let value;
      try {
        value = controller && path() === INVOICE_PATH
          ? parseMetabloomWorkspaceContext(controller.getContext({ conversationId }))
          : parseMetabloomWorkspaceContext({ version: 1, status: 'available', conversationId,
            workspaceInstanceId: null, bindingEpoch: 0, dataRevision: 0, fields: {}, items: [], missing: [], ready: false });
      } catch { return null; }
      if (!value || value.conversationId !== conversationId) return null;
      if (typeof requestId === 'string' && /^[a-zA-Z0-9-]{1,160}$/.test(requestId)) {
        requests.set(requestId, { generation, authKey: authKey(configuration.auth), conversationId, createdAt: Date.now(),
          workspaceInstanceId: value.workspaceInstanceId, bindingEpoch: value.bindingEpoch, dataRevision: value.dataRevision });
        while (requests.size > 20) requests.delete(requests.keys().next().value);
      }
      return value;
    },
    async probe({ conversationId, signal } = {}) {
      let operation;
      try {
        operation = begin({ conversationId, signal }, 'probe', 2000);
        await availability(operation); check(operation); return true;
      } catch { return false; }
      finally { operation?.close(); }
    },
    async open({ conversationId, signal, expectedWorkspaceVersion = null } = {}) {
      let operation;
      try { operation = begin({ conversationId, signal }, 'open'); return await openWorkspace(operation, expectedWorkspaceVersion); }
      catch (error) {
        const outcome = error.status === 'cancelled' && !operation?.expired ? 'cancelled' : 'unavailable';
        const text = outcome === 'cancelled' ? 'Opening the invoice was stopped.' : 'The invoice workspace could not open. Your current invoice is unchanged.';
        if (!operation || operation.generation === generation) status(outcome, text);
        return { status: outcome, message: text };
      } finally { operation?.close(); }
    },
    async apply(value, { conversationId, requestId, signal } = {}) {
      const proposal = parseMetabloomWorkspaceProposal(value, requestId);
      if (!proposal || proposal.conversationId !== conversationId) return receipt(null, 'rejected', 'The invoice update could not be validated.');
      const previous = receipts.get(proposal.operationId);
      if (previous && previous.generation === generation && previous.authKey === authKey(configuration.auth)
        && previous.conversationId === conversationId && conversationId === conversation()) {
        const context = api.capture({ conversationId });
        if (!context || context.workspaceInstanceId !== previous.receipt.workspaceInstanceId)
          return receipt(proposal, 'cancelled', 'This invoice request is no longer active.');
        return previous.payload === canonicalWorkspacePayload(proposal) && previous.hash === proposal.payloadHash
          ? { ...previous.receipt, status: 'duplicate', message: 'This update was already applied. The invoice was not changed again.' }
          : receipt(proposal, 'rejected', 'This invoice operation ID was already used for another request.');
      }
      const binding = requests.get(requestId);
      if (!binding || binding.generation !== generation || binding.authKey !== authKey(configuration.auth)
        || binding.conversationId !== conversationId || Date.now() - binding.createdAt > 90000
        || binding.workspaceInstanceId !== proposal.workspaceInstanceId || binding.bindingEpoch !== proposal.bindingEpoch
        || binding.dataRevision !== proposal.expectedDataRevision)
        return receipt(proposal, 'cancelled', 'This invoice request is no longer active. Send a new message to continue.');
      let operation;
      try {
        operation = begin({ conversationId, signal }, proposal.command);
        const hash = await bounded(digest(canonicalWorkspacePayload(proposal)), operation); check(operation);
        if (hash !== proposal.payloadHash) return receipt(proposal, 'rejected', 'The invoice update could not be validated.');
        if (proposal.command === 'open') {
          const result = await openWorkspace(operation);
          if (result.status !== 'ready') return receipt(proposal, 'conflict', result.message);
          const context = api.capture({ conversationId });
          const applied = { ...receipt(proposal, 'applied', 'The invoice workspace is open. Please add the missing details.'),
            workspaceInstanceId: context.workspaceInstanceId, dataRevision: context.dataRevision, missing: context.missing };
          remember(proposal, applied, operation);
          return applied;
        }
        const target = controller;
        const current = () => {
          check(operation);
          if (!target || target !== controller || path() !== INVOICE_PATH) throw aborted();
          const context = parseMetabloomWorkspaceContext(target.getContext({ conversationId }));
          if (!context || context.status !== 'connected' || context.workspaceInstanceId !== proposal.workspaceInstanceId
            || context.bindingEpoch !== proposal.bindingEpoch) throw aborted();
          return context;
        };
        current(); status('applying', 'Applying the validated invoice update.');
        await availability(operation);
        await bounded(loadInvoice(operation.controller.signal), operation);
        // There are no awaits between this final binding check and invoking the
        // private controller. Its own atomic revision check is the commit gate.
        current();
        const application = target.apply(proposal, { conversationId, signal: operation.controller.signal });
        // A synchronous commit receipt wins over Stop pressed after the commit.
        const result = application && typeof application.then === 'function' ? await bounded(application, operation) : application;
        const accepted = parseMetabloomWorkspaceReceipt(result);
        if (!accepted || accepted.operationId !== proposal.operationId || accepted.requestId !== requestId)
          throw failure('unavailable', 'The page could not confirm the update. Review the invoice before trying again.');
        if (operation.generation === generation) {
          status(accepted.status, accepted.message);
          if (['applied', 'duplicate'].includes(accepted.status)) remember(proposal, accepted, operation);
        }
        return accepted;
      } catch (error) {
        const outcome = ['cancelled', 'conflict', 'rejected'].includes(error.status) ? error.status : 'unavailable';
        const text = outcome === 'cancelled' ? 'The invoice update was stopped. Review any changes already applied.'
          : 'The page could not confirm the update. Review the invoice before trying again.';
        if (!operation || operation.generation === generation) status(outcome, text);
        return receipt(proposal, outcome, text);
      } finally { operation?.close(); requests.delete(requestId); }
    },
    release(requestId) { requests.delete(requestId); },
    disconnect() { invalidate(); controller?.disconnect?.(); status('disconnected', 'This invoice is disconnected from chat.'); },
    cancel() { invalidate(); status('cancelled', 'Invoice assistance stopped.'); },
    getConversationId: conversation,
    getStatus,
    notify,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return api;
}

export const metabloomWorkspaceBridge = createMetabloomWorkspaceBridge();
