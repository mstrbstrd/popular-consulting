import React from 'react';
import { webcrypto } from 'crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SiteRouter from '../SiteRouter';
import { AuthContext } from '../contexts/AuthContext';

let mockReady;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
jest.mock('./metabloomThreadApiClient', () => ({
  ...jest.requireActual('./metabloomThreadApiClient'),
  requestMetabloomThread: jest.fn(async () => ({ items: [] })),
}));
jest.mock('./NavMenu', () => () => null);
jest.mock('./BlackHoleBackground', () => () => null);
jest.mock('./CreatorOSFieldCanvas', () => function MockField({ onReady }) {
  mockReady = onReady;
  return <canvas data-testid="startup-field" />;
});
beforeAll(() => Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }));
afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else delete globalThis.crypto;
});
afterEach(() => { cleanup(); mockReady = undefined; });

test('authenticated Orb reveals its interface before its renderer is ready', async () => {
  const onReady = jest.fn();
  await act(async () => {
    render(<AuthContext.Provider value={{ status: 'authenticated', user: { id: 'a'.repeat(64) } }}>
      <SiteRouter pathname="/orb" onReady={onReady} />
    </AuthContext.Provider>);
  });
  const field = await screen.findByTestId('startup-field');
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  expect(typeof mockReady).toBe('function');
  act(() => mockReady());
  expect(onReady).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Theme', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Use Nova fire for Metabloom' }));
  expect(screen.getByTestId('startup-field')).toBe(field);
  expect(onReady).toHaveBeenCalledTimes(2);
});
