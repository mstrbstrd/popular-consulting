import React from 'react';
import { randomFillSync } from 'crypto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GuestOrbSection from './GuestOrbSection';
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));
jest.mock('./MetabloomAvatar', () => () => <div data-testid="avatar" />);
const originalFetch = global.fetch;
const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
const session = { csrfToken: 'a'.repeat(64), expiresAt: Date.now() + 600000 };
const reply = value => ({ ok: true, status: 200, text: async () => JSON.stringify(value) });
beforeEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  // JSDOM does not provide the browser's Web Crypto API. Keep production randomness unchanged.
  Object.defineProperty(window, 'crypto', { configurable: true, value: { getRandomValues: randomFillSync } });
});
afterEach(() => {
  cleanup(); global.fetch = originalFetch;
  if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
  else delete window.crypto;
});
test('requires forwarding consent and renders human replies as escaped plain text', async () => {
  const messages = [];
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/session')) return reply({ session, messages });
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      messages.push({ id: body.clientMessageId, role: 'user', content: body.content, sequence: 1, createdAt: 1, delivery: 'delivered' });
      messages.push({ id: 'reply', role: 'assistant', content: '<script>not executable</script>', sequence: 2, createdAt: 2, delivery: 'received' });
    }
    return reply({ session: messages.length ? session : null, messages });
  });
  render(<GuestOrbSection />);
  const input = screen.getByRole('textbox', { name: 'Message Shaedan' });
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: 'Hello' } });
  const send = screen.getByRole('button', { name: 'Send message' }); expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(send);
  expect(await screen.findByText('<script>not executable</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull(); expect(screen.getByLabelText('Shaedan message')).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => url === '/api/metabloom')).toBe(false);
  expect(input).toHaveValue('');
});
test('network retries reuse the same clientMessageId', async () => {
  const writes = [];
  global.fetch = jest.fn(async (url, options) => {
    if (url.endsWith('/messages') && options.method === 'POST') {
      writes.push(JSON.parse(options.body));
      if (writes.length === 1) throw new Error('Connection dropped after saving');
      return reply({ session, messages: [{ id: writes[0].clientMessageId, content: 'Only once', role: 'user', sequence: 1, createdAt: 1, delivery: 'submitted' }] });
    }
    return reply({ session, messages: [] });
  });
  render(<GuestOrbSection />); const input = screen.getByRole('textbox');
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: 'Only once' } }); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
  expect(writes[1].clientMessageId).toBe(writes[0].clientMessageId);
});
test('restores messages without requesting consent to send or creating another session', async () => {
  global.fetch = jest.fn(async () => reply({ session, messages: [{ id: 'reply', role: 'assistant', content: 'Still here after refresh', sequence: 1, createdAt: 1, delivery: 'received' }] }));
  const callback = jest.fn(); render(<GuestOrbSection onConversationStateChange={callback} />);
  expect(await screen.findByText('Still here after refresh')).toBeInTheDocument();
  expect(callback).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('checkbox')).not.toBeChecked(); expect(global.fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
});
