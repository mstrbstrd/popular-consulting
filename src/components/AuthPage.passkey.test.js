import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthPage from './AuthPage';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../contexts/ThemeContext', () => ({ ThemeProvider: ({ children }) => children }));
jest.mock('./NavMenu', () => () => null);

beforeEach(() => {
  window.history.replaceState({}, '', '/login');
  useAuth.mockReturnValue({ status: 'anonymous', logout: jest.fn(), refresh: jest.fn() });
});
afterEach(() => { window.history.replaceState({}, '', '/'); });

test('normal login directs the owner to passkeys, not paid MFA or public registration', () => {
  render(<AuthPage />);
  expect(screen.getByText(/Use your passkey in Auth0/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continue to secure sign-in/ })).toBeEnabled();
  expect(screen.queryByRole('link', { name: /invoice generator/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/multi-factor/i)).not.toBeInTheDocument();
});
test('enrollment/password callback explains the next passkey login without granting access', () => {
  window.history.replaceState({}, '', '/login?error=passkey_required');
  render(<AuthPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Passkey verification incomplete.');
  expect(screen.getByRole('alert')).toHaveTextContent('Your workspace stays locked');
  expect(screen.getByText('Need help signing in?')).toBeVisible();
  expect(screen.getByText(/If you just created your first passkey/)).not.toBeVisible();
  expect(screen.queryByRole('link', { name: /invoice generator/i })).not.toBeInTheDocument();
});
test('a rejected identity remains generic and arbitrary query strings never render as errors', () => {
  window.history.replaceState({}, '', '/login?error=denied');
  const { unmount } = render(<AuthPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('approved administrator account');
  unmount();
  window.history.replaceState({}, '', '/login?error=%3Cimg%20onerror%3Dalert(1)%3E&passkey=true');
  render(<AuthPage />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /invoice generator/i })).not.toBeInTheDocument();
});

test('account page uses a normal-flow content shell without changing the shared navigation', () => {
  const { container } = render(<AuthPage />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in.');
  expect(container.querySelector('.auth-content > main.auth-card')).toBeInTheDocument();
});
test('a stale login error does not appear on the logout page', () => {
  window.history.replaceState({}, '', '/logout?error=passkey_required');
  render(<AuthPage logoutPage />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Need help signing in?')).not.toBeInTheDocument();
});
