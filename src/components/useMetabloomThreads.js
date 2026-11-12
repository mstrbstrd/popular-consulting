import React from 'react';
import { createMetabloomThreadSnapshot, parseMetabloomThreadSnapshot,
  parseMetabloomThreadMetadata, isMetabloomThreadId } from './metabloomThreadProtocol';
import { requestMetabloomThread, METABLOOM_THREAD_ERRORS } from './metabloomThreadApiClient';
import { isMetabloomThreadsDocked } from './MetabloomThreadsPanel';

const newId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const emptySnapshot = () => ({ schemaVersion: 1,
  conversation: { messages: [], counter: 0, draft: '', deepResearch: false },
  visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
const hasContent = snapshot => snapshot.conversation.messages.length > 0 || snapshot.conversation.draft.length > 0;
const titleFor = snapshot => {
  const text = (snapshot.conversation.messages.find(message => message.role === 'user')
    || snapshot.conversation.messages[0])?.content || snapshot.conversation.draft;
  return Array.from(text).filter(character => {
    const code = character.charCodeAt(0);
    return code >= 32 && !(code >= 127 && code <= 159) && !(code >= 0x202a && code <= 0x202e)
      && !(code >= 0x2066 && code <= 0x2069);
  }).join('').replace(/\s+/g, ' ').trim().slice(0, 80) || 'New chat';
};
const sortThreads = items => [...items].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)
  || first.threadId.localeCompare(second.threadId));
const publicError = error => METABLOOM_THREAD_ERRORS[error?.code] || METABLOOM_THREAD_ERRORS.threads_unavailable;

// A session owns both restore units and both live readers. It is replaced only
// after a destination has loaded and the outgoing snapshot has been confirmed.
function createSession({ snapshot, thread = null, id, confirmedSnapshot = null, inactive = false }, changed) {
  const session = { key: inactive ? 'inactive' : newId(), id: thread?.threadId || id || (inactive ? null : newId()), thread, snapshot,
    confirmedSnapshot, locked: false, saving: null, saveError: null,
    conversationReader: null, visualsReader: null, visualPendingReader: null,
    parts: { orb: snapshot.conversation, orbVisuals: snapshot.visuals, orbWorkspace: snapshot.workspace } };
  session.changed = () => changed(session);
  session.getToolState = key => session.parts[key];
  session.saveToolState = (key, value) => {
    if (!Object.prototype.hasOwnProperty.call(session.parts, key)) return;
    session.parts[key] = value;
    session.changed();
  };
  session.registerConversation = reader => {
    session.conversationReader = reader;
    session.changed();
    return () => {
      if (session.conversationReader !== reader) return;
      session.parts.orb = reader();
      session.conversationReader = null;
    };
  };
  session.registerVisuals = (reader, pendingReader) => {
    session.visualsReader = reader;
    session.visualPendingReader = pendingReader;
    session.changed();
    return () => {
      if (session.visualsReader !== reader) return;
      const state = reader((session.conversationReader?.() || session.parts.orb).messages);
      session.parts.orbVisuals = state.visuals;
      session.parts.orbWorkspace = state.workspace;
      session.visualsReader = null;
      session.visualPendingReader = null;
    };
  };
  session.isPending = () => session.conversationReader?.().pending === true || session.visualPendingReader?.() === true;
  session.capture = () => {
    const conversation = session.conversationReader?.() || session.parts.orb;
    const work = session.visualsReader?.(conversation.messages)
      || { visuals: session.parts.orbVisuals, workspace: session.parts.orbWorkspace };
    const snapshot = createMetabloomThreadSnapshot({ conversation, ...work });
    if (!snapshot) throw Object.assign(new Error(METABLOOM_THREAD_ERRORS.threads_limit), { code: 'threads_limit' });
    session.snapshot = snapshot;
    return { snapshot, pending: session.isPending() };
  };
  return session;
}

export default function useMetabloomThreads({ navigation, enabled, request = requestMetabloomThread }) {
  const notifications = React.useRef(() => {});
  const mounted = React.useRef(false);
  const lifecycle = React.useRef(0);
  const current = React.useRef(null);
  const timers = React.useRef({ capture: 0, save: 0 });
  const requests = React.useRef(new Set());
  const busyRef = React.useRef(false);
  const itemsRef = React.useRef([]);
  const mutations = React.useRef({ revision: 0, items: new Map() });
  const listRequest = React.useRef(0);
  const navigationRef = React.useRef(navigation);
  navigationRef.current = navigation;
  const [expanded, setExpanded] = React.useState(() => navigation?.getToolState('orbThreads')?.expanded === true);
  const expandedRef = React.useRef(expanded);
  expandedRef.current = expanded;
  const [view, setView] = React.useState({ items: [], loading: enabled, busy: false, pending: false,
    error: '', saveStatus: 'New chat', canSaveCopy: false });
  const [session, setSession] = React.useState(() => {
    if (!enabled) return createSession({ snapshot: emptySnapshot(), inactive: true }, () => {});
    const cached = navigation?.getToolState('orbThreads');
    const snapshot = parseMetabloomThreadSnapshot(cached?.snapshot);
    const thread = parseMetabloomThreadMetadata(cached?.thread);
    if (snapshot && isMetabloomThreadId(cached?.id) && (!thread || thread.threadId === cached.id)) return createSession({ snapshot, thread, id: cached.id,
      confirmedSnapshot: parseMetabloomThreadSnapshot(cached.confirmedSnapshot) }, item => notifications.current(item));
    const empty = emptySnapshot();
    const retained = { schemaVersion: 1, conversation: navigation?.getToolState('orb') || empty.conversation,
      visuals: navigation?.getToolState('orbVisuals') || empty.visuals, workspace: navigation?.getToolState('orbWorkspace') || null };
    // Keep a pre-existing in-memory conversation visible even if it cannot yet
    // be archived. Validation then reports an error rather than dropping it.
    const legacy = createMetabloomThreadSnapshot(retained);
    return createSession({ snapshot: legacy || retained }, item => notifications.current(item));
  });
  current.current = session;
  const active = React.useCallback((item, epoch = lifecycle.current) => mounted.current && enabled
    && lifecycle.current === epoch && current.current === item, [enabled]);
  const remember = React.useCallback(item => {
    if (!enabled || current.current !== item) return;
    navigationRef.current?.saveToolState('orbThreads', { id: item.id, thread: item.thread,
      snapshot: item.snapshot, confirmedSnapshot: item.confirmedSnapshot, expanded: expandedRef.current });
  }, [enabled]);
  const updateItem = React.useCallback(thread => {
    mutations.current.items.set(thread.threadId, { revision: ++mutations.current.revision, thread });
    itemsRef.current = sortThreads([...itemsRef.current.filter(item => item.threadId !== thread.threadId), thread]);
    setView(previous => ({ ...previous, items: itemsRef.current }));
  }, []);
  const call = React.useCallback(async input => {
    const controller = new AbortController();
    requests.current.add(controller);
    try { return await request(input, { signal: controller.signal }); }
    finally { requests.current.delete(controller); }
  }, [request]);
  const dirty = item => JSON.stringify(item.snapshot) !== JSON.stringify(item.confirmedSnapshot);
  const showFailure = React.useCallback((item, error) => {
    item.saveError = error?.code || 'threads_unavailable';
    setView(previous => ({ ...previous, error: publicError(error), saveStatus: 'Not saved',
      canSaveCopy: ['threads_conflict', 'threads_deleted', 'threads_not_found'].includes(item.saveError) }));
  }, []);

  const save = React.useCallback(async item => {
    const epoch = lifecycle.current;
    if (!active(item, epoch)) return false;
    if (item.saving) return item.saving;
    let snapshot;
    try { ({ snapshot } = item.capture()); }
    catch (error) { showFailure(item, error); return false; }
    remember(item);
    if ((!hasContent(snapshot) && !item.thread) || !dirty(item)) return true;
    const title = item.thread?.title || titleFor(snapshot);
    const expectedVersion = item.thread?.version || 0;
    const operation = (async () => {
      setView(previous => ({ ...previous, saveStatus: 'Saving…' }));
      try {
        const response = await call({ action: 'save', threadId: item.id, expectedVersion, title, snapshot });
        if (!active(item, epoch)) return false;
        item.thread = response.thread;
        item.confirmedSnapshot = snapshot;
        item.saveError = null;
        updateItem(response.thread);
        remember(item);
        setView(previous => ({ ...previous, error: '', canSaveCopy: false,
          saveStatus: dirty(item) ? 'Unsaved changes' : previous.pending ? 'Receiving reply…' : 'Saved' }));
        return true;
      } catch (error) {
        if (active(item, epoch)) showFailure(item, error);
        return false;
      } finally {
        if (item.saving === operation) item.saving = null;
        if (active(item, epoch) && !item.saveError && dirty(item)) item.changed();
      }
    })();
    item.saving = operation;
    return operation;
  }, [active, call, remember, showFailure, updateItem]);

  const capture = React.useCallback(item => {
    if (!active(item) || !item.conversationReader || !item.visualsReader) return;
    try {
      const result = item.capture();
      remember(item);
      setView(previous => ({ ...previous, pending: result.pending,
        saveStatus: item.saving ? 'Saving…' : item.saveError ? 'Not saved'
          : !hasContent(result.snapshot) && !item.thread ? 'New chat'
            : dirty(item) ? 'Unsaved changes' : result.pending ? 'Receiving reply…' : 'Saved' }));
      window.clearTimeout(timers.current.save);
      if (!item.locked && (hasContent(result.snapshot) || item.thread) && dirty(item) && !item.saveError) {
        timers.current.save = window.setTimeout(() => save(item), 1200);
      }
    } catch (error) { showFailure(item, error); }
  }, [active, remember, save, showFailure]);
  notifications.current = item => {
    if (!active(item)) return;
    window.clearTimeout(timers.current.capture);
    timers.current.capture = window.setTimeout(() => capture(item), 0);
  };

  const refresh = React.useCallback(async () => {
    const epoch = lifecycle.current;
    if (!mounted.current || !enabled) return false;
    const requestId = ++listRequest.current;
    const revision = mutations.current.revision;
    setView(previous => ({ ...previous, loading: true }));
    try {
      const response = await call({ action: 'list' });
      if (!mounted.current || lifecycle.current !== epoch || requestId !== listRequest.current) return false;
      // A list never replaces the active thread's confirmed concurrency token.
      const items = new Map(response.items.map(thread => [thread.threadId, thread]));
      for (const [id, change] of mutations.current.items) {
        if (change.revision <= revision) continue;
        if (change.thread) items.set(id, change.thread);
        else items.delete(id);
      }
      itemsRef.current = sortThreads([...items.values()]);
      setView(previous => ({ ...previous, items: itemsRef.current, loading: false,
        error: current.current.saveError ? previous.error : '' }));
      return true;
    } catch (error) {
      if (mounted.current && lifecycle.current === epoch && requestId === listRequest.current)
        setView(previous => ({ ...previous, loading: false, error: publicError(error) }));
      return false;
    }
  }, [call, enabled]);

  const flush = React.useCallback(async item => {
    window.clearTimeout(timers.current.save);
    if (item.saving && !(await item.saving)) return false;
    if (!active(item)) return false;
    // Do not leave behind an async component update that settled during a
    // prior write. Nothing is discarded until the latest capture is confirmed.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (!(await save(item)) || !active(item)) return false;
      item.capture();
      if ((!hasContent(item.snapshot) && !item.thread) || !dirty(item)) return true;
    }
    showFailure(item, { code: 'threads_unavailable' });
    return false;
  }, [active, save, showFailure]);
  const install = React.useCallback((snapshot, thread = null) => {
    // A historical receipt does not establish that a separately saved artifact
    // still exists. Preserve the association, but show a neutral save status.
    if (thread) snapshot = { ...snapshot, conversation: { ...snapshot.conversation,
      messages: snapshot.conversation.messages.map(message => {
        if (!message.savedWorkBaseline) return message;
        const next = { ...message };
        delete next.savedWorkBaseline;
        return next;
      }) } };
    const next = createSession({ snapshot, thread, confirmedSnapshot: thread ? snapshot : null },
      item => notifications.current(item));
    next.focusComposer = true;
    if (!isMetabloomThreadsDocked()) {
      expandedRef.current = false;
      setExpanded(false);
    }
    current.current = next;
    setSession(next);
    setView(previous => ({ ...previous, pending: false, error: '', canSaveCopy: false, saveStatus: thread ? 'Saved' : 'New chat' }));
    remember(next);
    return next;
  }, [remember]);
  const action = React.useCallback(async callback => {
    const item = current.current;
    const epoch = lifecycle.current;
    if (!active(item, epoch) || busyRef.current) return false;
    if (item.isPending()) {
      setView(previous => ({ ...previous, error: 'Finish or stop the current response or component before switching chats.' }));
      return false;
    }
    busyRef.current = true;
    item.locked = true;
    setView(previous => ({ ...previous, busy: true, error: '' }));
    window.clearTimeout(timers.current.save);
    try { return await callback(item, epoch); }
    catch (error) {
      if (active(item, epoch)) setView(previous => ({ ...previous, error: publicError(error) }));
      return false;
    } finally {
      item.locked = false;
      busyRef.current = false;
      if (mounted.current && lifecycle.current === epoch) {
        setView(previous => ({ ...previous, busy: false }));
        current.current.changed();
      }
    }
  }, [active]);
  const open = React.useCallback(threadId => action(async (item, epoch) => {
    if (threadId === item.id) return true;
    if (!(await flush(item))) return false;
    const response = await call({ action: 'open', threadId });
    if (!active(item, epoch)) return false;
    updateItem(response.thread);
    install(response.snapshot, response.thread);
    return true;
  }), [action, active, call, flush, install, updateItem]);
  const startNew = React.useCallback(() => action(async (item, epoch) => {
    if (!(await flush(item)) || !active(item, epoch)) return false;
    install(emptySnapshot());
    return true;
  }), [action, active, flush, install]);
  const rename = React.useCallback((threadId, title) => action(async (item, epoch) => {
    if (threadId === item.id && !(await flush(item))) return false;
    const previous = threadId === item.id ? item.thread : itemsRef.current.find(thread => thread.threadId === threadId);
    if (!previous) throw Object.assign(new Error(), { code: 'threads_not_found' });
    const response = await call({ action: 'rename', threadId, title, expectedVersion: previous.version });
    if (!active(item, epoch)) return false;
    if (threadId === item.id) { item.thread = response.thread; remember(item); }
    updateItem(response.thread);
    return true;
  }), [action, active, call, flush, remember, updateItem]);
  const remove = React.useCallback(threadId => action(async (item, epoch) => {
    if (threadId === item.id && item.saving) await item.saving;
    if (!active(item, epoch)) return false;
    const previous = threadId === item.id ? item.thread : itemsRef.current.find(thread => thread.threadId === threadId);
    if (!previous) throw Object.assign(new Error(), { code: 'threads_not_found' });
    if (threadId === item.id) {
      // An uncertain Delete receipt cannot leave a Saved confirmation behind.
      item.confirmedSnapshot = null;
      item.saveError = 'threads_unavailable';
      remember(item);
      setView(previousView => ({ ...previousView, saveStatus: 'Deleting…' }));
    }
    await call({ action: 'delete', threadId, expectedVersion: previous.version });
    if (!active(item, epoch)) return false;
    mutations.current.items.set(threadId, { revision: ++mutations.current.revision, thread: null });
    itemsRef.current = itemsRef.current.filter(thread => thread.threadId !== threadId);
    setView(previousView => ({ ...previousView, items: itemsRef.current }));
    if (threadId === item.id) install(emptySnapshot());
    return true;
  }), [action, active, call, install, remember]);
  const saveCopy = React.useCallback(() => action(async (item, epoch) => {
    if (!['threads_conflict', 'threads_deleted', 'threads_not_found'].includes(item.saveError)) return false;
    const { snapshot } = item.capture();
    const threadId = newId();
    const title = `${item.thread?.title || titleFor(snapshot)} (copy)`.slice(0, 160);
    const response = await call({ action: 'save', threadId, expectedVersion: 0, title, snapshot });
    if (!active(item, epoch)) return false;
    item.id = threadId;
    item.thread = response.thread;
    item.confirmedSnapshot = snapshot;
    item.saveError = null;
    remember(item);
    updateItem(response.thread);
    setView(previous => ({ ...previous, error: '', canSaveCopy: false, saveStatus: 'Saved' }));
    return true;
  }), [action, active, call, remember, updateItem]);
  const retry = React.useCallback(async () => {
    if (!(await action(item => flush(item)))) return false;
    return refresh();
  }, [action, flush, refresh]);

  React.useEffect(() => {
    mounted.current = true;
    lifecycle.current += 1;
    const ownedTimers = timers.current;
    const ownedRequests = requests.current;
    if (enabled) { refresh(); current.current.changed(); }
    const beforeUnload = event => {
      const item = current.current;
      if (!enabled || (!hasContent(item.snapshot) && !item.thread)) return;
      if (item.saving || dirty(item) || item.isPending()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      try { current.current.capture(); remember(current.current); } catch { /* Keep the last valid in-memory snapshot. */ }
      mounted.current = false;
      lifecycle.current += 1;
      window.clearTimeout(ownedTimers.capture);
      window.clearTimeout(ownedTimers.save);
      for (const controller of ownedRequests) controller.abort();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [enabled, refresh, remember]);
  React.useEffect(() => { remember(session); }, [expanded, remember, session]);

  const adapter = React.useMemo(() => ({ ...navigation,
    getToolState: key => Object.prototype.hasOwnProperty.call(session.parts, key)
      ? session.getToolState(key) : navigation?.getToolState(key),
    saveToolState: session.saveToolState,
  }), [navigation, session]);
  return { enabled, session, navigation: adapter, expanded, setExpanded,
    panelProps: { ...view, expanded, onExpandedChange: setExpanded,
      activeThreadId: session.thread?.threadId || null, onNew: startNew, onOpen: open,
      onRename: rename, onDelete: remove, onRefresh: refresh, onRetry: retry,
      onSaveCopy: saveCopy }, busy: view.busy };
}
