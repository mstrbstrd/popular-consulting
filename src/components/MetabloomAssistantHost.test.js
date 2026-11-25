import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MetabloomSessionProvider from './MetabloomSessionProvider';
import OrbPage from './OrbPage';
import { AppNavigationContext } from '../contexts/AppNavigationContext';

let mockAuth = { status: 'authenticated', user: { id: 'a'.repeat(64), role: 'admin' }, logoutRevision: 0 };
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../contexts/ThemeContext', () => ({ ThemeProvider: ({ children }) => children, useThemeMode: () => ({ isDark: false }) }));
jest.mock('./NavMenu', () => () => null);
jest.mock('./ImmersiveRouteNavigationBridge', () => () => null);
jest.mock('./MetabloomVisuals', () => () => null);
jest.mock('./LoadingOverlay', () => () => null);
jest.mock('./liquidGlassRefraction', () => () => {});
jest.mock('./useMetabloomThreads', () => () => ({ enabled: false }));
jest.mock('./MetabloomAvatar', () => () => <canvas data-testid="actual-orb-canvas" />);
jest.mock('./metabloomApiClient', () => ({ requestMetabloomResponse: jest.fn(async () => null) }));

const getToolState = () => null;
const saveToolState = jest.fn();
const navigate = jest.fn();
function View({ pathname, welcome = false }) {
  const navigation = { pathname, getToolState, saveToolState, navigate };
  return <AppNavigationContext.Provider value={navigation}>
    <MetabloomSessionProvider navigation={navigation} welcome={welcome}>
      {pathname === '/orb' ? <OrbPage /> : <main>Invoice workspace</main>}
    </MetabloomSessionProvider>
  </AppNavigationContext.Provider>;
}

afterEach(() => { cleanup(); delete window.__metabloomRequest; });
beforeEach(() => { mockAuth = { status: 'authenticated', user: { id: 'a'.repeat(64), role: 'admin' }, logoutRevision: 0 }; });

test('keeps the actual canvas, draft and live request while navigating out and back', async () => {
  let request;
  const claim = event => { request = event.detail; request.claim(); };
  window.addEventListener('metabloom:user-message', claim);
  try {
    const { rerender } = render(<View pathname="/orb" />);
    const canvas = await screen.findByTestId('actual-orb-canvas');
    const input = screen.getByRole('textbox', { name: 'Message Metabloom' });
    fireEvent.change(input, { target: { value: 'Explain invoice terms' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(request.signal.aborted).toBe(false);
    const requestId = request.requestId;
    fireEvent.change(input, { target: { value: 'An unfinished next question' } });
    rerender(<View pathname="/invoice-generator" />);
    expect(screen.getByTestId('actual-orb-canvas')).toBe(canvas);
    expect(request.signal.aborted).toBe(false);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(document.querySelector('#metabloom-message').value).toBe('An unfinished next question');
    act(() => request.respond({ version: '2.0.0', segments: [{ response: 'Net 30 means payment is due in 30 days.' }] }));
    rerender(<View pathname="/orb" />);
    expect(screen.getByTestId('actual-orb-canvas')).toBe(canvas);
    expect(request.requestId).toBe(requestId);
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Net 30 means payment is due in 30 days.');
    expect(screen.getAllByTestId('actual-orb-canvas')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Message Metabloom' })).toHaveValue('An unfinished next question');
  } finally { window.removeEventListener('metabloom:user-message', claim); }
});

test('revokes the assistant when authentication is lost and starts a fresh one for the next account', async () => {
  const { rerender } = render(<View pathname="/invoice-generator" />);
  const first = await screen.findByTestId('actual-orb-canvas');
  mockAuth = { status: 'anonymous', user: null, logoutRevision: 1 };
  rerender(<View pathname="/invoice-generator" />);
  await waitFor(() => expect(screen.queryByTestId('actual-orb-canvas')).toBeNull());
  mockAuth = { status: 'authenticated', user: { id: 'b'.repeat(64), role: 'admin' }, logoutRevision: 1 };
  rerender(<View pathname="/invoice-generator" />);
  expect(await screen.findByTestId('actual-orb-canvas')).not.toBe(first);
});

test('the assistant waits out a Welcome screen and is then hidden, never unmounted, while one returns', async () => {
  const { rerender } = render(<View pathname="/home" welcome />);
  expect(screen.queryByTestId('actual-orb-canvas')).toBeNull();
  rerender(<View pathname="/home" />);
  const canvas = await screen.findByTestId('actual-orb-canvas');
  const host = document.querySelector('.metabloom-assistant-host');
  expect(host).toHaveAttribute('data-assistant-away', 'false');
  rerender(<View pathname="/" welcome />);
  expect(screen.getByTestId('actual-orb-canvas')).toBe(canvas);
  expect(host).toHaveAttribute('data-assistant-away', 'true');
  expect(host).toHaveAttribute('inert');
  rerender(<View pathname="/work" />);
  expect(host).toHaveAttribute('data-assistant-away', 'false');
  expect(host).not.toHaveAttribute('inert');
});

test('signed-out visitors and non-admin accounts get no assistant', () => {
  mockAuth = { status: 'anonymous', user: null, logoutRevision: 0 };
  const { rerender } = render(<View pathname="/work" />);
  expect(screen.queryByTestId('actual-orb-canvas')).toBeNull();
  mockAuth = { status: 'authenticated', user: { id: 'c'.repeat(64), role: 'user' }, logoutRevision: 0 };
  rerender(<View pathname="/work" />);
  expect(screen.queryByTestId('actual-orb-canvas')).toBeNull();
});


test('a direct invoice visit has its single assistant ready without a launcher', async () => {
  render(<View pathname="/invoice-generator" />);
  expect(screen.queryByRole('button', { name: 'Ask Metabloom' })).toBeNull();
  await screen.findByTestId('actual-orb-canvas');
  // The dock starts closed, as on every page; its toggle opens the chat.
  expect(screen.queryByRole('textbox', { name: 'Message Metabloom' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
  expect(screen.getAllByTestId('actual-orb-canvas')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Message Metabloom' })).toBeInTheDocument();
  expect(document.body).toHaveAttribute('data-metabloom-companion', 'invoice');
  fireEvent.click(screen.getByRole('button', { name: 'Hide assistant' }));
  expect(screen.getByRole('button', { name: 'Show Metabloom' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Message Metabloom' })).toBeNull();
});
