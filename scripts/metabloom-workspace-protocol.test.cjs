const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { parseMetabloomWorkspaceContext: context, parseMetabloomWorkspaceProposal: proposal,
  parseMetabloomWorkspaceReceipt: receipt, canonicalWorkspacePayload, isInvoiceWorkspaceStart,
  METABLOOM_WORKSPACE_SAFE_FIELDS } = require('../src/components/metabloomWorkspaceProtocol');
const conversationId = '12345678-1234-4123-8123-123456789012';
const available = () => ({ version: 1, status: 'available', conversationId, workspaceInstanceId: null,
  bindingEpoch: 0, dataRevision: 0, fields: {}, items: [], missing: [], ready: false });
const connected = () => ({ ...available(), status: 'connected', workspaceInstanceId: 'invoice-1', bindingEpoch: 1,
  fields: { companyName: null, clientName: null, currency: null, invoiceDate: null }, missing: ['Client name'] });
const operation = () => ({ type: 'invoice_workspace', version: 1, command: 'update', requestId: 'request-1',
  operationId: 'operation-1', conversationId, workspaceInstanceId: 'invoice-1', bindingEpoch: 1, expectedDataRevision: 0,
  changes: [{ field: 'clientName', value: 'Example Client', sourceText: 'Example Client' }], lineChanges: [], section: null,
  payloadHash: 'b'.repeat(64) });

test('approved context preserves unknowns and excludes unrecognized data', () => {
  assert.deepEqual(context(available()), available());
  assert.equal(context(connected()).fields.clientName, null);
  for (const field of ['logoDataUrl', '__proto__', 'total']) {
    const value = connected(); Object.defineProperty(value.fields, field, { value: 'secret', enumerable: true });
    assert.equal(context(value), null);
  }
  for (const field of ['notes', 'businessNumber', 'companyAddress', 'companyEmail'])
    assert.equal(METABLOOM_WORKSPACE_SAFE_FIELDS.includes(field), false);
});
test('available context cannot smuggle an existing document or unapproved revision', () => {
  for (const changes of [{ fields: { clientName: 'Private' } }, { workspaceInstanceId: 'invoice-1' },
    { bindingEpoch: 1 }, { dataRevision: 1 }, { ready: true }, { extra: true }])
    assert.equal(context({ ...available(), ...changes }), null);
});
test('protocol rejects accessors without invoking them', () => {
  let reads = 0; const value = connected();
  Object.defineProperty(value.fields, 'clientName', { get() { reads++; return 'Private'; }, enumerable: true });
  assert.equal(context(value), null); assert.equal(reads, 0);
});
test('line snapshots preserve false versus unknown and enforce stable unique IDs', () => {
  const line = { id: 'c'.repeat(16), date: null, description: null, qty: null, cost: null, discount: '0', gst: false, pst: null };
  const value = { ...connected(), items: [line] };
  assert.equal(context(value).items[0].gst, false); assert.equal(context(value).items[0].pst, null);
  assert.equal(context({ ...value, items: [line, line] }), null);
  assert.equal(context({ ...value, items: [{ ...line, total: '1.00' }] }), null);
});
test('context bounds encoded bytes, not only character count', () => {
  const value = { ...connected(), missing: Array.from({ length: 80 }, () => '界'.repeat(200)) };
  assert.equal(context(value), null);
});
test('proposals bind request identity and reject unsupported commands, scopes and values', () => {
  assert.deepEqual(proposal(operation(), 'request-1'), operation());
  assert.equal(proposal(operation(), 'request-2'), null);
  for (const changes of [{ command: 'print' }, { bindingEpoch: -1 }, { expectedDataRevision: Infinity },
    { payloadHash: 'not-a-hash' }, { changes: [{ field: 'total', value: '10', sourceText: '10' }] }, { execute: 'code' }])
    assert.equal(proposal({ ...operation(), ...changes }), null);
});
test('duplicate field/line changes and empty mutation are rejected atomically', () => {
  const value = operation(); assert.equal(proposal({ ...value, changes: [...value.changes, ...value.changes] }), null);
  assert.equal(proposal({ ...value, changes: [] }), null);
  const remove = { op: 'remove', id: 'd'.repeat(16), changes: [], sourceText: 'remove item' };
  assert.equal(proposal({ ...value, lineChanges: [remove, remove] }), null);
  assert.equal(proposal({ ...value, lineChanges: [{ ...remove, op: 'add' }] }), null);
});
test('open and focus have distinct constrained shapes', () => {
  const open = { ...operation(), command: 'open', workspaceInstanceId: null, bindingEpoch: 0, changes: [] };
  assert.ok(proposal(open)); assert.equal(proposal({ ...open, changes: operation().changes }), null);
  assert.equal(proposal({ ...open, workspaceInstanceId: 'existing' }), null);
  const focus = { ...operation(), command: 'focus', changes: [], section: 'items' };
  assert.ok(proposal(focus)); assert.equal(proposal({ ...focus, section: '#arbitrary-selector' }), null);
});
test('canonical hash covers binding and arguments while ignoring key insertion order', () => {
  const value = operation(); const reordered = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(canonicalWorkspacePayload(value), canonicalWorkspacePayload(reordered));
  const hash = v => createHash('sha256').update(canonicalWorkspacePayload(v)).digest('hex');
  assert.equal(hash(value), hash({ ...value, payloadHash: '0'.repeat(64) }));
  assert.notEqual(hash(value), hash({ ...value, expectedDataRevision: 2 }));
  assert.notEqual(hash(value), hash({ ...value, changes: [{ ...value.changes[0], value: 'Another Client' }] }));
});
test('receipt contains bounded observation only, no invoice snapshot', () => {
  const value = { version: 1, requestId: 'request-1', operationId: 'operation-1', status: 'applied',
    workspaceInstanceId: 'invoice-1', dataRevision: 1, message: 'Updated the invoice.', missing: [], total: '997.50', currency: 'CAD' };
  assert.deepEqual(receipt(value), value);
  assert.equal(receipt({ ...value, invoice: {} }), null);
  assert.equal(receipt({ ...value, status: 'sent' }), null);
  assert.equal(receipt({ ...value, currency: null }), null);
  assert.equal(receipt({ ...value, total: '-1.00' }), null);
});
test('host starter accepts explicit creation but not descriptions or quoted text', () => {
  for (const text of ['Start an invoice draft.', 'Help me create an invoice', 'please open a new invoice']) assert.ok(isInvoiceWorkspaceStart(text));
  for (const text of ['What does start an invoice draft do?', '"Start an invoice draft"', 'Do not create an invoice', 'Start an invoice draft when I say go'])
    assert.equal(isInvoiceWorkspaceStart(text), false);
});
