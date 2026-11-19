import { webcrypto } from 'crypto';
import { createRoot } from 'react-dom/client';
import { mountInvoice, syncSession, stageGuidedInvoice, getWorkspaceStatus } from './invoice-entry';

jest.mock('react-dom/client', () => ({ createRoot: jest.fn() }));
jest.mock('./components/InvoiceGeneratorPage', () => ({ InvoiceGeneratorContent: () => null }));
jest.mock('./components/RequireAdmin', () => ({ __esModule: true, default: () => null }));
const conversationId = '11111111-1111-4111-8111-111111111111';
const oldCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let epoch = 1000, rendered, roots = [];
const auth = () => ({ status: 'authenticated', user: { id: 'a'.repeat(64), role: 'admin' }, logoutRevision: epoch });
const content = () => rendered.props.children.props.children.props.children.props.children.props.children;
const mount = () => { const root = mountInvoice(document.createElement('div'), { auth: auth(), theme: {}, navigation: {} }); roots.push(root); return root; };
beforeAll(() => Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }));
afterAll(() => { if (oldCrypto) Object.defineProperty(globalThis, 'crypto', oldCrypto); else delete globalThis.crypto; });
beforeEach(() => { epoch++; syncSession(auth()); createRoot.mockReturnValue({ render: value => { rendered = value; }, unmount: jest.fn() }); });
afterEach(() => { roots.forEach(root => root.dispose()); roots = []; });

test('stages a blank guided invoice without private defaults or device writes', () => {
  const write = jest.spyOn(Storage.prototype, 'setItem');
  expect(getWorkspaceStatus(auth())).toEqual({ exists: false, version: expect.any(Number), connectedConversationId: null });
  expect(stageGuidedInvoice(auth(), { conversationId })).toEqual({ status: 'ready' }); mount();
  const workspace = content().props.initialWorkspace;
  expect(workspace.invoice).toMatchObject({ companyName: '', companyEmail: '', clientName: '', currency: '', invoiceDate: '', items: [] });
  expect(workspace.invoice.invoiceNumber).toMatch(/^INV-/); expect(workspace.assistance.conversationId).toBe(conversationId);
  expect(getWorkspaceStatus(auth())).toEqual({ exists: true, version: expect.any(Number), connectedConversationId: conversationId });
  expect(write).not.toHaveBeenCalled(); write.mockRestore();
});

test('opening an unrelated invoice requires a current explicit replacement version', () => {
  mount(); const write = content().props.onWorkspaceChange;
  write({ invoice: { invoiceNumber: 'EXISTING' }, dirty: true });
  const offer = stageGuidedInvoice(auth(), { conversationId }); expect(offer.status).toBe('replacement_required');
  write({ invoice: { invoiceNumber: 'NEWER' }, dirty: true });
  const stale = stageGuidedInvoice(auth(), { conversationId, expectedWorkspaceVersion: offer.version }); expect(stale.status).toBe('replacement_required');
  expect(stageGuidedInvoice(auth(), { conversationId, expectedWorkspaceVersion: stale.version })).toEqual({ status: 'ready' });
  expect(content().props.initialWorkspace.invoice.invoiceNumber).toMatch(/^INV-/);
  write({ invoice: { invoiceNumber: 'LATE' }, dirty: true });
  expect(getWorkspaceStatus(auth()).connectedConversationId).toBe(conversationId);
});

test('reopening the connected invoice keeps edits and stale account access fails', () => {
  stageGuidedInvoice(auth(), { conversationId }); mount();
  const first = content().props.initialWorkspace;
  content().props.onWorkspaceChange({ ...first, invoice: { ...first.invoice, clientName: 'Manual client' } });
  expect(stageGuidedInvoice(auth(), { conversationId })).toEqual({ status: 'ready' }); mount();
  expect(content().props.initialWorkspace.invoice.clientName).toBe('Manual client');
  const previous = auth(); epoch++; syncSession(auth());
  expect(() => stageGuidedInvoice(previous, { conversationId })).toThrow('Sign in');
  expect(getWorkspaceStatus(auth()).exists).toBe(false);
});
