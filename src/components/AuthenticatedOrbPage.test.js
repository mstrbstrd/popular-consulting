import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AuthContext } from '../contexts/AuthContext';
import { navigateInApp } from '../contexts/AppNavigationContext';
import AuthenticatedOrbPage from './AuthenticatedOrbPage';
import WorkspaceMenu from './WorkspaceMenu';

const mockMounted = jest.fn();
const mockCancelled = jest.fn();
jest.mock('./OrbPage', () => {
  const ReactModule = require('react');
  return function MockOrbPage() {
    ReactModule.useEffect(() => { mockMounted(); return () => mockCancelled(); }, []);
    return <div data-testid="paid-orb">Orb chat</div>;
  };
});
jest.mock('../contexts/AppNavigationContext', () => ({
  navigateInApp: jest.fn(), useAppNavigation: () => ({ pathname: '/home' }),
}));
const view = (status, children = <AuthenticatedOrbPage />, refresh = jest.fn()) =>
  <AuthContext.Provider value={{ status, user: status === 'authenticated' ? { id: 'fixture-owner' } : null, refresh }}>
    {children}
  </AuthContext.Provider>;

beforeEach(() => jest.clearAllMocks());

test.each(['loading', 'anonymous', 'unavailable'])('%s cannot mount the paid Orb', status => {
  const ready = jest.fn();
  render(view(status, <AuthenticatedOrbPage onReady={ready} />));
  expect(screen.queryByTestId('paid-orb')).not.toBeInTheDocument();
  expect(mockMounted).not.toHaveBeenCalled();
  expect(ready).toHaveBeenCalled();
  if (status === 'anonymous') expect(navigateInApp).toHaveBeenCalledWith('/login', { replace: true });
  else expect(navigateInApp).not.toHaveBeenCalled();
});

test('verified authentication mounts Orb; losing it unmounts and cancels the chat', async () => {
  const { rerender } = render(view('authenticated'));
  expect(await screen.findByTestId('paid-orb')).toBeInTheDocument();
  expect(mockMounted).toHaveBeenCalledTimes(1);
  rerender(view('anonymous'));
  expect(screen.queryByTestId('paid-orb')).not.toBeInTheDocument();
  expect(mockCancelled).toHaveBeenCalledTimes(1);
  expect(navigateInApp).toHaveBeenCalledWith('/login', { replace: true });
});

test('an unavailable session offers recovery without mounting Orb', () => {
  const refresh = jest.fn();
  render(view('unavailable', <AuthenticatedOrbPage />, refresh));
  fireEvent.click(screen.getByRole('button', { name: 'Retry session check' }));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(mockMounted).not.toHaveBeenCalled();
});

test.each([false, true])('Orb navigation is private in the menu (inline=%s)', inline => {
  const { container, rerender } = render(view('anonymous', <WorkspaceMenu inline={inline} />));
  expect(container.querySelector('a[href="/orb"]')).toBeNull();
  rerender(view('loading', <WorkspaceMenu inline={inline} />));
  expect(container.querySelector('a[href="/orb"]')).toBeNull();
  rerender(view('authenticated', <WorkspaceMenu inline={inline} />));
  expect(container.querySelector('a[href="/orb"]')).toBeInTheDocument();
  rerender(view('unavailable', <WorkspaceMenu inline={inline} />));
  expect(container.querySelector('a[href="/orb"]')).toBeNull();
});
