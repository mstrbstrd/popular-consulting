import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import RequireAdmin from './RequireAdmin';
import AuthNavControl from './AuthNavControl';

const identity = (id = 'a'.repeat(64)) => ({ authenticated: true, user: { id, role: 'admin', name: 'Fixture admin' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 });
const reply = data => Promise.resolve({ ok: true, json: async () => data });
const Probe = () => { const auth = useAuth(); return <><p data-testid="status">{auth.status}</p><button onClick={auth.refresh}>Refresh session</button><button onClick={auth.logout}>End session</button></>; };
const Invoice = () => <input aria-label="Fictional invoice" defaultValue="" />;

beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(() => reply({ authenticated: false })); });
afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

test('public content stays available while auth loads or fails', async () => {
  global.fetch.mockRejectedValue(new Error('offline'));
  render(<AuthProvider><p>Public website</p><Probe/><AuthNavControl mobile/></AuthProvider>);
  expect(screen.getByText('Public website')).toBeVisible();
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('link', { name: 'Invoice generator' })).not.toBeInTheDocument();
});
test('anonymous and forged-role sessions never mount invoice content', async () => {
  const editor = jest.fn(() => <Invoice/>);
  function Content() { return editor(); }
  render(<AuthProvider><Probe/><RequireAdmin><Content/></RequireAdmin></AuthProvider>);
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  expect(editor).not.toHaveBeenCalled();
  localStorage.setItem('role', 'admin');
  global.fetch.mockImplementation(() => reply({ ...identity(), user: { id: 'a'.repeat(64), role: 'user' } }));
  fireEvent.click(screen.getByText('Refresh session'));
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'));
  expect(editor).not.toHaveBeenCalled();
});
test('expiry locks and preserves unfinished work; same-account reauthentication restores it', async () => {
  global.fetch.mockImplementation(() => reply(identity()));
  render(<AuthProvider><Probe/><AuthNavControl mobile/><RequireAdmin><Invoice/></RequireAdmin></AuthProvider>);
  const input = await screen.findByLabelText('Fictional invoice');
  fireEvent.change(input, { target: { value: 'Unfinished work' } });
  expect(screen.getByRole('link', { name: 'Invoice generator' })).toHaveAttribute('href', '/invoice-generator');
  global.fetch.mockImplementation(() => reply({ authenticated: false })); fireEvent.click(screen.getByText('Refresh session'));
  await waitFor(() => expect(input).not.toBeVisible());
  expect(input).toHaveValue('Unfinished work');
  expect(document.documentElement).toHaveClass('auth-workspace-locked');
  expect(screen.getByRole('link', { name: 'Sign in in a new tab' })).toHaveAttribute('target', '_blank');
  global.fetch.mockImplementation(() => reply(identity())); fireEvent.click(screen.getByText('Refresh session'));
  await waitFor(() => expect(input).toBeVisible()); expect(input).toHaveValue('Unfinished work');
  expect(localStorage.getItem('csrfToken')).toBeNull(); expect(localStorage.getItem('token')).toBeNull();
});
test('another identity never inherits an open invoice', async () => {
  global.fetch.mockImplementation(() => reply(identity()));
  render(<AuthProvider><Probe/><RequireAdmin><Invoice/></RequireAdmin></AuthProvider>);
  fireEvent.change(await screen.findByLabelText('Fictional invoice'), { target: { value: 'Owner A draft' } });
  global.fetch.mockImplementation(() => reply(identity('c'.repeat(64)))); fireEvent.click(screen.getByText('Refresh session'));
  await waitFor(() => expect(screen.getByLabelText('Fictional invoice')).toHaveValue(''));
});
test('logout rejects a stale in-flight session response and removes the workspace', async () => {
  global.fetch.mockImplementation(() => reply(identity()));
  render(<AuthProvider><Probe/><RequireAdmin><Invoice/></RequireAdmin></AuthProvider>);
  await screen.findByLabelText('Fictional invoice');
  let resolveRefresh;
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }))
    .mockImplementationOnce(() => reply({ loggedOut: true }));
  fireEvent.click(screen.getByText('Refresh session'));
  fireEvent.click(screen.getByText('End session'));
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'));
  await act(async () => resolveRefresh({ ok: true, json: async () => identity() }));
  expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
  expect(screen.queryByLabelText('Fictional invoice')).not.toBeInTheDocument();
  const logoutRequest = global.fetch.mock.calls.find(([url]) => url === '/api/auth/logout')[1];
  expect(logoutRequest.method).toBe('POST'); expect(logoutRequest.headers['X-CSRF-Token']).toBe('b'.repeat(64));
});
test('bfcache restoration hides protected content until the server answers', async () => {
  global.fetch.mockImplementation(() => reply(identity()));
  render(<AuthProvider><RequireAdmin><Invoice/></RequireAdmin></AuthProvider>);
  await screen.findByLabelText('Fictional invoice');
  fireEvent(window, new Event('pagehide'));
  expect(document.documentElement).toHaveClass('auth-revalidating');
  global.fetch.mockImplementation(() => reply({ authenticated: false }));
  fireEvent(window, new Event('pageshow'));
  expect(await screen.findByRole('heading', { name: 'Your workspace is locked.' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Fictional invoice' })).not.toBeInTheDocument();
});
