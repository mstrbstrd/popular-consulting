import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import OrbChatGate from './OrbChatGate';
let mockStatus = 'anonymous';
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock('./OrbSection', () => () => <div>AI interface</div>);
jest.mock('./GuestOrbSection', () => () => <div>Human interface</div>);
const originalFetch = global.fetch;
afterEach(() => { cleanup(); global.fetch = originalFetch; });
function config(enabled) { global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ enabled }) })); }
test('disabled rollout preserves the existing Orb lab', async () => {
  mockStatus = 'anonymous'; config(false); render(<OrbChatGate />);
  expect(await screen.findByText('AI interface')).toBeInTheDocument();
});
test('confirmed guests get human chat, not the AI interface', async () => {
  mockStatus = 'anonymous'; config(true); render(<OrbChatGate />);
  expect(await screen.findByText('Human interface')).toBeInTheDocument(); expect(screen.queryByText('AI interface')).not.toBeInTheDocument();
});
test('authenticated sessions retain AI without forwarding messages', async () => {
  mockStatus = 'authenticated'; config(true); render(<OrbChatGate />);
  expect(await screen.findByText('AI interface')).toBeInTheDocument(); expect(global.fetch).toHaveBeenCalledTimes(1);
});
test('unavailable authentication never falls back to human forwarding', async () => {
  mockStatus = 'unavailable'; config(true); render(<OrbChatGate />);
  expect(await screen.findByText(/No messages have been forwarded/)).toBeInTheDocument();
  expect(screen.queryByText('Human interface')).not.toBeInTheDocument(); expect(screen.queryByText('AI interface')).not.toBeInTheDocument();
});
test('switching identity unmounts the other conversation', async () => {
  mockStatus = 'anonymous'; config(true); const onChatModeChange = jest.fn();
  const view = render(<OrbChatGate onChatModeChange={onChatModeChange} />);
  await screen.findByText('Human interface'); expect(onChatModeChange).toHaveBeenLastCalledWith('human');
  mockStatus = 'authenticated'; view.rerender(<OrbChatGate onChatModeChange={onChatModeChange} />);
  expect(onChatModeChange).toHaveBeenLastCalledWith('ai');
  expect(screen.getByText('AI interface')).toBeInTheDocument(); expect(screen.queryByText('Human interface')).not.toBeInTheDocument();
});
