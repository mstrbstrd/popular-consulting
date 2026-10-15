import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SiteRouter from '../SiteRouter';
import ApplicationShell from './ApplicationShell';
import { ThemeCtx } from '../contexts/ThemeContext';

let mockReady;
jest.mock('./NavMenu', () => () => <nav aria-label="Test navigation" />);
jest.mock('./BlackHoleBackground', () => () => null);
jest.mock('./ImmersiveBackground', () => () => <div data-testid="startup-background" />);
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, logoutRevision: 0 }) }));
jest.mock('../utils/privateInvoiceLoader', () => ({ syncPrivateInvoiceSession: jest.fn() }));
jest.mock('./CreatorOSFieldCanvas', () => function MockField({ onReady }) {
  // Deliberately never report a GPU frame. The public interface must still open.
  mockReady = onReady;
  return <canvas data-testid="startup-field" />;
});
afterEach(() => {
  cleanup();
  mockReady = undefined;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

test('direct Orb startup reveals public controls without waiting for a GPU callback', async () => {
  const onReady = jest.fn();
  render(<SiteRouter pathname="/orb" onReady={onReady} />);
  const field = await screen.findByTestId('startup-field');
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  expect(mockReady).toBeUndefined();
  expect(screen.getByPlaceholderText('Message Metabloom')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use Nova fire for Metabloom' }));
  expect(screen.getByTestId('startup-field')).toBe(field);
  expect(onReady).toHaveBeenCalledTimes(1);
});

test.each([false, true])('the shell releases the Orb foreground even when its renderer never becomes ready (dark=%s)', async isDark => {
  window.history.replaceState({}, '', '/orb');
  const { container } = render(
    <ThemeCtx.Provider value={{ isDark, toggleTheme: () => {} }}>
      <ApplicationShell />
    </ThemeCtx.Provider>,
  );
  await screen.findByTestId('startup-field');
  await waitFor(() => expect(container.querySelector('.app-outlet')).toHaveAttribute('data-phase', 'idle'));
  expect(container.querySelector('.app-outlet')).not.toHaveAttribute('inert');
  expect(mockReady).toBeUndefined();
  const composer = screen.getByPlaceholderText('Message Metabloom');
  fireEvent.change(composer, { target: { value: 'The interface is available.' } });
  expect(composer).toHaveValue('The interface is available.');
  fireEvent.click(screen.getByRole('button', { name: 'Animated background', exact: true }));
  expect(screen.queryByTestId('startup-background')).not.toBeInTheDocument();
  expect(screen.getByTestId('startup-field')).toBeInTheDocument();
  expect(composer).toHaveValue('The interface is available.');
});
