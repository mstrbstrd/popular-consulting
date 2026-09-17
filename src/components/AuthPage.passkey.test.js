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
  expect(screen.getByRole('alert')).toHaveTextContent('If you just created your first passkey, sign in again using it.');
  expect(screen.getByRole('alert')).toHaveTextContent('Password-only sign-in does not unlock');
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
