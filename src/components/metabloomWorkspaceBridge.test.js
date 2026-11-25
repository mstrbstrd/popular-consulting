import { createMetabloomWorkspaceBridge } from './metabloomWorkspaceBridge';
import { canonicalWorkspacePayload } from './metabloomWorkspaceProtocol';

const { createHash } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
const conversationId = '12345678-1234-4123-8123-123456789abc';
const otherConversation = '22345678-1234-4123-8123-123456789abc';
const auth = { status: 'authenticated', user: { id: 'demo-user', role: 'admin' }, logoutRevision: 0 };
const context = () => ({ version: 1, status: 'connected', conversationId, workspaceInstanceId: 'invoice-one',
  bindingEpoch: 2, dataRevision: 3, fields: { companyName: 'Demo Studio', clientName: 'Example Client', currency: 'CAD' },
  items: [], missing: ['Add a line item'], ready: false });
const sign = proposal => ({ ...proposal, payloadHash: createHash('sha256').update(canonicalWorkspacePayload(proposal)).digest('hex') });
const update = (changes = {}) => sign({ type: 'invoice_workspace', version: 1, command: 'update', requestId: 'request-one',
  operationId: 'operation-one', conversationId, workspaceInstanceId: 'invoice-one', bindingEpoch: 2, expectedDataRevision: 3,
  changes: [{ field: 'companyName', value: 'New Studio', sourceText: 'New Studio' }], lineChanges: [], section: null, ...changes });
const openProposal = () => update({ command: 'open', workspaceInstanceId: null, bindingEpoch: 0, expectedDataRevision: 0, changes: [] });
const completed = proposal => ({ version: 1, requestId: proposal.requestId, operationId: proposal.operationId, status: 'applied',
  workspaceInstanceId: 'invoice-one', dataRevision: 4, message: 'Updated the sender name.', missing: [], total: null, currency: null });
const response = enabled => ({ ok: true, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ version: 1, enabled }) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture({ pathname = '/invoice-generator', options = {}, register = true } = {}) {
  const controller = { getContext: jest.fn(context), apply: jest.fn(completed), disconnect: jest.fn(), getStatus: () => ({ connected: true, conversationId }) };
  const module = { syncSession: jest.fn(), stageGuidedInvoice: jest.fn(() => ({ status: 'ready' })) };
  const fetchImpl = jest.fn(async () => response(true)), loadInvoice = jest.fn(async () => ({ module }));
  const bridge = createMetabloomWorkspaceBridge({ fetchImpl, loadInvoice,
    digest: async value => createHash('sha256').update(value).digest('hex'), ...options });
  const navigate = jest.fn(path => { bridge.configure({ pathname: path }); bridge.register(controller); });
  bridge.configure({ auth, pathname, navigate, getConversationId: () => conversationId });
  if (register) bridge.register(controller);
  const capture = () => bridge.capture({ conversationId, requestId: 'request-one' });
  return { bridge, controller, module, fetchImpl, loadInvoice, navigate, capture };
}

test('the approved snapshot is captured only on Send and success follows the actual controller receipt', async () => {
  const f = fixture();
  f.controller.getContext.mockClear();
  expect(f.fetchImpl).not.toHaveBeenCalled();
  expect(f.capture()).toMatchObject({ workspaceInstanceId: 'invoice-one', dataRevision: 3 });
  const result = await f.bridge.apply(update(), { conversationId, requestId: 'request-one' });
  expect(result).toEqual(completed(update()));
  expect(f.fetchImpl).toHaveBeenCalledWith('/api/metabloom-workspace', expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }));
  expect(f.fetchImpl.mock.calls[0][1]).not.toHaveProperty('body');
  expect(f.loadInvoice).toHaveBeenCalledTimes(1);
  expect(f.controller.apply).toHaveBeenCalledTimes(1);
});

test('repeated operation returns the receipt without another edit and altered arguments are rejected', async () => {
  const f = fixture(); f.capture();
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('applied');
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('duplicate');
  const altered = update({ changes: [{ field: 'companyName', value: 'Other Studio', sourceText: 'Other Studio' }] });
  expect((await f.bridge.apply(altered, { conversationId, requestId: 'request-one' })).status).toBe('rejected');
  expect(f.controller.apply).toHaveBeenCalledTimes(1);
  expect(f.fetchImpl).toHaveBeenCalledTimes(1);
});

test('corrupted payload hashes never reach the private editor', async () => {
  const f = fixture(); f.capture();
  expect((await f.bridge.apply({ ...update(), payloadHash: '0'.repeat(64) }, { conversationId, requestId: 'request-one' })).status).toBe('rejected');
  expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.controller.apply).not.toHaveBeenCalled();
});

test.each(['update', 'open'])('leaving and returning before a late %s proposal cannot recreate authority', async command => {
  const f = fixture({ pathname: command === 'open' ? '/orb' : '/invoice-generator', register: command !== 'open' }); f.capture();
  f.bridge.configure({ pathname: '/work' });
  f.bridge.configure({ pathname: command === 'open' ? '/orb' : '/invoice-generator' });
  const result = await f.bridge.apply(command === 'open' ? openProposal() : update(), { conversationId, requestId: 'request-one' });
  expect(result.status).toBe('cancelled'); expect(f.loadInvoice).not.toHaveBeenCalled(); expect(f.controller.apply).not.toHaveBeenCalled();
});

test.each(['logout', 'thread', 'stop', 'leave'])('a delayed access check cannot apply after %s', async reason => {
  const waiting = deferred(), f = fixture({ options: { fetchImpl: () => waiting.promise } }); f.capture();
  const pending = f.bridge.apply(update(), { conversationId, requestId: 'request-one' }); await flush();
  if (reason === 'logout') f.bridge.configure({ auth: { ...auth, status: 'anonymous', user: null, logoutRevision: 1 } });
  if (reason === 'thread') f.bridge.configure({ getConversationId: () => otherConversation });
  if (reason === 'stop') f.bridge.cancel();
  if (reason === 'leave') f.bridge.configure({ pathname: '/orb' });
  waiting.resolve(response(true));
  expect((await pending).status).toBe('cancelled'); expect(f.controller.apply).not.toHaveBeenCalled();
});

test('a private controller replacement during manifest check invalidates the operation', async () => {
  const waiting = deferred(), f = fixture({ options: { loadInvoice: () => waiting.promise } }); f.capture();
  const pending = f.bridge.apply(update(), { conversationId, requestId: 'request-one' }); await flush();
  f.bridge.register({ ...f.controller, apply: jest.fn(completed) }); waiting.resolve({ module: f.module });
  expect((await pending).status).toBe('cancelled'); expect(f.controller.apply).not.toHaveBeenCalled();
});

test('manual data changes are left to the atomic revision check and produce a truthful conflict', async () => {
  const f = fixture(); f.capture();
  f.controller.getContext.mockImplementation(() => ({ ...context(), dataRevision: 4 }));
  f.controller.apply.mockImplementation(proposal => ({ ...completed(proposal), status: 'conflict', message: 'The invoice changed while I was working.' }));
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('conflict');
  expect(f.bridge.getStatus().message).toMatch(/changed while/);
});

test('a synchronous applied receipt wins over Stop immediately after commit', async () => {
  const f = fixture(); f.capture();
  f.controller.apply.mockImplementation(proposal => { f.bridge.cancel(); return completed(proposal); });
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('applied');
});

test('disabled capability and invalid or oversized capability replies fail closed', async () => {
  for (const reply of [response(false), { ok: false, headers: { get: () => 'application/json' } },
    { ok: true, headers: { get: () => 'text/html' } },
    { ok: true, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ version: 1, enabled: true, extra: 'x' }) },
    { ok: true, headers: { get: () => 'application/json' }, text: async () => 'x'.repeat(2049) }]) {
    const f = fixture({ options: { fetchImpl: async () => reply } }); f.capture();
    expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('unavailable');
    expect(f.controller.apply).not.toHaveBeenCalled();
  }
});

test('guided opening keeps its own navigation alive, waits for the editor and records no private values', async () => {
  const f = fixture({ pathname: '/orb', register: false });
  const result = await f.bridge.open({ conversationId });
  expect(result.status).toBe('ready'); expect(f.navigate).toHaveBeenCalledWith('/invoice-generator');
  expect(f.module.stageGuidedInvoice).toHaveBeenCalledWith(auth, { conversationId, expectedWorkspaceVersion: null });
  expect(f.bridge.capture({ conversationId }).status).toBe('connected');
});

test('an open proposal accepts only its own captured turn and preserves duplicate identity', async () => {
  const f = fixture({ pathname: '/orb', register: false }); f.capture();
  const first = await f.bridge.apply(openProposal(), { conversationId, requestId: 'request-one' });
  expect(first.status).toBe('applied');
  expect((await f.bridge.apply(openProposal(), { conversationId, requestId: 'request-one' })).status).toBe('duplicate');
  expect(f.module.stageGuidedInvoice).toHaveBeenCalledTimes(1);
});

test('opening an existing invoice presents a replacement choice instead of overwriting it', async () => {
  const f = fixture({ pathname: '/orb', register: false });
  f.module.stageGuidedInvoice.mockReturnValue({ status: 'replacement_required', version: 9 });
  expect(await f.bridge.open({ conversationId })).toMatchObject({ status: 'replacement_required', version: 9 });
  expect(f.bridge.getStatus().replacementVersion).toBe(9);
  expect(f.controller.apply).not.toHaveBeenCalled();
});

test('a disconnected or manually invalid active invoice does not silently become a new invoice', () => {
  const f = fixture(); f.controller.getContext.mockReturnValue(null);
  expect(f.capture()).toBeNull(); expect(f.module.stageGuidedInvoice).not.toHaveBeenCalled();
});

test('anonymous and non-admin sessions cannot capture or open private workspaces', async () => {
  const f = fixture();
  for (const user of [null, { id: 'viewer', role: 'user' }]) {
    f.bridge.configure({ auth: { ...auth, user, status: user ? 'authenticated' : 'anonymous' } });
    expect(f.capture()).toBeNull(); expect((await f.bridge.open({ conversationId })).status).toBe('unavailable');
  }
  expect(f.fetchImpl).not.toHaveBeenCalled();
});

test('an adapter that ignores cancellation cannot extend the local application deadline', async () => {
  jest.useFakeTimers();
  try {
    const waiting = deferred(), f = fixture({ options: { fetchImpl: () => waiting.promise, timeoutMs: 1000 } }); f.capture();
    const pending = f.bridge.apply(update(), { conversationId, requestId: 'request-one' }); await flush();
    jest.advanceTimersByTime(1000);
    expect((await pending).status).toBe('unavailable'); expect(f.controller.apply).not.toHaveBeenCalled();
    waiting.resolve(response(true)); await flush(); expect(f.controller.apply).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('pre-cancelled operations leave no timers or private activity behind', async () => {
  jest.useFakeTimers();
  try {
    const f = fixture(); const abort = new AbortController(); abort.abort();
    expect((await f.bridge.open({ conversationId, signal: abort.signal })).status).toBe('cancelled');
    expect(jest.getTimerCount()).toBe(0); expect(f.fetchImpl).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test('release and registry eviction prevent stale request application', async () => {
  const f = fixture(); f.capture(); f.bridge.release('request-one');
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('cancelled');
  f.capture();
  for (let i = 0; i < 20; i++) f.bridge.capture({ conversationId, requestId: `later-${i}` });
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('cancelled');
  expect(f.controller.apply).not.toHaveBeenCalled();
});


test('read-only capability probing lets disabled workspaces fall back to ordinary chat without local access', async () => {
  const f = fixture({ options: { fetchImpl: async () => response(false) } });
  expect(await f.bridge.probe({ conversationId })).toBe(false);
  expect(f.loadInvoice).not.toHaveBeenCalled(); expect(f.controller.apply).not.toHaveBeenCalled();
  expect(f.bridge.getStatus().state).toBe('idle');
  const enabled = fixture(); expect(await enabled.bridge.probe({ conversationId })).toBe(true);
});

test('ordinary capability probing has a two-second budget without extending chat work', async () => {
  jest.useFakeTimers();
  try {
    const f = fixture({ options: { fetchImpl: () => new Promise(() => {}) } });
    const pending = f.bridge.probe({ conversationId });
    await flush(); jest.advanceTimersByTime(2000);
    expect(await pending).toBe(false); expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('a session reuses its availability answer for sends, but never across identities or for timeouts', async () => {
  const f = fixture();
  expect(await f.bridge.probe({ conversationId })).toBe(true);
  expect(await f.bridge.probe({ conversationId, signal: new AbortController().signal })).toBe(true);
  expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  // An early warm-up and a send share one network check.
  const shared = fixture(); const gate = deferred();
  shared.fetchImpl.mockImplementation(async () => { await gate.promise; return response(true); });
  const warm = shared.bridge.probe({ conversationId }), send = shared.bridge.probe({ conversationId });
  gate.resolve(); expect(await Promise.all([warm, send])).toEqual([true, true]);
  expect(shared.fetchImpl).toHaveBeenCalledTimes(1);
  // Another account asks again.
  f.bridge.configure({ auth: { ...auth, user: { id: 'other-user', role: 'admin' } } });
  expect(await f.bridge.probe({ conversationId })).toBe(true);
  expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  // A denial is remembered briefly; a failed or cancelled check is not.
  const deniedFetch = jest.fn(async () => response(false));
  const denied = fixture({ options: { fetchImpl: deniedFetch } });
  expect(await denied.bridge.probe({ conversationId })).toBe(false);
  expect(await denied.bridge.probe({ conversationId })).toBe(false);
  expect(deniedFetch).toHaveBeenCalledTimes(1);
  const failing = jest.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation(async () => response(true));
  const offline = fixture({ options: { fetchImpl: failing } });
  expect(await offline.bridge.probe({ conversationId })).toBe(false);
  expect(await offline.bridge.probe({ conversationId })).toBe(true);
  expect(failing).toHaveBeenCalledTimes(2);
});

test('opening and applying still check availability themselves', async () => {
  const f = fixture({ pathname: '/orb', register: false });
  expect(await f.bridge.probe({ conversationId })).toBe(true);
  expect((await f.bridge.open({ conversationId })).status).toBe('ready');
  expect(f.fetchImpl).toHaveBeenCalledTimes(2);
});


test('opening survives a private editor StrictMode registration cycle but old update authority is revoked', async () => {
  const f = fixture({ pathname: '/orb', register: false });
  f.bridge.configure({ navigate: path => {
    f.bridge.configure({ pathname: path });
    const unregister = f.bridge.register(f.controller);
    unregister();
    f.bridge.register(f.controller);
  } });
  expect((await f.bridge.open({ conversationId })).status).toBe('ready');
  f.capture();
  const unregister = f.bridge.register(f.controller); unregister(); f.bridge.register(f.controller);
  expect((await f.bridge.apply(update(), { conversationId, requestId: 'request-one' })).status).toBe('cancelled');
  expect(f.controller.apply).not.toHaveBeenCalled();
});
