import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthContext } from '../contexts/AuthContext';
import { AppNavigationContext, navigateInApp } from '../contexts/AppNavigationContext';
import { loadPrivateInvoice, syncPrivateInvoiceSession } from '../utils/privateInvoiceLoader';
import PrivateInvoicePage from './PrivateInvoicePage';
import WorkspaceMenu from './WorkspaceMenu';

jest.mock('../contexts/AppNavigationContext', () => ({
  ...jest.requireActual('../contexts/AppNavigationContext'), navigateInApp: jest.fn(),
}));
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock('../utils/privateInvoiceLoader', () => ({ loadPrivateInvoice: jest.fn(), syncPrivateInvoiceSession: jest.fn() }));
jest.mock('./AuthPage', () => () => <div>Sign in required</div>);

const refresh = jest.fn();
const session = (status = 'authenticated', id = 'a'.repeat(64), logoutRevision = 0) => ({
  status, user: status === 'authenticated' ? { id, role: 'admin' } : null, refresh, logoutRevision,
});
const navigation = { pathname: '/invoice-generator' };
const page = (auth, children = <PrivateInvoicePage />) => <AuthContext.Provider value={auth}>
  <AppNavigationContext.Provider value={navigation}>{children}</AppNavigationContext.Provider>
</AuthContext.Provider>;

beforeEach(() => { jest.clearAllMocks(); loadPrivateInvoice.mockImplementation(() => new Promise(() => {})); });

test.each(['anonymous', 'loading', 'unavailable'])('%s users never load the invoice implementation', status => {
  render(page(session(status)));
  expect(loadPrivateInvoice).not.toHaveBeenCalled();
  if (status === 'anonymous') expect(navigateInApp).toHaveBeenCalledWith('/login', { replace: true });
  else expect(navigateInApp).not.toHaveBeenCalled();
});

test('a late module response cannot open the invoice after sign-out', async () => {
  let resolveEntry;
  loadPrivateInvoice.mockImplementation(() => new Promise(resolve => { resolveEntry = resolve; }));
  const { rerender } = render(page(session()));
  const signal = loadPrivateInvoice.mock.calls[0][0];
  rerender(page(session('anonymous', undefined, 1)));
  expect(signal.aborted).toBe(true);
  await act(async () => resolveEntry({ module: { mountInvoice: jest.fn() }, css: '/_private/invoice/app-stale.css' }));
  expect(document.querySelector('link[href="/_private/invoice/app-stale.css"]')).toBeNull();
  expect(screen.getByText('Sign in required')).toBeInTheDocument();
});

test('a new session revision cancels and replaces a pending invoice load', () => {
  const { rerender } = render(page(session()));
  const first = loadPrivateInvoice.mock.calls[0][0];
  rerender(page(session('authenticated', 'a'.repeat(64), 1)));
  expect(first.aborted).toBe(true);
  expect(loadPrivateInvoice).toHaveBeenCalledTimes(2);
});

test('an open invoice receives the lock state without discarding its unfinished draft', async () => {
  const controller = { update: jest.fn(), dispose: jest.fn() };
  const module = { syncSession: jest.fn(), mountInvoice: jest.fn(() => controller) };
  loadPrivateInvoice.mockResolvedValue({ module, css: '/_private/invoice/app-fixture.css' });
  const { rerender } = render(page(session()));
  await waitFor(() => expect(document.querySelector('link[href="/_private/invoice/app-fixture.css"]')).not.toBeNull());
  fireEvent.load(document.querySelector('link[href="/_private/invoice/app-fixture.css"]'));
  expect(module.mountInvoice).toHaveBeenCalledTimes(1);
  const expired = session('anonymous');
  rerender(page(expired));
  expect(syncPrivateInvoiceSession).toHaveBeenLastCalledWith(expired);
  expect(controller.update).toHaveBeenLastCalledWith(expect.objectContaining({ auth: expired }));
  expect(controller.dispose).not.toHaveBeenCalled();
  expect(navigateInApp).not.toHaveBeenCalled();
});

test.each([false, true])('invoice navigation requires authentication (inline=%s)', inline => {
  const { rerender } = render(page(session('anonymous'), <WorkspaceMenu inline={inline} />));
  expect(document.querySelector('a[href="/invoice-generator"]')).toBeNull();
  rerender(page(session(), <WorkspaceMenu inline={inline} />));
  expect(document.querySelector('a[href="/invoice-generator"]')).not.toBeNull();
  rerender(page(session('unavailable'), <WorkspaceMenu inline={inline} />));
  expect(document.querySelector('a[href="/invoice-generator"]')).toBeNull();
});
