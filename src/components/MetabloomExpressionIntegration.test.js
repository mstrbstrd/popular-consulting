import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import { parseMetabloomThreadSnapshot, createMetabloomThreadSnapshot } from './metabloomThreadProtocol';
import OrbSection from './OrbSection';

let mockAvatar;
jest.mock('./MetabloomAvatar', () => props => { mockAvatar = props; return null; });
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
let requests, media, originalMatchMedia, hiddenDescriptor;
const originalTextEncoder = global.TextEncoder;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
const latest = () => requests[requests.length - 1];
const tick = async (ms = 0) => { await act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); }); };
const send = (message = 'make yourself stand out in this new environment.') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
};
const openOptions = () => {
  if (!screen.queryByRole('checkbox', { name: 'Allow model-chosen expressions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reactions' }));
};
const complete = async (item = latest(), emote = 'curious', source = 'model') => {
  const { request, finish } = item;
  await act(async () => {
    request.onAction('none');
    request.onAgentStatus({ type: 'agent_status', state: 'working' });
    if (source === 'model') {
      request.onToolActivity({ type: 'tool_activity', name: 'express_orb', callId: 'choice', state: 'running' });
      request.onToolActivity({ type: 'tool_activity', name: 'express_orb', callId: 'choice', state: 'complete' });
      request.onAgentStatus({ type: 'agent_status', state: 'reviewing' });
    }
    request.onAgentStatus({ type: 'agent_status', state: 'validating' });
    request.onSegment({ response: 'I can choose a deliberate gesture for this reply.' }, 0);
    request.onReaction({ phase: 'response', emote, expression: { type: 'orb_expression', requestId: request.requestId, emote, source } });
    finish({ version: '2.0.0', segments: [{ response: 'I can choose a deliberate gesture for this reply.' }] });
    await Promise.resolve();
  });
  await tick();
};
beforeEach(() => {
  jest.useFakeTimers(); requests = [];
  originalMatchMedia = window.matchMedia;
  hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const listeners = new Set();
  media = { matches: false, addEventListener: (_name, callback) => listeners.add(callback),
    removeEventListener: (_name, callback) => listeners.delete(callback), change: value => {
      media.matches = value; listeners.forEach(callback => callback());
    } };
  window.matchMedia = () => media;
  window.__metabloomRequest = request => new Promise((finish, reject) => requests.push({ request, finish, reject }));
});
afterEach(() => {
  cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.matchMedia = originalMatchMedia;
  if (hiddenDescriptor) Object.defineProperty(document, 'hidden', hiddenDescriptor); else delete document.hidden;
  delete window.__metabloomRequest;
});

test('the chosen gesture plays and its actual receipt reaches the next turn', async () => {
  render(<OrbSection />); send(); await tick();
  expect(latest().request.orbContext).toMatchObject({ enabled: true, lastExpression: null });
  const previous = latest().request.requestId;
  await complete();
  expect(window.__orbState().emote).toBe('curious');
  openOptions();
  expect(screen.getByRole('status', { name: 'Last Orb expression' })).toHaveTextContent('Model choice · Playing');
  await tick(10000);
  expect(screen.getByRole('status', { name: 'Last Orb expression' })).toHaveTextContent('Sequence finished');
  send('Did that work?'); await tick();
  expect(latest().request.orbContext.lastExpression).toEqual({ requestId: previous, emote: 'curious', source: 'model', status: 'finished', reason: 'runtime' });
});
test('reduced motion uses the final chain pose and reports simplification', async () => {
  media.matches = true; render(<OrbSection />); send(); await tick(); await complete(latest(), 'explore-and-consider');
  expect(window.__orbState().emote).toBe('reflective');
  send('What happened?'); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ emote: 'explore-and-consider', status: 'simplified', reason: 'reduced_motion' });
});
test('a chain finishes its remaining steps after network completion', async () => {
  render(<OrbSection />); send(); await tick(); await complete(latest(), 'explore-and-consider');
  expect(window.__orbState().emote).toBe('curious');
  await tick(10000);
  expect(window.__orbState().emote).toBe('reflective');
  send(); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ status: 'finished', reason: 'runtime' });
});
test('a paused Orb stays paused through focus, thinking, input and final reactions', async () => {
  render(<OrbSection />); openOptions();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Pause Orb motion' }));
  const version = window.__orbState().actionVersion;
  fireEvent.focus(screen.getByRole('textbox')); send(); await tick(800);
  act(() => latest().request.onReaction({ phase: 'input', emote: 'warm' }));
  await complete();
  expect(window.__orbState()).toMatchObject({ paused: true, actionVersion: version });
  expect(mockAvatar.paused).toBe(true);
  send('Why no movement?'); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ status: 'suppressed', reason: 'paused' });
});
test('pausing cancels an existing manual sequence so its next step cannot resume motion', async () => {
  render(<OrbSection />);
  act(() => window.__orbPlaySequence([{ action: 'curious', duration: 500 }, { action: 'agree', duration: 500 }]));
  expect(window.__orbState().sequenceId).not.toBeNull();
  openOptions(); fireEvent.click(screen.getByRole('checkbox', { name: 'Pause Orb motion' }));
  const version = window.__orbState().actionVersion;
  await tick(2000);
  expect(window.__orbState()).toMatchObject({ paused: true, actionVersion: version, sequenceId: null });
});
test.each(['hidden', 'disabled'])('a %s surface suppresses the queued expression without losing the answer', async reason => {
  render(<OrbSection />); send(); await tick();
  if (reason === 'hidden') act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
  });
  else { openOptions(); fireEvent.click(screen.getByRole('checkbox', { name: 'Allow model-chosen expressions' })); }
  const version = window.__orbState().actionVersion;
  await complete();
  expect(window.__orbState().actionVersion).toBe(version);
  expect(screen.getByText('I can choose a deliberate gesture for this reply.')).toBeVisible();
  send('What happened?'); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ status: 'suppressed', reason });
});
test.each(['hidden', 'paused', 'disabled'])('%s during a chain ends its remaining steps', async reason => {
  render(<OrbSection />); send(); await tick(); await complete(latest(), 'explore-and-consider');
  const first = window.__orbState().emote;
  if (reason === 'hidden') act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
  });
  else {
    openOptions();
    fireEvent.click(screen.getByRole('checkbox', { name: reason === 'paused' ? 'Pause Orb motion' : 'Allow model-chosen expressions' }));
  }
  await tick(10000);
  expect(window.__orbState().emote).toBe(first);
  send(); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ status: 'interrupted', reason });
});
test('enabling reduced motion during a chain settles immediately without later steps', async () => {
  render(<OrbSection />); send(); await tick(); await complete(latest(), 'explore-and-consider');
  act(() => media.change(true));
  const version = window.__orbState().actionVersion;
  expect(window.__orbState().emote).toBe('reflective');
  await tick(10000);
  expect(window.__orbState().actionVersion).toBe(version);
  send(); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ status: 'simplified', reason: 'reduced_motion' });
});
test('replacement, stop and malformed metadata cannot apply late choices', async () => {
  render(<OrbSection />); send(); await tick(); const previous = latest();
  send('A replacement question'); await tick();
  const version = window.__orbState().actionVersion;
  await complete(previous);
  expect(window.__orbState().actionVersion).toBe(version);
  const current = latest();
  act(() => current.request.onReaction({ phase: 'response', emote: 'curious',
    expression: { type: 'orb_expression', requestId: 'wrong', emote: 'curious', source: 'model' } }));
  expect(window.__orbState().actionVersion).toBe(version);
  fireEvent.click(screen.getByRole('button', { name: 'Stop response' }));
  await complete(current);
  expect(window.__orbState().actionVersion).toBe(version);
});
test('a new turn interrupts the running expression and reset removes its observation', async () => {
  render(<OrbSection />); send(); await tick(); await complete();
  send('Another question'); await tick();
  expect(latest().request.orbContext.lastExpression).toMatchObject({ status: 'interrupted', reason: 'replaced' });
  act(() => window.__orbReset());
  send('After reset'); await tick();
  expect(latest().request.orbContext.lastExpression).toBeNull();
});
test('preferences survive saved conversation parsing while transient receipts never do', async () => {
  const saveToolState = jest.fn();
  const { unmount } = render(<AppNavigationContext.Provider value={{ getToolState: () => null, saveToolState }}><OrbSection /></AppNavigationContext.Provider>);
  send(); await tick(); await complete();
  openOptions(); fireEvent.click(screen.getByRole('checkbox', { name: 'Allow model-chosen expressions' }));
  unmount();
  const conversation = saveToolState.mock.calls[0][1];
  expect(conversation.allowModelExpressions).toBe(false);
  expect(conversation.lastExpression).toBeUndefined(); expect(conversation.expressionReceipt).toBeUndefined();
  const snapshot = createMetabloomThreadSnapshot({ conversation,
    visuals: { version: 1, records: [], lastInteractedId: null }, workspace: null });
  expect(snapshot).not.toBeNull(); expect(parseMetabloomThreadSnapshot(snapshot).conversation.allowModelExpressions).toBe(false);
  render(<AppNavigationContext.Provider value={{ getToolState: () => conversation }}><OrbSection /></AppNavigationContext.Provider>);
  send(); await tick();
  expect(latest().request.orbContext).toMatchObject({ enabled: false, lastExpression: null });
});
test('automatic reactions remain available without claiming a model choice', async () => {
  render(<OrbSection />); openOptions(); fireEvent.click(screen.getByRole('checkbox', { name: 'Allow model-chosen expressions' }));
  send(); await tick(); await complete(latest(), 'warm', 'automatic');
  expect(window.__orbState().emote).toBe('warm');
  send(); await tick();
  expect(latest().request.orbContext.lastExpression.source).toBe('automatic');
});
