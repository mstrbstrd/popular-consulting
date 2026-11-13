import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import OrbSection from './OrbSection';

jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const tick = async ms => act(async () => { jest.advanceTimersByTime(ms); await Promise.resolve(); });
const send = (message = 'Explain the estimate.') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
};
const downgrade = event => { event.detail.toolset = false; };
let listener = null;
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => {
  if (listener) window.removeEventListener('metabloom:user-message', listener, { capture: true });
  listener = null;
  cleanup(); jest.clearAllTimers(); jest.useRealTimers(); window.__metabloomRequest = null;
});

test('a listener can downgrade an unclaimed turn to the cached-client contract', async () => {
  let request = null;
  window.__metabloomRequest = value => { request = value; return new Promise(() => {}); };
  listener = downgrade;
  window.addEventListener('metabloom:user-message', listener, { capture: true });
  render(<OrbSection />);
  send(); await tick(0);
  expect(request.toolset).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(request, 'orbContext')).toBe(false);
});

test('a downgraded turn claimed by a tool keeps the long tool-turn deadline', async () => {
  window.__metabloomRequest = () => { throw new Error('A claimed turn must not reach the network adapter'); };
  listener = event => {
    event.detail.toolset = false;
    event.preventDefault();
    event.detail.claim();
    event.detail.onToolActivity('start');
  };
  window.addEventListener('metabloom:user-message', listener, { capture: true });
  render(<OrbSection />);
  send(); await tick(0);
  // Past the 30 second ordinary deadline, a tool turn is still waiting.
  await tick(45000);
  expect(window.__orbState().pending).toBe(true);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
