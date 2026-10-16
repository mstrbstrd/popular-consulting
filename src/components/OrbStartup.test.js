import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

test('authenticated Orb startup waits for its own renderer rather than the route module mounting', async () => {
  const onReady = jest.fn();
  render(<AuthContext.Provider value={{ status: 'authenticated', user: { id: 'a'.repeat(64) } }}>
    <SiteRouter pathname="/orb" onReady={onReady} />
  </AuthContext.Provider>);
  const field = await screen.findByTestId('startup-field');
  expect(onReady).not.toHaveBeenCalled();
  expect(typeof mockReady).toBe('function');
  act(() => mockReady());
  expect(onReady).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Use Nova fire for Metabloom' }));
  expect(screen.getByTestId('startup-field')).toBe(field);
  expect(onReady).toHaveBeenCalledTimes(1);
});
