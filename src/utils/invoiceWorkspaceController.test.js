import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { createInvoice } from './invoice';
import { createGuidedInvoice, createInvoiceWorkspaceController } from './invoiceWorkspaceController';
import { parseMetabloomWorkspaceReceipt } from '../components/metabloomWorkspaceProtocol';

const conversationId = '11111111-1111-4111-8111-111111111111';
const secondConversation = '22222222-2222-4222-8222-222222222222';
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const originalEncoder = globalThis.TextEncoder;
let sequence = 0;
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); globalThis.TextEncoder = TextEncoder;
});
afterAll(() => {
  if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); else delete globalThis.crypto;
  globalThis.TextEncoder = originalEncoder;
});
const fixture = () => ({ ...createInvoice(), companyName: 'Fictional Studio', clientName: 'Example Client', invoiceNumber: 'DEMO-001',
  invoiceDate: '2026-11-19', companyEmail: 'private@example.test', notes: 'PRIVATE-NOTES-CANARY',
  items: [{ date: '2026-11-19', description: 'Development', qty: '12', cost: '65', discount: '0', gst: true, pst: false }] });
const controller = (options = {}) => {
  const value = createInvoiceWorkspaceController({ invoice: fixture(), ...options }); value.setActive(true); value.connect({ conversationId }); return value;
};
const proposal = (value, extra = {}) => {
  const state = value.getStatus();
  return { type: 'invoice_workspace', version: 1, command: 'update', requestId: `request-${++sequence}`, operationId: `operation-${sequence}`,
    conversationId, workspaceInstanceId: state.workspaceInstanceId, bindingEpoch: state.bindingEpoch,
    expectedDataRevision: state.dataRevision, changes: [{ field: 'clientName', value: 'Updated Client', sourceText: 'Updated Client' }],
    lineChanges: [], section: null, payloadHash: 'a'.repeat(64), ...extra };
};
const apply = (value, change, signal) => value.apply(change, { conversationId, signal });

test('guided invoices contain no manual defaults and distinguish missing taxes from false', () => {
  const invoice = createGuidedInvoice('DEMO-GUIDED');
  expect(invoice.companyName).toBe(''); expect(invoice.clientName).toBe(''); expect(invoice.invoiceDate).toBe('');
  expect(invoice.currency).toBe(''); expect(invoice.items).toEqual([]);
  const value = controller({ invoice, assistance: { guided: true, conversationId } });
  value.addItem();
  const context = value.getContext({ conversationId });
  expect(context.fields.currency).toBeNull(); expect(context.items[0].qty).toBeNull();
  expect(context.items[0].gst).toBeNull(); expect(context.items[0].pst).toBeNull();
  expect(context.ready).toBe(false); expect(value.getCompletion().calculation).toBeNull();
  value.setItem(0, 'gst', false); expect(value.getContext({ conversationId }).items[0].gst).toBe(false);
});

test('existing invoice requires explicit connection and only projects approved fields', () => {
  const value = createInvoiceWorkspaceController({ invoice: fixture() }); value.setActive(true);
  expect(value.getContext({ conversationId })).toBeNull(); value.connect({ conversationId });
  const context = value.getContext({ conversationId });
  expect(context.fields.companyName).toBe('Fictional Studio');
  expect(context.fields).not.toHaveProperty('companyEmail'); expect(context.fields).not.toHaveProperty('notes');
  expect(JSON.stringify(context)).not.toContain('PRIVATE-NOTES-CANARY');
  expect(value.getContext({ conversationId: secondConversation })).toBeNull();
  value.disconnect(); expect(value.getContext({ conversationId })).toBeNull();
  value.connect({ conversationId, includePrivateFields: true });
  expect(value.getContext({ conversationId }).fields.notes).toBe('PRIVATE-NOTES-CANARY');
  expect(value.getContext({ conversationId }).fields).not.toHaveProperty('logoDataUrl');
});

test('one atomic batch changes the actual invoice and its exact calculated receipt', () => {
  const value = controller(), id = value.getLineIds()[0];
  const change = proposal(value, { lineChanges: [{ op: 'update', id, sourceText: '14 hours', changes: [{ field: 'qty', value: '14', sourceText: '14 hours' }] }] });
  const result = apply(value, change);
  expect(result.status).toBe('applied'); expect(result.total).toBe('955.50');
  expect(value.getInvoice().items[0].qty).toBe('14'); expect(value.getInvoice().clientName).toBe('Updated Client');
  expect(value.getStatus().dataRevision).toBe(1); expect(parseMetabloomWorkspaceReceipt(result)).toEqual(result);
});

test('a late batch cannot overwrite a direct manual edit', () => {
  const value = controller(), change = proposal(value);
  value.setField('clientName', 'Manual Client');
  expect(apply(value, change).status).toBe('conflict'); expect(value.getInvoice().clientName).toBe('Manual Client');
  expect(value.getStatus().dataRevision).toBe(1);
});

test('duplicates apply once and altered payloads with the same ID fail closed', () => {
  const value = controller();
  const change = proposal(value, { changes: [], lineChanges: [{ op: 'add', id: null, sourceText: 'Review', changes: [{ field: 'description', value: 'Review', sourceText: 'Review' }] }] });
  expect(apply(value, change).status).toBe('applied'); expect(apply(value, change).status).toBe('duplicate');
  expect(value.getInvoice().items).toHaveLength(2); expect(value.getStatus().dataRevision).toBe(1);
  const altered = { ...change, changes: [{ field: 'clientName', value: 'Different', sourceText: 'Different' }] };
  expect(apply(value, altered).status).toBe('rejected'); expect(value.getInvoice().clientName).toBe('Example Client');
});

test('assistant-added items in an existing manual invoice never turn missing tax choices into untaxed', () => {
  const value = controller();
  const change = proposal(value, { changes: [], lineChanges: [{ op: 'add', id: null, sourceText: 'Review 2 at 85',
    changes: [['description', 'Review'], ['date', '2026-11-19'], ['qty', '2'], ['cost', '85']].map(([field, text]) => ({ field, value: text, sourceText: text })) }] });
  const result = apply(value, change);
  expect(result.status).toBe('applied'); expect(result.total).toBeNull();
  expect(result.missing).toContain('Item 2: Apply GST (yes or no)');
  expect(value.getStatus().guided).toBe(true); expect(value.getCompletion().calculation).toBeNull();
});

test('invalid lines and combined amount overflow reject the whole batch', () => {
  const value = controller();
  expect(apply(value, proposal(value, { lineChanges: [{ op: 'update', id: 'a'.repeat(16), sourceText: '1', changes: [{ field: 'qty', value: '1', sourceText: '1' }] }] })).status).toBe('rejected');
  expect(value.getInvoice().clientName).toBe('Example Client'); expect(value.getStatus().dataRevision).toBe(0);
  const id = value.getLineIds()[0];
  const overflow = proposal(value, { lineChanges: [{ op: 'update', id, sourceText: '1000000', changes: [
    { field: 'qty', value: '1000000', sourceText: '1000000' }, { field: 'cost', value: '1000000000', sourceText: '1000000000' },
  ] }] });
  expect(apply(value, overflow).status).toBe('rejected'); expect(value.getInvoice().clientName).toBe('Example Client');
});

test('unapproved private fields cannot be changed', () => {
  const value = controller();
  expect(apply(value, proposal(value, { changes: [{ field: 'notes', value: 'Changed', sourceText: 'Changed' }] })).status).toBe('rejected');
  expect(value.getInvoice().notes).toBe('PRIVATE-NOTES-CANARY');
});

test.each(['stop', 'leave', 'disconnect', 'replace', 'account'])('%s invalidates a prepared mutation', reason => {
  let authorized = true;
  const value = controller({ isAuthorized: () => authorized }), change = proposal(value), abort = new AbortController();
  if (reason === 'stop') abort.abort();
  if (reason === 'leave') value.setActive(false);
  if (reason === 'disconnect') value.disconnect();
  if (reason === 'replace') value.replace(fixture());
  if (reason === 'account') authorized = false;
  expect(['unavailable', 'cancelled']).toContain(apply(value, change, abort.signal).status);
  expect(value.getInvoice().clientName).toBe('Example Client');
});

test('undo preserves unrelated manual edits and refuses to overwrite affected fields', () => {
  const value = controller(); apply(value, proposal(value));
  value.setField('description', 'Manual project note');
  expect(value.undo().status).toBe('applied'); expect(value.getInvoice().clientName).toBe('Example Client');
  expect(value.getInvoice().description).toBe('Manual project note'); expect(value.getStatus().dataRevision).toBe(3);
  apply(value, proposal(value)); value.setField('clientName', 'Newer client');
  expect(value.undo().status).toBe('conflict'); expect(value.getInvoice().clientName).toBe('Newer client');
});

test('stable IDs survive removal and tax changes; replacement clears undo authority', () => {
  const value = controller(), original = value.getLineIds()[0];
  value.addItem({ ...fixture().items[0], description: 'Review' }); const second = value.getLineIds()[1];
  value.setAllTax('pst', true); expect(value.getLineIds()).toEqual([original, second]);
  value.setField('items', [value.getInvoice().items[1]]); expect(value.getLineIds()).toEqual([second]);
  apply(value, proposal(value)); value.replace(fixture());
  expect(value.undo().status).toBe('unavailable'); expect(value.getStatus().connected).toBe(false);
});

test('undoing an item field keeps a newer manual edit to another field on the same item', () => {
  const value = controller(), id = value.getLineIds()[0];
  apply(value, proposal(value, { changes: [], lineChanges: [{ op: 'update', id, sourceText: '14 hours',
    changes: [{ field: 'qty', value: '14', sourceText: '14 hours' }] }] }));
  value.setItem(0, 'cost', '90');
  expect(value.undo().status).toBe('applied');
  expect(value.getInvoice().items[0]).toMatchObject({ qty: '12', cost: '90' });
});

test('invalid manual values project as explicitly unresolved so chat can repair them without changing local input', () => {
  const value = controller(); value.setItem(0, 'cost', '-');
  const context = value.getContext({ conversationId });
  expect(context.items[0].cost).toBeNull(); expect(context.missing.join(' ')).toMatch(/Unit price has an invalid entry/);
  expect(context.ready).toBe(false); expect(value.getInvoice().items[0].cost).toBe('-');
  expect(apply(value, proposal(value, { changes: [], lineChanges: [{ op: 'update', id: value.getLineIds()[0], sourceText: '65',
    changes: [{ field: 'cost', value: '65', sourceText: '65' }] }] })).status).toBe('applied');
  expect(value.getInvoice().items[0].cost).toBe('65');
  for (let index = 0; index < 20; index++) value.addItem({ ...fixture().items[0] });
  expect(value.getContext({ conversationId })).toBeNull(); expect(value.getInvoice().items).toHaveLength(21);
});

test('an explicitly included malformed email can be repaired through chat without sharing the malformed text', () => {
  const value = controller(); value.connect({ conversationId, includePrivateFields: true }); value.setField('companyEmail', 'not-an-email');
  const context = value.getContext({ conversationId });
  expect(context.fields.companyEmail).toBeNull(); expect(JSON.stringify(context)).not.toContain('not-an-email');
  expect(apply(value, proposal(value, { changes: [{ field: 'companyEmail', value: 'correct@example.test', sourceText: 'correct@example.test' }] })).status).toBe('applied');
  expect(value.getInvoice().companyEmail).toBe('correct@example.test');
});

test('a route remount preserves the private invoice instance but rotates operation authority', () => {
  const first = controller(), change = proposal(first); first.setActive(false);
  const second = createInvoiceWorkspaceController({ invoice: first.getInvoice(), assistance: first.getAssistance() }); second.setActive(true);
  expect(second.getStatus().workspaceInstanceId).toBe(first.getStatus().workspaceInstanceId);
  expect(apply(second, change).status).toBe('unavailable');
  expect(second.getContext({ conversationId }).fields.clientName).toBe('Example Client');
});
