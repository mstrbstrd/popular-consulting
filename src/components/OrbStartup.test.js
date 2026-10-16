import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SiteRouter from '../SiteRouter';
import { AuthContext } from '../contexts/AuthContext';

let mockReady;
jest.mock('./NavMenu', () => () => null);
jest.mock('./BlackHoleBackground', () => () => null);
jest.mock('./CreatorOSFieldCanvas', () => function MockField({ onReady }) {
  mockReady = onReady;
  return <canvas data-testid="startup-field" />;
});
afterEach(() => { cleanup(); mockReady = undefined; });

test('authenticated Orb reveals its interface before its renderer is ready', async () => {
  const onReady = jest.fn();
  render(<AuthContext.Provider value={{ status: 'authenticated', user: { id: 'a'.repeat(64) } }}>
    <SiteRouter pathname="/orb" onReady={onReady} />
  </AuthContext.Provider>);
  const field = await screen.findByTestId('startup-field');
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  expect(typeof mockReady).toBe('function');
  act(() => mockReady());
  expect(onReady).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: 'Use Nova fire for Metabloom' }));
  expect(screen.getByTestId('startup-field')).toBe(field);
  expect(onReady).toHaveBeenCalledTimes(2);
});
