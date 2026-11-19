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
function View({ pathname }) {
  const navigation = { pathname, getToolState, saveToolState, navigate };
  return <AppNavigationContext.Provider value={navigation}>
    <MetabloomSessionProvider navigation={navigation}>
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

test('does not mount an untouched assistant and revokes it when authentication is lost', async () => {
  const { rerender } = render(<View pathname="/invoice-generator" />);
  expect(screen.queryByTestId('actual-orb-canvas')).toBeNull();
  rerender(<View pathname="/orb" />);
  await screen.findByTestId('actual-orb-canvas');
  mockAuth = { status: 'anonymous', user: null, logoutRevision: 1 };
  rerender(<View pathname="/invoice-generator" />);
  await waitFor(() => expect(screen.queryByTestId('actual-orb-canvas')).toBeNull());
  mockAuth = { status: 'authenticated', user: { id: 'b'.repeat(64), role: 'admin' }, logoutRevision: 1 };
  rerender(<View pathname="/invoice-generator" />);
  expect(screen.queryByTestId('actual-orb-canvas')).toBeNull();
});


test('a direct invoice visit starts its single assistant only after an explicit launcher click', async () => {
  render(<View pathname="/invoice-generator" />);
  expect(screen.queryByTestId('actual-orb-canvas')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ask Metabloom' }));
  await screen.findByTestId('actual-orb-canvas');
  expect(screen.getAllByTestId('actual-orb-canvas')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Message Metabloom' })).toBeInTheDocument();
  expect(document.body).toHaveAttribute('data-metabloom-companion', 'invoice');
  fireEvent.click(screen.getByRole('button', { name: 'Hide assistant' }));
  expect(screen.getByRole('button', { name: 'Show Metabloom' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Message Metabloom' })).toBeNull();
});
