import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import HomePage from './HomePage';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import logo from '../assets/icons/logo2026_128.png';

expect.extend(toHaveNoViolations);
jest.mock('./NavMenu', () => function MockNav() {
  const { toggleTheme } = require('../contexts/ThemeContext').useThemeMode();
  return <nav aria-label="Primary navigation"><button onClick={toggleTheme}>Toggle theme</button></nav>;
});
jest.mock('../components/BlackHoleBackground', () => ({ isDark }) => isDark ? <canvas data-renderer="black-hole" /> : null);
jest.mock('./ManagedDitherBackground', () => () => <canvas data-renderer="dither" />);
jest.mock('./ProductionThemeCanvas', () => jest.fn(({ theme, highFidelityLight }) => <canvas data-renderer="mobile-light" data-theme={theme} data-detail={highFidelityLight ? 'full' : 'compatible'} />));
jest.mock('../utils/deviceTier', () => ({ hasHardwareWebGL: false, isMobileTier: false }));
jest.mock('../utils/graphicsPolicy', () => ({ GRAPHICS_MODES: { WEBGL: 'webgl' }, graphicsMode: 'auto', shouldAttemptWebGL: true }));

const mockDeviceTier = require('../utils/deviceTier');
const mockGraphicsPolicy = require('../utils/graphicsPolicy');
const mockProductionTheme = require('./ProductionThemeCanvas');

const identity = () => ({ authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional account' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 });
const reply = data => Promise.resolve({ ok: true, json: async () => data });
const SignOut = () => { const { logout } = useAuth(); return <button onClick={logout}>End session</button>; };
const renderHome = () => render(<AuthProvider><HomePage /><SignOut /></AuthProvider>);
const originalMatchMedia = window.matchMedia;
const enterHome = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Popular Consulting, enter your workspace' }));
  return screen.findByRole('region', { name: 'Your tools' }, { timeout: 2000 });
};

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  window.matchMedia = jest.fn(query => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  mockDeviceTier.hasHardwareWebGL = false;
  mockDeviceTier.isMobileTier = false;
  mockGraphicsPolicy.shouldAttemptWebGL = true;
  jest.clearAllMocks();
  mockProductionTheme.mockImplementation(({ theme, highFidelityLight }) => <canvas data-renderer="mobile-light" data-theme={theme} data-detail={highFidelityLight ? 'full' : 'compatible'} />);
  global.fetch = jest.fn(() => reply(identity()));
});
afterEach(() => { jest.restoreAllMocks(); delete global.fetch; window.matchMedia = originalMatchMedia; });

test('opens the four tools after session verification with accessible card names', async () => {
  const { container } = renderHome();
  expect(screen.getByRole('status')).toHaveTextContent('Opening your workspace');
  expect(screen.getByText('Checking your session…').closest('.home-stage')).toHaveAttribute('aria-hidden', 'true');
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  const tools = within(await enterHome());
  expect(tools.getAllByRole('link')).toHaveLength(4);
  tools.getAllByRole('link').forEach(card => expect(card).toHaveClass('aetheris-card'));
  for (const [name, href] of [['Popcan', '/popcan'], ['Dither Canvas', '/dither-canvas'], ['Orb', '/orb'], ['Invoice Generator', '/invoice-generator']]) {
    expect(tools.getByRole('link', { name })).toHaveAttribute('href', href);
  }
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back.');
  expect(screen.getByRole('link', { name: 'Skip to workspace' })).toHaveAttribute('href', '#workspace');
  expect(container.querySelector('canvas')).toBeNull();
  const footer = screen.getByRole('contentinfo');
  expect(footer).toHaveTextContent(`Popular Consulting © ${new Date().getFullYear()}`);
  expect(footer.querySelector('img')).toHaveAttribute('src', logo);
  expect(footer.querySelector('img')).toHaveAttribute('alt', '');
  expect(within(footer).queryAllByRole('link')).toHaveLength(0);
  expect(await axe(container)).toHaveNoViolations();
});

test('uses one existing theme renderer after authentication and switches it with the site theme', async () => {
  mockDeviceTier.hasHardwareWebGL = true;
  localStorage.setItem('popcon-theme', 'dark');
  const { container } = renderHome();
  expect(container.querySelector('canvas')).toBeNull();
  await enterHome();
  expect(container.querySelectorAll('canvas')).toHaveLength(1);
  expect(container.querySelector('canvas')).toHaveAttribute('data-renderer', 'black-hole');
  const previousCanvas = container.querySelector('canvas');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
  expect(container.querySelectorAll('canvas')).toHaveLength(1);
  expect(container.querySelector('canvas')).toHaveAttribute('data-renderer', 'dither');
  expect(container.querySelector('canvas')).not.toBe(previousCanvas);
  expect(localStorage.getItem('popcon-theme')).toBe('light');
  global.fetch.mockImplementation(() => reply({ authenticated: false }));
  fireEvent.focus(window);
  await screen.findByRole('link', { name: 'Sign in' });
  expect(container.querySelector('canvas')).toBeNull();
});

test('a capable phone uses the normal full-detail mobile light pass, with local compatibility recovery', async () => {
  mockDeviceTier.hasHardwareWebGL = true;
  mockDeviceTier.isMobileTier = true;
  const { container } = renderHome();
  await enterHome();
  expect(container.querySelectorAll('canvas')).toHaveLength(1);
  expect(container.querySelector('canvas')).toHaveAttribute('data-renderer', 'mobile-light');
  expect(container.querySelector('canvas')).toHaveAttribute('data-detail', 'full');
  act(() => mockProductionTheme.mock.calls.at(-1)[0].onFieldStateChange('fallback'));
  expect(container.querySelectorAll('canvas')).toHaveLength(1);
  expect(container.querySelector('canvas')).toHaveAttribute('data-renderer', 'dither');
});

test('the CSS graphics policy keeps the complete workspace and footer without a canvas', async () => {
  mockDeviceTier.hasHardwareWebGL = true;
  mockGraphicsPolicy.shouldAttemptWebGL = false;
  const { container } = renderHome();
  await enterHome();
  expect(container.querySelector('canvas')).toBeNull();
  expect(container.querySelector('.production-theme-fallback')).toBeInTheDocument();
  expect(screen.getByRole('contentinfo')).toBeInTheDocument();
});

test('forced colors removes the decorative renderer and the media listener is cleaned up', async () => {
  mockDeviceTier.hasHardwareWebGL = true;
  const originalMatchMedia = window.matchMedia;
  const query = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => query);
  try {
    const { container, unmount } = renderHome();
    await enterHome();
    expect(container.querySelector('canvas')).not.toBeNull();
    const sync = query.addEventListener.mock.calls.find(([name]) => name === 'change')[1];
    act(() => { query.matches = true; sync(); });
    expect(container.querySelector('canvas')).toBeNull();
    expect(screen.getByRole('region', { name: 'Your tools' })).toBeInTheDocument();
    unmount();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', sync);
  } finally { window.matchMedia = originalMatchMedia; }
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
  await enterHome();
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
  await enterHome();
  global.fetch.mockImplementation(() => reply({ authenticated: false }));
  fireEvent.focus(window);
  expect(await screen.findByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Invoice Generator' })).not.toBeInTheDocument();
});

test('bfcache restoration waits for the server before showing tools again', async () => {
  const { container } = renderHome();
  await enterHome();
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
  await enterHome();
  global.fetch.mockImplementation(() => reply({ loggedOut: true }));
  fireEvent.click(screen.getByRole('button', { name: 'End session' }));
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument());
  unmount();
  expect(document.documentElement).not.toHaveClass('home-route');
  expect(document.documentElement.style.cssText).toBe(previous.html);
  expect(document.body.style.cssText).toBe(previous.body);
  expect(document.title).toBe(previous.title);
});

test('a verified session stays behind the opening logo until the user enters', async () => {
  const { container } = renderHome();
  await screen.findByText('Interact to enter your workspace.');
  expect(container.querySelector('.home-stage')).toHaveAttribute('inert');
  expect(document.documentElement).toHaveClass('home-intro-active');
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  await enterHome();
  expect(screen.getByRole('main')).toHaveFocus();
  expect(document.documentElement).not.toHaveClass('home-intro-active');
});

test('the opener preserves browser shortcuts and modifier-only keys', async () => {
  renderHome();
  await screen.findByText('Interact to enter your workspace.');
  expect(fireEvent.keyDown(window, { key: 'F5' })).toBe(true);
  expect(fireEvent.keyDown(window, { key: 'r', metaKey: true })).toBe(true);
  expect(fireEvent.keyDown(window, { key: 'Shift' })).toBe(true);
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
});

test.each(['click', 'wheel', 'keyboard', 'touch'])('remembers early %s entry without exposing unverified tools', async method => {
  let resolveSession;
  global.fetch.mockImplementation(() => new Promise(resolve => { resolveSession = resolve; }));
  mockDeviceTier.hasHardwareWebGL = true;
  const { container } = renderHome();
  const intro = screen.getByRole('region', { name: 'Welcome' });
  if (method === 'click') fireEvent.click(intro);
  if (method === 'wheel') fireEvent.wheel(window, { deltaY: 80 });
  if (method === 'keyboard') fireEvent.keyDown(window, { key: 'Tab' });
  if (method === 'touch') fireEvent.touchStart(intro);
  expect(screen.queryByRole('link', { name: 'Invoice Generator' })).not.toBeInTheDocument();
  expect(container.querySelector('.auth-protected-content')).toBeNull();
  expect(container.querySelector('canvas')).toBeNull();
  await act(async () => resolveSession({ ok: true, json: async () => identity() }));
  expect(screen.getByRole('region', { name: 'Your tools' })).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveFocus();
});

test('finishes the animated reveal once and releases its scroll and interaction locks', async () => {
  jest.useFakeTimers();
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  try {
    let view;
    await act(async () => { view = renderHome(); });
    fireEvent.wheel(window, { deltaY: 80 });
    expect(view.container.querySelector('.home-page')).toHaveAttribute('data-entry', 'revealing');
    expect(view.container.querySelector('.home-stage')).toHaveAttribute('inert');
    act(() => jest.advanceTimersByTime(1199));
    expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByRole('region', { name: 'Your tools' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(view.container.querySelector('.home-page')).toHaveAttribute('data-entry', 'open');
    expect(document.documentElement).not.toHaveClass('home-intro-active');
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

test('consumes the main-site entry intent once under StrictMode and still verifies the session', async () => {
  sessionStorage.setItem('popcon-home-entry', String(Date.now()));
  let resolveSession;
  global.fetch.mockImplementation(() => new Promise(resolve => { resolveSession = resolve; }));
  render(<React.StrictMode><AuthProvider><HomePage /></AuthProvider></React.StrictMode>);
  expect(sessionStorage.getItem('popcon-home-entry')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  await act(async () => resolveSession({ ok: true, json: async () => identity() }));
  expect(screen.getByRole('region', { name: 'Your tools' })).toBeInTheDocument();
});

test('a failed initial check exposes recovery without requiring entry', async () => {
  global.fetch.mockRejectedValue(new Error('offline'));
  renderHome();
  expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument();
  expect(document.documentElement).not.toHaveClass('home-intro-active');
});

test('an expired entry intent cannot skip a fresh opening', async () => {
  sessionStorage.setItem('popcon-home-entry', String(Date.now() - 31000));
  const { unmount } = renderHome();
  await screen.findByText('Interact to enter your workspace.');
  expect(screen.queryByRole('region', { name: 'Your tools' })).not.toBeInTheDocument();
  expect(sessionStorage.getItem('popcon-home-entry')).toBeNull();
  unmount();
  expect(document.documentElement).not.toHaveClass('home-intro-active');
});

test('turning on reduced motion during entry completes it without waiting', async () => {
  const listeners = new Set();
  const motion = { matches: false, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  window.matchMedia = jest.fn(query => query === '(prefers-reduced-motion: reduce)' ? motion : { matches: false });
  const { container, unmount } = renderHome();
  await screen.findByText('Interact to enter your workspace.');
  fireEvent.click(screen.getByRole('region', { name: 'Welcome' }));
  expect(container.querySelector('.home-page')).toHaveAttribute('data-entry', 'revealing');
  act(() => { motion.matches = true; listeners.forEach(listener => listener()); });
  expect(screen.getByRole('region', { name: 'Your tools' })).toBeInTheDocument();
  expect(document.documentElement).not.toHaveClass('home-intro-active');
  unmount();
  expect(listeners.size).toBe(0);
});
