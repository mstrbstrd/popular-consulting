import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, render } from '@testing-library/react';
import useMetabloomThreads from './useMetabloomThreads';

const clone = value => JSON.parse(JSON.stringify(value));
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const snapshot = (text = 'First question') => ({ schemaVersion: 1,
  conversation: { counter: 2, draft: '', deepResearch: false, messages: [
    { id: 'user-1', role: 'user', content: text, status: 'complete' },
    { id: 'assistant-2', role: 'assistant', content: 'First answer', status: 'complete' },
  ] }, visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
const metadata = (threadId, title = 'First question', version = 1, messageCount = 2) => ({ threadId, title,
  version, messageCount, createdAt: '2026-11-04T12:00:00.000Z', updatedAt: `2026-11-04T12:00:${String(version).padStart(2, '0')}.000Z` });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async (time = 1) => { await act(async () => { jest.advanceTimersByTime(time); }); };

function server(seed = []) {
  const records = new Map(seed.map(record => [record.thread.threadId, clone(record)]));
  const removed = new Set();
  const handler = async input => {
    if (input.action === 'list') return { items: [...records.values()].map(record => clone(record.thread)) };
    const previous = records.get(input.threadId);
    if (input.action === 'open') {
      if (!previous) throw Object.assign(new Error(), { code: 'threads_not_found' });
      return clone(previous);
    }
    if (removed.has(input.threadId)) throw Object.assign(new Error(), { code: 'threads_deleted' });
    if (input.expectedVersion !== (previous?.thread.version || 0)) throw Object.assign(new Error(), { code: 'threads_conflict' });
    if (input.action === 'delete') { records.delete(input.threadId); removed.add(input.threadId); return { threadId: input.threadId, deleted: true }; }
    const thread = metadata(input.threadId, input.title, input.expectedVersion + 1,
      input.action === 'save' ? input.snapshot.conversation.messages.length : previous.thread.messageCount);
    records.set(input.threadId, { thread, snapshot: clone(input.snapshot || previous.snapshot) });
    return { thread };
  };
  return { records, handler, request: jest.fn(handler) };
}

async function harness({ initial, request, strict = false, enabled = true } = {}) {
  const cache = new Map();
  if (initial) cache.set('orbThreads', { id: initial.thread.threadId, thread: initial.thread,
    snapshot: initial.snapshot, confirmedSnapshot: initial.snapshot, expanded: false });
  const navigation = { getToolState: key => cache.get(key), saveToolState: (key, value) => cache.set(key, value) };
  const state = { cache, model: null, current: null };
  function Probe() {
    const threads = useMetabloomThreads({ navigation, enabled, request });
    state.current = threads;
    const session = threads.session;
    React.useLayoutEffect(() => {
      const model = { conversation: { ...clone(session.parts.orb), pending: false },
        visuals: clone(session.parts.orbVisuals), workspace: clone(session.parts.orbWorkspace), visualPending: false };
      state.model = model;
      const releaseConversation = session.registerConversation(() => model.conversation);
      const releaseVisuals = session.registerVisuals(() => ({ visuals: model.visuals, workspace: model.workspace }), () => model.visualPending);
      return () => { releaseConversation(); releaseVisuals(); };
    }, [session]);
    return <p>{threads.panelProps.saveStatus}</p>;
  }
  let view;
  await act(async () => { view = render(strict ? <React.StrictMode><Probe /></React.StrictMode> : <Probe />); });
  await tick();
  return { ...state, get current() { return state.current; }, get model() { return state.model; },
    change: async update => { await act(async () => { update(state.model); state.current.session.changed(); }); await tick(); },
    unmount: view.unmount };
}

const originalEncoder = global.TextEncoder;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let sequence;
beforeAll(() => {
  global.TextEncoder = TextEncoder;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => id(++sequence) } });
});
afterAll(() => {
  global.TextEncoder = originalEncoder;
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else delete globalThis.crypto;
});
beforeEach(() => { sequence = 100; jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.clearAllTimers(); jest.useRealTimers(); });

test('does not save an empty render and automatically saves a completed conversation and draft', async () => {
  const api = server();
  const state = await harness({ request: api.request });
  await tick(2000);
  expect(api.request.mock.calls.map(([input]) => input.action)).toEqual(['list']);
  await state.change(model => { model.conversation = { ...snapshot().conversation, draft: 'Next question' }; });
  await tick(1200);
  const save = api.request.mock.calls.find(([input]) => input.action === 'save')[0];
  expect(save).toMatchObject({ action: 'save', expectedVersion: 0, title: 'First question',
    snapshot: { conversation: { counter: 2, draft: 'Next question', messages: snapshot().conversation.messages } } });
  expect(state.current.panelProps.saveStatus).toBe('Saved');
  expect(state.current.panelProps.items).toHaveLength(1);
});

test('serializes writes and sends the newest draft after an earlier save is acknowledged', async () => {
  const api = server();
  const first = deferred();
  api.request.mockImplementation(input => input.action === 'save' && input.expectedVersion === 0
    ? first.promise.then(() => api.handler(input)) : api.handler(input));
  const state = await harness({ request: api.request });
  await state.change(model => { model.conversation = { ...snapshot().conversation, draft: 'First draft' }; });
  await tick(1200);
  await state.change(model => { model.conversation.draft = 'Latest draft'; });
  await tick(1200);
  expect(api.request.mock.calls.filter(([input]) => input.action === 'save')).toHaveLength(1);
  await act(async () => { first.resolve(); });
  await tick();
  await tick(1200);
  const saves = api.request.mock.calls.filter(([input]) => input.action === 'save').map(([input]) => input);
  expect(saves.map(input => input.expectedVersion)).toEqual([0, 1]);
  expect(saves[1].snapshot.conversation.draft).toBe('Latest draft');
  expect(state.current.panelProps.saveStatus).toBe('Saved');
});

test('clearing a saved draft persists the empty draft rather than restoring its earlier text', async () => {
  const api = server(), state = await harness({ request: api.request });
  await state.change(model => { model.conversation.draft = 'Draft to clear'; });
  await tick(1200);
  const threadId = state.current.session.id;
  expect(api.records.get(threadId).snapshot.conversation.draft).toBe('Draft to clear');
  await state.change(model => { model.conversation.draft = ''; });
  await tick(1200);
  expect(api.records.get(threadId).snapshot.conversation.draft).toBe('');
  expect(state.current.panelProps.saveStatus).toBe('Saved');
});

test('New chat waits for the latest outgoing content to be saved and then replaces the entire session', async () => {
  const api = server(), receipt = deferred();
  api.request.mockImplementation(input => input.action === 'save' ? receipt.promise.then(() => api.handler(input)) : api.handler(input));
  const state = await harness({ request: api.request });
  await state.change(model => { model.conversation = { ...snapshot().conversation, draft: 'Keep this draft' }; });
  const old = state.current.session;
  let result;
  act(() => { result = state.current.panelProps.onNew(); });
  expect(state.current.session).toBe(old);
  expect(old.locked).toBe(true);
  await act(async () => { receipt.resolve(); expect(await result).toBe(true); });
  expect(state.current.session).not.toBe(old);
  expect(state.model.conversation.messages).toEqual([]);
  expect(api.records.get(old.id).snapshot.conversation.draft).toBe('Keep this draft');
});

test('a failed Open preserves the current draft and session after confirming its outgoing save', async () => {
  const api = server();
  const state = await harness({ request: api.request });
  await state.change(model => { model.conversation = { ...snapshot().conversation, draft: 'Keep me' }; });
  const old = state.current.session;
  await act(async () => { expect(await state.current.panelProps.onOpen(id(999))).toBe(false); });
  expect(state.current.session).toBe(old);
  expect(state.model.conversation.draft).toBe('Keep me');
  expect(state.current.panelProps.error).toMatch(/no longer available/);
  expect(old.locked).toBe(false);
});

test('a failed save blocks switching and keeps local work until Retry succeeds', async () => {
  const api = server();
  let fail = true;
  api.request.mockImplementation(input => input.action === 'save' && fail
    ? Promise.reject(Object.assign(new Error(), { code: 'threads_unavailable' })) : api.handler(input));
  const state = await harness({ request: api.request });
  await state.change(model => { model.conversation = snapshot().conversation; });
  const old = state.current.session;
  await act(async () => { expect(await state.current.panelProps.onNew()).toBe(false); });
  expect(state.current.session).toBe(old);
  expect(state.current.panelProps.saveStatus).toBe('Not saved');
  fail = false;
  await act(async () => { expect(await state.current.panelProps.onRetry()).toBe(true); });
  expect(state.current.panelProps.saveStatus).toBe('Saved');
});

test('switching is blocked while a component is still being generated after the answer finishes', async () => {
  const api = server(), state = await harness({ request: api.request });
  await state.change(model => { model.conversation = snapshot().conversation; model.visualPending = true; });
  const old = state.current.session;
  await act(async () => { expect(await state.current.panelProps.onNew()).toBe(false); });
  expect(state.current.session).toBe(old);
  expect(state.current.panelProps.pending).toBe(true);
  expect(state.current.panelProps.error).toMatch(/component/);
});

test('a stale list response cannot hide a newly acknowledged thread', async () => {
  const api = server(), listing = deferred();
  api.request.mockImplementation(input => input.action === 'list' ? listing.promise : api.handler(input));
  const state = await harness({ request: api.request });
  await state.change(model => { model.conversation = snapshot().conversation; });
  await tick(1200);
  const threadId = state.current.session.id;
  await act(async () => { listing.resolve({ items: [] }); });
  expect(state.current.panelProps.items.map(thread => thread.threadId)).toEqual([threadId]);
});

test('an uncertain Delete receipt removes the Saved claim and never silently recreates the thread', async () => {
  const initial = { thread: metadata(id(1)), snapshot: snapshot() };
  const api = server([initial]);
  api.request.mockImplementation(async input => {
    const result = await api.handler(input);
    if (input.action === 'delete') throw Object.assign(new Error(), { code: 'threads_timeout' });
    return result;
  });
  const state = await harness({ request: api.request, initial });
  await act(async () => { expect(await state.current.panelProps.onDelete(id(1))).toBe(false); });
  await tick();
  expect(state.current.session.id).toBe(id(1));
  expect(state.model.conversation.messages).toHaveLength(2);
  expect(state.current.panelProps.saveStatus).toBe('Not saved');
  await tick(3000);
  expect(api.request.mock.calls.filter(([input]) => input.action === 'save')).toHaveLength(0);
  await act(async () => { expect(await state.current.panelProps.onRetry()).toBe(false); });
  expect(state.current.panelProps.canSaveCopy).toBe(true);
  await act(async () => { expect(await state.current.panelProps.onSaveCopy()).toBe(true); });
  expect(state.current.session.id).not.toBe(id(1));
  expect(api.records.has(id(1))).toBe(false);
  expect(state.current.panelProps.saveStatus).toBe('Saved');
});

test('renaming the active thread preserves its renderer session and all local data', async () => {
  const initial = { thread: metadata(id(1)), snapshot: snapshot() };
  const api = server([initial]), state = await harness({ request: api.request, initial });
  const old = state.current.session;
  await act(async () => { expect(await state.current.panelProps.onRename(id(1), 'Project notes')).toBe(true); });
  expect(state.current.session).toBe(old);
  expect(state.current.panelProps.items[0].title).toBe('Project notes');
  expect(state.model.conversation.messages).toEqual(initial.snapshot.conversation.messages);
});

test('late acknowledgements from an unmounted account cannot repopulate its cache', async () => {
  const api = server(), response = deferred();
  api.request.mockImplementation(input => input.action === 'save' ? response.promise.then(() => api.handler(input)) : api.handler(input));
  const state = await harness({ request: api.request });
  await state.change(model => { model.conversation = snapshot().conversation; });
  await tick(1200);
  state.unmount();
  const retained = state.cache.get('orbThreads');
  await act(async () => { response.resolve(); });
  expect(state.cache.get('orbThreads')).toBe(retained);
  expect(retained.thread).toBeNull();
});

test('the StrictMode rehearsal does not erase a restored conversation or start a mutation', async () => {
  const initial = { thread: metadata(id(1)), snapshot: snapshot() };
  const api = server([initial]), state = await harness({ request: api.request, initial, strict: true });
  await tick(2000);
  expect(state.model.conversation.messages).toEqual(initial.snapshot.conversation.messages);
  expect(api.request.mock.calls.filter(([input]) => input.action !== 'list')).toEqual([]);
  expect(state.current.panelProps.saveStatus).toBe('Saved');
});

test('history collapse changes presentation without replacing the active session', async () => {
  const api = server(), state = await harness({ request: api.request });
  const old = state.current.session;
  await act(async () => { state.current.setExpanded(true); });
  await act(async () => { state.current.setExpanded(false); });
  expect(state.current.session).toBe(old);
  expect(api.request.mock.calls.map(([input]) => input.action)).toEqual(['list']);
});
