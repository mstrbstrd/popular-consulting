import { TextEncoder } from 'util';
import { mountInvoice, syncSession, stageChatInvoice } from './invoice-entry';
import { createRoot } from 'react-dom/client';
import { invoiceChatDraft } from './testHelpers/invoiceChatFixtures';
jest.mock('react-dom/client', () => ({ createRoot: jest.fn() }));
jest.mock('./components/InvoiceGeneratorPage', () => ({ InvoiceGeneratorContent: () => null }));
jest.mock('./components/RequireAdmin', () => ({ __esModule: true, default: () => null }));
const originalEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalEncoder; });
let rendered, epoch = 100;
const account = (id = 'a') => ({ status: 'authenticated', user: { id: id.repeat(64), role: 'admin' }, logoutRevision: epoch });
const content = () => rendered.props.children.props.children.props.children.props.children.props.children;
const mount = (auth = account()) => mountInvoice(document.createElement('div'), { auth, theme: {}, navigation: {} });
beforeEach(() => { epoch++; syncSession(account()); createRoot.mockReturnValue({ render: value => { rendered = value; }, unmount: jest.fn() }); });
test('handoff stages a complete draft privately, without saving to device or marking it issued', () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem');
  expect(stageChatInvoice(invoiceChatDraft(), account())).toEqual({ status: 'ready' });
  mount(); const initial = content().props.initialWorkspace;
  expect(initial.invoice.clientName).toBe('Fictional Client'); expect(initial.invoice.logoDataUrl).toBe('');
  expect(initial.dirty).toBe(true); expect(initial.savedOnDevice).toBe(false); expect(initial.view).toBe('preview');
  expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
});
test('existing work is preserved until approval of the current workspace version, including late writers', () => {
  const root = mount(), write = content().props.onWorkspaceChange;
  const original = { invoice: { invoiceNumber: 'EXISTING' }, dirty: true, view: 'editor' }; write(original);
  const first = stageChatInvoice(invoiceChatDraft(), account()); expect(first.status).toBe('replacement_required');
  expect(first).not.toHaveProperty('invoice'); root.dispose(); mount(); expect(content().props.initialWorkspace).toEqual(original);
  content().props.onWorkspaceChange({ ...original, invoice: { invoiceNumber: 'NEWER-EDIT' } });
  const stale = stageChatInvoice(invoiceChatDraft(), account(), first.version); expect(stale.status).toBe('replacement_required');
  expect(stageChatInvoice(invoiceChatDraft(), account(), stale.version)).toEqual({ status: 'ready' });
  write(original); mount(); expect(content().props.initialWorkspace.invoice.invoiceNumber).toBe('DEMO-001');
});
test('opening the same card again preserves local edits and a new revision requires review', () => {
  stageChatInvoice(invoiceChatDraft(), account()); const root = mount();
  const initial = content().props.initialWorkspace;
  content().props.onWorkspaceChange({ ...initial, invoice: { ...initial.invoice, notes: 'Edited locally' } }); root.dispose();
  expect(stageChatInvoice(invoiceChatDraft(), account())).toEqual({ status: 'ready' });
  mount(); expect(content().props.initialWorkspace.invoice.notes).toBe('Edited locally');
  expect(stageChatInvoice({ ...invoiceChatDraft(), revision: 2 }, account()).status).toBe('replacement_required');
});
test('logout, account changes, incomplete drafts and stale owners cannot import', () => {
  const incomplete = invoiceChatDraft(); incomplete.items[0].cost = null;
  expect(() => stageChatInvoice(incomplete, account())).toThrow('Complete');
  const previous = account(); stageChatInvoice(invoiceChatDraft(), previous);
  syncSession(account('b')); expect(() => stageChatInvoice(invoiceChatDraft(), previous)).toThrow('Sign in');
  mount(account('b')); expect(content().props.initialWorkspace).toBeNull();
  expect(() => stageChatInvoice(invoiceChatDraft(), { ...account('b'), status: 'anonymous' })).toThrow('Sign in');
});

test('a locally replaced invoice no longer matches its old chat card', () => {
  stageChatInvoice(invoiceChatDraft(), account()); mount();
  content().props.onWorkspaceChange({ invoice: { invoiceNumber: 'NEW-LOCAL-INVOICE' }, dirty: true, view: 'editor' });
  expect(stageChatInvoice(invoiceChatDraft(), account()).status).toBe('replacement_required');
});

test('a confirmed card replacement refreshes an already mounted private editor', () => {
  const root = mount();
  content().props.onWorkspaceChange({ invoice: { invoiceNumber: 'OPEN-LOCAL' }, dirty: true });
  const offer = stageChatInvoice(invoiceChatDraft(), account());
  expect(offer.status).toBe('replacement_required');
  expect(stageChatInvoice(invoiceChatDraft(), account(), offer.version)).toEqual({ status: 'ready' });
  expect(content().props.initialWorkspace.invoice.invoiceNumber).toBe('DEMO-001');
  root.dispose();
});
