import { createHash, webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import { createMetabloomWorkspaceBridge } from './metabloomWorkspaceBridge';
import { createGuidedInvoice, createInvoiceWorkspaceController } from '../utils/invoiceWorkspaceController';
import { canonicalWorkspacePayload } from './metabloomWorkspaceProtocol';

const { prepareMetabloomWorkspaceOperation } = require('../../server/metabloomWorkspaceWorkflow');
const { messages, workspaceUpdate, privateNote } = require('../../scripts/fixtures/metabloom-companion.cjs');
const conversationId = '12345678-1234-4123-8123-123456789012';
const otherConversation = '22345678-1234-4123-8123-123456789012';
const auth = { status: 'authenticated', user: { id: 'a'.repeat(64), role: 'admin' }, logoutRevision: 0 };
const originals = { crypto: Object.getOwnPropertyDescriptor(globalThis, 'crypto'), TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder };
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder; globalThis.TextDecoder = TextDecoder;
});
afterAll(() => {
  if (originals.crypto) Object.defineProperty(globalThis, 'crypto', originals.crypto); else delete globalThis.crypto;
  globalThis.TextEncoder = originals.TextEncoder; globalThis.TextDecoder = originals.TextDecoder;
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const capability = () => ({ ok: true, headers: { get: () => 'application/json' }, text: async () => '{"version":1,"enabled":true}' });
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
const sign = value => ({ ...value, payloadHash: createHash('sha256').update(canonicalWorkspacePayload(value)).digest('hex') });
function fixture(options = {}) {
  let authorized = true;
  const invoice = createGuidedInvoice('FICTIONAL-INTEGRATION');
  const controller = createInvoiceWorkspaceController({ invoice, assistance: { guided: true, conversationId }, isAuthorized: () => authorized });
  controller.setActive(true);
  const fetchImpl = jest.fn(async () => capability());
  const loadInvoice = jest.fn(async () => ({ module: {} }));
  const bridge = createMetabloomWorkspaceBridge({ fetchImpl, loadInvoice,
    digest: async source => createHash('sha256').update(source).digest('hex'), ...options });
  bridge.configure({ auth, pathname: '/invoice-generator', getConversationId: () => conversationId });
  const facade = Object.fromEntries(['getContext', 'apply', 'getStatus', 'connect', 'disconnect', 'subscribe'].map(name => [name, controller[name]]));
  bridge.register(facade);
  const prepare = (requestId = 'integration-request') => {
    const context = bridge.capture({ conversationId, requestId });
    return prepareMetabloomWorkspaceOperation({ name: 'update_invoice_workspace', args: workspaceUpdate(messages.complete, context),
      context, message: messages.complete, requestId, conversationId });
  };
  const apply = proposal => bridge.apply(proposal, { conversationId, requestId: proposal.requestId });
  return { controller, bridge, facade, fetchImpl, loadInvoice, prepare, apply, revoke: () => { authorized = false; } };
}

test('server-prepared operation reaches the real private controller once and returns exact host totals', async () => {
  const f = fixture(), proposal = f.prepare();
  const result = await f.apply(proposal);
  expect(result).toMatchObject({ status: 'applied', total: '997.50', currency: 'CAD', dataRevision: 1 });
  expect(f.controller.getInvoice().items).toHaveLength(2);
  expect(f.controller.getInvoice().items[0]).toMatchObject({ qty: '12', cost: '65', gst: true, pst: false });
  expect((await f.apply(proposal)).status).toBe('duplicate');
  expect(f.controller.getInvoice().items).toHaveLength(2);
  expect(f.controller.getStatus().dataRevision).toBe(1);
  const altered = sign({ ...proposal, changes: [...proposal.changes, { field: 'description', value: 'Changed', sourceText: 'Changed' }] });
  expect((await f.apply(altered)).status).toBe('rejected');
  expect(f.facade.getInvoice).toBeUndefined(); expect(f.facade.getAssistance).toBeUndefined();
});

test('a real manual edit during the protected-manifest recheck invalidates the whole prepared batch', async () => {
  const gate = deferred(), f = fixture();
  f.loadInvoice.mockImplementation(() => gate.promise);
  const pending = f.apply(f.prepare()); await flush(); expect(f.loadInvoice).toHaveBeenCalledTimes(1);
  f.controller.setField('clientName', 'Newer manual client'); gate.resolve({ module: {} });
  expect((await pending).status).toBe('conflict');
  expect(f.controller.getInvoice().clientName).toBe('Newer manual client');
  expect(f.controller.getInvoice().companyName).toBe(''); expect(f.controller.getInvoice().items).toHaveLength(0);
});

test.each(['leave', 'disconnect', 'stop', 'account', 'thread'])('authority change %s during capability recheck prevents private mutation', async action => {
  const gate = deferred(), f = fixture({ fetchImpl: () => gate.promise });
  const pending = f.apply(f.prepare()); await flush();
  if (action === 'leave') f.bridge.configure({ pathname: '/orb' });
  if (action === 'disconnect') f.bridge.disconnect();
  if (action === 'stop') f.bridge.cancel();
  if (action === 'account') f.bridge.configure({ auth: { ...auth, user: { id: 'b'.repeat(64), role: 'admin' } } });
  if (action === 'thread') f.bridge.configure({ getConversationId: () => otherConversation });
  gate.resolve(capability()); expect((await pending).status).toBe('cancelled');
  expect(f.controller.getInvoice().items).toHaveLength(0); expect(f.controller.getStatus().dataRevision).toBe(0);
});

test('private authorization revocation after context capture prevents late controller writes', async () => {
  const gate = deferred(), f = fixture(); f.loadInvoice.mockImplementation(() => gate.promise);
  const pending = f.apply(f.prepare()); await flush(); f.revoke(); gate.resolve({ module: {} });
  expect(['cancelled', 'unavailable']).toContain((await pending).status);
  expect(f.controller.getInvoice().companyName).toBe(''); expect(f.controller.getInvoice().items).toHaveLength(0);
});

test('unapproved local fields never enter captured context and forged scope cannot edit them', async () => {
  const f = fixture(); f.controller.setField('notes', privateNote); f.controller.setField('companyEmail', 'private@example.test');
  const proposal = f.prepare(), context = f.bridge.capture({ conversationId });
  expect(context.fields).not.toHaveProperty('notes'); expect(context.fields).not.toHaveProperty('companyEmail');
  expect(JSON.stringify(context)).not.toContain(privateNote);
  expect(f.fetchImpl).not.toHaveBeenCalled(); expect(f.loadInvoice).not.toHaveBeenCalled();
  const forged = sign({ ...proposal, changes: [{ field: 'notes', value: 'Forged replacement', sourceText: 'Forged replacement' }] });
  expect((await f.apply(forged)).status).toBe('rejected'); expect(f.controller.getInvoice().notes).toBe(privateNote);
});

test('tampered payload cannot reach the controller even with otherwise valid binding metadata', async () => {
  const f = fixture(), proposal = f.prepare();
  proposal.lineChanges[0].changes.find(change => change.field === 'cost').value = '1';
  expect((await f.apply(proposal)).status).toBe('rejected');
  expect(f.controller.getInvoice().items).toHaveLength(0); expect(f.loadInvoice).not.toHaveBeenCalled();
});

test('an inactive or replaced private document cannot reuse a valid old request', async () => {
  for (const replacement of [false, true]) {
    const f = fixture(), proposal = f.prepare();
    if (replacement) f.controller.replace(createGuidedInvoice('ANOTHER-FICTIONAL-INVOICE'), { assisted: true, conversationId });
    else f.controller.setActive(false);
    expect(['cancelled', 'unavailable']).toContain((await f.apply(proposal)).status);
    expect(f.controller.getInvoice().items).toHaveLength(0);
  }
});
