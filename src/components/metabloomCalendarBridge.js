import {
  METABLOOM_CALENDAR_VERSION,
  CALENDAR_VIEWS,
  isValidTimeZone,
  isIsoDate,
  isIsoDateTime,
  parseCalendarFocus,
  parseCalendarProposal,
  canonicalCalendarPayload,
} from './metabloomCalendarProtocol';

const LOCAL_OPERATION_TIMEOUT_MS = 12000;
const CALENDAR_PATH = '/calendar';
const MAX_RECEIPT_CACHE = 20;

const isCalendarPath = pathname => /^\/calendar(?:\/index\.html)?\/?$/.test(pathname || '');
const authority = auth => auth?.status === 'authenticated' && auth.user?.role === 'admin' && typeof auth.user.id === 'string';
const authKey = auth => JSON.stringify([auth?.status, auth?.user?.id, auth?.user?.role, auth?.logoutRevision]);
const safeEventId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
const failure = (status, message) => Object.assign(new Error(message), { status });
const aborted = () => failure('cancelled', 'The calendar action was stopped.');
const noAccess = () => failure('unavailable', 'Calendar assistance is unavailable.');

function defaultTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : 'UTC';
  } catch {
    return 'UTC';
  }
}

function sanitizeFocus(value) {
  if (!value || typeof value !== 'object') return null;
  const date = isIsoDate(value.date) ? value.date : null;
  const view = CALENDAR_VIEWS.includes(value.view) ? value.view : null;
  const eventId = safeEventId(value.eventId) ? value.eventId : null;
  if (date === null && view === null && eventId === null) return null;
  return parseCalendarFocus({ date, view, eventId });
}

function sanitizeContext(raw, conversationId, status) {
  const visibleStart = (isIsoDate(raw?.visibleStart) || isIsoDateTime(raw?.visibleStart)) ? raw.visibleStart : null;
  const visibleEnd = (isIsoDate(raw?.visibleEnd) || isIsoDateTime(raw?.visibleEnd)) ? raw.visibleEnd : null;
  const view = CALENDAR_VIEWS.includes(raw?.view) ? raw.view : 'month';
  const timeZone = isValidTimeZone(raw?.timeZone) ? raw.timeZone : defaultTimeZone();
  const selectedEventId = safeEventId(raw?.selectedEventId) ? raw.selectedEventId : null;
  const dataRevision = Number.isSafeInteger(raw?.dataRevision) && raw.dataRevision >= 0 ? raw.dataRevision : 0;

  return {
    version: METABLOOM_CALENDAR_VERSION,
    status: status === 'connected' ? 'connected' : 'available',
    conversationId: typeof conversationId === 'string' && conversationId ? conversationId : null,
    visibleStart,
    visibleEnd,
    view,
    timeZone,
    selectedEventId,
    dataRevision,
  };
}

// Narrow companion bridge between Metabloom chat and the live /calendar page.
// Exposes only approved view context (never raw private event dumps) and
// handles navigation/focus/refresh coordination while mutations stay server-authoritative.
export function createMetabloomCalendarBridge({
  digest = async value => {
    if (!globalThis.crypto?.subtle) throw noAccess();
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  },
  getPath = () => (typeof window === 'undefined' ? '' : window.location.pathname),
  timeoutMs = LOCAL_OPERATION_TIMEOUT_MS,
} = {}) {
  let configuration = {};
  let controller = null;
  let unsubscribeController = null;
  let generation = 0;
  let configuredAuthKey = null;
  let configuredThread = null;
  let configuredPath = null;
  let state = 'idle';
  let message = '';
  let lastRefreshAt = null;
  let pendingFocus = null;

  const listeners = new Set();
  const operations = new Set();
  const receipts = new Map();

  const conversation = () => {
    try { return configuration.getConversationId?.() || null; } catch { return null; }
  };

  const path = () => (configuration.pathname !== undefined ? configuration.pathname : getPath());

  const connected = () => {
    if (!authority(configuration.auth) || !isCalendarPath(path()) || !controller) return false;
    try {
      return Boolean(controller.getContext({ conversationId: conversation() }));
    } catch {
      return false;
    }
  };

  const getStatus = () => ({
    state,
    message,
    connected: connected(),
    lastRefreshAt,
  });

  const notify = () => {
    const value = getStatus();
    listeners.forEach(listener => {
      try { listener(value); } catch { /* View-only listener. */ }
    });
    try { configuration.onStatus?.(value); } catch { /* View-only callback. */ }
  };

  const setStatus = (nextState, nextMessage = '') => {
    state = nextState;
    message = nextMessage;
    notify();
  };

  const invalidate = () => {
    generation += 1;
    receipts.clear();
    pendingFocus = null;
    operations.forEach(operation => operation.controller.abort());
  };

  const check = operation => {
    if (operation.controller.signal.aborted || operation.generation !== generation) throw aborted();
    if (!authority(configuration.auth) || operation.authKey !== authKey(configuration.auth)) throw aborted();
    const activeThread = conversation();
    if (activeThread && operation.conversationId && operation.conversationId !== activeThread) throw aborted();
  };

  const begin = ({ conversationId, signal }, kind, budget = LOCAL_OPERATION_TIMEOUT_MS) => {
    if (!authority(configuration.auth)) throw noAccess();
    const activeThread = conversation();
    if (activeThread && conversationId && conversationId !== activeThread) throw aborted();
    const local = new AbortController();
    const operation = {
      controller: local,
      generation,
      authKey: authKey(configuration.auth),
      conversationId: conversationId || activeThread || null,
      kind,
      expired: false,
    };
    const abort = () => local.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => {
      operation.expired = true;
      local.abort();
    }, Math.min(budget, LOCAL_OPERATION_TIMEOUT_MS, Math.max(1, timeoutMs)));
    operation.close = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      operations.delete(operation);
    };
    operations.add(operation);
    try { check(operation); } catch (error) { operation.close(); throw error; }
    return operation;
  };

  const bounded = (promise, operation) => new Promise((resolve, reject) => {
    const signal = operation.controller.signal;
    const abort = () => reject(operation.expired
      ? failure('unavailable', 'Calendar assistance timed out.') : aborted());
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });

  const makeReceipt = (proposal, outcome, text) => ({
    version: METABLOOM_CALENDAR_VERSION,
    requestId: proposal?.requestId || 'invalid',
    operationId: proposal?.operationId || 'invalid',
    status: outcome,
    calendarVersion: null,
    eventId: proposal?.focus?.eventId || proposal?.eventId || null,
    eventRevision: null,
    undoToken: null,
    requiresConfirmation: false,
    message: text,
    event: null,
  });

  const remember = (proposal, accepted, operation) => {
    if (operation.generation !== generation) return;
    receipts.set(proposal.operationId, {
      payload: canonicalCalendarPayload(proposal),
      hash: proposal.payloadHash,
      receipt: accepted,
      generation,
      authKey: operation.authKey,
      conversationId: operation.conversationId,
    });
    while (receipts.size > MAX_RECEIPT_CACHE) {
      receipts.delete(receipts.keys().next().value);
    }
  };

  const flushPendingFocus = target => {
    if (!pendingFocus || !target) return;
    if (pendingFocus.generation !== generation || pendingFocus.authKey !== authKey(configuration.auth)) {
      pendingFocus = null;
      return;
    }
    if (!authority(configuration.auth) || !isCalendarPath(path())) return;
    const nextFocus = pendingFocus.focus;
    pendingFocus = null;
    try { target.focus?.(nextFocus); } catch { /* Controller focus is best-effort on mount. */ }
  };

  const api = {
    configure(next = {}) {
      const oldPath = configuredPath;
      const oldKey = configuredAuthKey;
      const oldThread = configuredThread;
      configuration = { ...configuration, ...next };
      configuredAuthKey = authKey(configuration.auth);
      configuredThread = conversation();
      configuredPath = path();

      const authChanged = oldKey !== null && oldKey !== configuredAuthKey;
      const threadChanged = oldThread !== null && configuredThread !== null && oldThread !== configuredThread;
      const departed = oldPath !== null && isCalendarPath(oldPath) && !isCalendarPath(configuredPath);

      if (authChanged || threadChanged) {
        invalidate();
        controller?.disconnect?.();
        lastRefreshAt = null;
        setStatus('idle');
        return;
      }

      if (departed) {
        operations.forEach(operation => {
          if (operation.kind !== 'open') operation.controller.abort();
        });
      }

      if (isCalendarPath(configuredPath) && controller) {
        flushPendingFocus(controller);
      }

      notify();
    },

    register(nextController) {
      if (!nextController || typeof nextController.getContext !== 'function') {
        throw new Error('Invalid calendar workspace controller.');
      }
      unsubscribeController?.();
      controller = nextController;
      unsubscribeController = typeof nextController.subscribe === 'function'
        ? nextController.subscribe(notify)
        : null;
      flushPendingFocus(nextController);
      notify();
      return () => api.unregister(nextController);
    },

    unregister(targetController) {
      if (targetController && controller !== targetController) return;
      unsubscribeController?.();
      unsubscribeController = null;
      controller = null;
      operations.forEach(operation => {
        if (operation.kind !== 'open') operation.controller.abort();
      });
      notify();
    },

    capture({ conversationId } = {}) {
      if (!authority(configuration.auth)) return null;
      const activeThread = conversation();
      if (conversationId !== undefined && activeThread !== null && conversationId !== activeThread) {
        return null;
      }
      const resolvedConversationId = conversationId !== undefined ? conversationId : activeThread;
      if (controller && isCalendarPath(path())) {
        try {
          const raw = controller.getContext({ conversationId: resolvedConversationId });
          if (raw && typeof raw === 'object') {
            return sanitizeContext(raw, resolvedConversationId, 'connected');
          }
        } catch {
          return null;
        }
      }
      return sanitizeContext(null, resolvedConversationId, 'available');
    },

    async apply(value, { requestId, conversationId, signal } = {}) {
      const proposal = parseCalendarProposal(value, requestId);
      if (!proposal) {
        return makeReceipt(null, 'rejected', 'The calendar proposal could not be validated.');
      }
      if (conversationId !== undefined && proposal.conversationId !== conversationId) {
        return makeReceipt(proposal, 'rejected', 'The calendar proposal does not match this conversation.');
      }
      if (!['open', 'focus'].includes(proposal.command)) {
        return makeReceipt(proposal, 'rejected', 'Calendar mutations must execute through the calendar API.');
      }
      if (!authority(configuration.auth)) {
        return makeReceipt(proposal, 'unavailable', 'Calendar assistance is unavailable.');
      }

      const previous = receipts.get(proposal.operationId);
      if (previous
        && previous.generation === generation
        && previous.authKey === authKey(configuration.auth)
        && previous.conversationId === proposal.conversationId) {
        return previous.payload === canonicalCalendarPayload(proposal) && previous.hash === proposal.payloadHash
          ? { ...previous.receipt, status: 'duplicate', message: 'This calendar action was already applied.' }
          : makeReceipt(proposal, 'rejected', 'This calendar operation ID was already used for another request.');
      }

      let operation;
      try {
        operation = begin({ conversationId: proposal.conversationId, signal }, proposal.command);
        const computedHash = await bounded(digest(canonicalCalendarPayload(proposal)), operation);
        check(operation);
        if (computedHash !== proposal.payloadHash) {
          return makeReceipt(proposal, 'rejected', 'The calendar proposal signature did not match.');
        }

        if (proposal.command === 'open') {
          setStatus('opening', 'Opening your calendar.');
          if (controller && isCalendarPath(path())) {
            if (proposal.focus) {
              await bounded(Promise.resolve(controller.focus?.(proposal.focus)), operation);
              check(operation);
            }
          } else {
            if (typeof configuration.navigate !== 'function') throw noAccess();
            pendingFocus = proposal.focus
              ? { focus: proposal.focus, generation, authKey: authKey(configuration.auth) }
              : null;
            configuration.navigate(CALENDAR_PATH);
          }
          const applied = makeReceipt(proposal, 'applied', 'Opened your calendar workspace.');
          remember(proposal, applied, operation);
          setStatus('ready', applied.message);
          return applied;
        }

        // proposal.command === 'focus'
        setStatus('focusing', 'Updating your calendar view.');
        if (controller && isCalendarPath(path())) {
          await bounded(Promise.resolve(controller.focus?.(proposal.focus)), operation);
          check(operation);
        } else if (typeof configuration.navigate === 'function') {
          pendingFocus = { focus: proposal.focus, generation, authKey: authKey(configuration.auth) };
          configuration.navigate(CALENDAR_PATH);
        } else {
          throw noAccess();
        }
        const applied = makeReceipt(proposal, 'applied', 'Updated your calendar view.');
        remember(proposal, applied, operation);
        setStatus('ready', applied.message);
        return applied;
      } catch (error) {
        const outcome = ['cancelled', 'conflict', 'rejected'].includes(error?.status) ? error.status : 'unavailable';
        const text = outcome === 'cancelled'
          ? 'The calendar action was stopped.'
          : 'Could not update the calendar view.';
        if (!operation || operation.generation === generation) setStatus(outcome, text);
        return makeReceipt(proposal, outcome, text);
      } finally {
        operation?.close();
      }
    },

    notifyRefresh({ date, view, eventId } = {}) {
      if (!authority(configuration.auth)) return false;
      const focus = sanitizeFocus({ date, view, eventId });
      lastRefreshAt = Date.now();
      if (controller && isCalendarPath(path())) {
        try {
          if (typeof controller.refresh === 'function') {
            controller.refresh(focus || {});
          } else if (focus && typeof controller.focus === 'function') {
            controller.focus(focus);
          }
          setStatus('ready', 'Calendar refreshed.');
          return true;
        } catch {
          return false;
        }
      }
      if (focus) {
        pendingFocus = { focus, generation, authKey: authKey(configuration.auth) };
      }
      notify();
      return false;
    },

    getStatus,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    disconnect() {
      invalidate();
      controller?.disconnect?.();
      lastRefreshAt = null;
      setStatus('disconnected', 'Calendar disconnected from chat.');
    },

    cancel() {
      invalidate();
      setStatus('cancelled', 'Calendar assistance stopped.');
    },
  };

  return api;
}

export const metabloomCalendarBridge = createMetabloomCalendarBridge();
