import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import HomePage from './HomePage';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

expect.extend(toHaveNoViolations);
jest.mock('./NavMenu', () => () => <nav aria-label="Primary navigation" />);
jest.mock('../components/BlackHoleBackground', () => () => null);

const identity = () => ({ authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional account' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 });
const reply = data => Promise.resolve({ ok: true, json: async () => data });
const SignOut = () => { const { logout } = useAuth(); return <button onClick={logout}>End session</button>; };
const renderHome = () => render(<AuthProvider><HomePage /><SignOut /></AuthProvider>);

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn(() => reply(identity()));
});
afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });

test('opens the four tools after session verification with accessible card names', async () => {
  const { container } = renderHome();
  expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  const tools = within(await screen.findByRole('region', { name: 'Your tools' }));
  expect(tools.getAllByRole('link')).toHaveLength(4);
  for (const [name, href] of [['Popcan', '/popcan'], ['Dither Canvas', '/dither-canvas'], ['Orb', '/orb'], ['Invoice Generator', '/invoice-generator']]) {
    expect(tools.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back.');
  expect(screen.getByRole('link', { name: 'Skip to workspace' })).toHaveAttribute('href', '#workspace');
  expect(container.querySelector('canvas')).toBeNull();
  expect(await axe(container)).toHaveNoViolations();
});

test('anonymous sessions get a sign-in path without mounting tool cards', async () => {
  global.fetch.mockImplementation(() => reply({ authenticated: false }));
  localStorage.setItem('role', 'admin');
  renderHome();
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
});

test('a failed check removes the dashboard and retry can restore it', async () => {
  renderHome();
  await screen.findByRole('region', { name: 'Your tools' });
  global.fetch.mockRejectedValue(new Error('offline'));
  fireEvent.focus(window);
  const retry = await screen.findByRole('button', { name: 'Try again' });
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  global.fetch.mockImplementation(() => reply(identity()));
  fireEvent.click(retry);
  expect(await screen.findByRole('region', { name: 'Your tools' })).toBeInTheDocument();
});

test('revocation or expiry discovered on focus removes the tool links', async () => {
  renderHome();
  await screen.findByRole('region', { name: 'Your tools' });
  global.fetch.mockImplementation(() => reply({ authenticated: false }));
  fireEvent.focus(window);
  expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Invoice Generator' })).not.toBeInTheDocument();
});

test('bfcache restoration waits for the server before showing tools again', async () => {
  const { container } = renderHome();
  await screen.findByRole('region', { name: 'Your tools' });
  expect(container.querySelector('.auth-protected-content')).toContainElement(screen.getByRole('region', { name: 'Your tools' }));
  fireEvent(window, new Event('pagehide'));
  expect(document.documentElement).toHaveClass('auth-revalidating');
  let resolveSession;
  global.fetch.mockImplementation(() => new Promise(resolve => { resolveSession = resolve; }));
  fireEvent(window, new Event('pageshow'));
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  await act(async () => resolveSession({ ok: true, json: async () => ({ authenticated: false }) }));
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
});

test('successful logout closes home and unmount restores document styles', async () => {
  const previous = { html: document.documentElement.style.cssText, body: document.body.style.cssText, title: document.title };
  const { unmount } = renderHome();
  await screen.findByRole('region', { name: 'Your tools' });
  global.fetch.mockImplementation(() => reply({ loggedOut: true }));
  fireEvent.click(screen.getByRole('button', { name: 'End session' }));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument());
  unmount();
  expect(document.documentElement).not.toHaveClass('home-route');
  expect(document.documentElement.style.cssText).toBe(previous.html);
  expect(document.body.style.cssText).toBe(previous.body);
  expect(document.title).toBe(previous.title);
});
