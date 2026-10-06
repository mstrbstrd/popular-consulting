import { mountInvoice, syncSession } from './invoice-entry';
import { createRoot } from 'react-dom/client';

jest.mock('react-dom/client', () => ({ createRoot: jest.fn() }));
jest.mock('./components/InvoiceGeneratorPage', () => ({ InvoiceGeneratorContent: () => null }));
jest.mock('./components/RequireAdmin', () => ({ __esModule: true, default: () => null }));
jest.mock('./components/BlackHoleBackground', () => () => null);
const account = (id = 'a', revision = 0) => ({ status: 'authenticated', user: { id: id.repeat(64) }, logoutRevision: revision });
let rendered;
const content = () => rendered.props.children.props.children.props.children.props.children.props.children;
beforeEach(() => {
  createRoot.mockReturnValue({ render: element => { rendered = element; }, unmount: jest.fn() });
  syncSession(account('a', 10));
});
test('retains an unfinished invoice only in its private module and restores it on return', () => {
  const state = { auth: account('a', 10), theme: {}, navigation: {} };
  syncSession(state.auth);
  const first = mountInvoice(document.createElement('div'), state);
  const snapshot = { invoice: { invoiceNumber: 'FICTIONAL-ONLY' }, dirty: true, view: 'editor' };
  content().props.onWorkspaceChange(snapshot);
  first.dispose();
  mountInvoice(document.createElement('div'), state);
  expect(content().props.initialWorkspace).toEqual(snapshot);
});
test('clears retained private data after logout or an account change, including a live root', () => {
  const state = { auth: account('a', 10), theme: {}, navigation: {} };
  const first = mountInvoice(document.createElement('div'), state);
  content().props.onWorkspaceChange({ invoice: { invoiceNumber: 'FICTIONAL-ONLY' }, dirty: true });
  first.update({ ...state, auth: account('a', 11) });
  expect(content().props.initialWorkspace).toBeNull();
  first.dispose();
  syncSession(account('b', 11));
  mountInvoice(document.createElement('div'), { ...state, auth: account('b', 11) });
  expect(content().props.initialWorkspace).toBeNull();
});
test('rejects a late snapshot from the previous account', () => {
  const state = { auth: account('a', 10), theme: {}, navigation: {} };
  const first = mountInvoice(document.createElement('div'), state);
  const previousWriter = content().props.onWorkspaceChange;
  first.update({ ...state, auth: account('b', 10) });
  previousWriter({ invoice: { invoiceNumber: 'PREVIOUS-ACCOUNT' }, dirty: true });
  first.dispose();
  mountInvoice(document.createElement('div'), { ...state, auth: account('b', 10) });
  expect(content().props.initialWorkspace).toBeNull();
});
