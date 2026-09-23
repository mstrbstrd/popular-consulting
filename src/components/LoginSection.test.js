import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthPage from './AuthPage';
import AuthNavControl from './AuthNavControl';
import { useAuth } from '../contexts/AuthContext';
import { LOGIN_PRESET, LOGIN_SECTION_INDEX, LOGIN_BLACK_HOLE_ZOOM, LOGIN_APERTURE_GLSL, isLoginPath } from '../utils/loginScene';
import { VISUAL_RUNTIME_LIGHT_PRESETS } from '../utils/visualRuntimeLightState';
import { VISUAL_RUNTIME_LIGHT_FIELD_SHADER } from '../utils/visualRuntimeLightShaders';

jest.mock('../contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../contexts/ThemeContext', () => ({ ThemeProvider: ({ children }) => <div data-testid="extra-theme">{children}</div> }));
jest.mock('./NavMenu', () => () => <nav data-testid="extra-navigation" />);

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  useAuth.mockReturnValue({ status: 'anonymous', refresh: jest.fn(), logout: jest.fn() });
});

test('embeds login without a duplicate navigation, theme, main landmark, or document style change', () => {
  const before = { html: document.documentElement.style.cssText, body: document.body.style.cssText, title: document.title };
  const { container, unmount } = render(<AuthPage embedded />);
  expect(container.querySelector('section#login')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: 'Sign in.' })).toBeInTheDocument();
  expect(container.querySelector('main')).toBeNull();
  expect(screen.queryByTestId('extra-theme')).not.toBeInTheDocument();
  expect(screen.queryByTestId('extra-navigation')).not.toBeInTheDocument();
  expect(container.querySelector('form')).toHaveAttribute('action', '/api/auth/login');
  expect(container.querySelector('form')).toHaveAttribute('method', 'post');
  expect(screen.queryByRole('link', { name: /Open invoice/ })).not.toBeInTheDocument();
  unmount();
  expect(document.documentElement.style.cssText).toBe(before.html);
  expect(document.body.style.cssText).toBe(before.body);
  expect(document.title).toBe(before.title);
});

test.each(['denied', 'passkey_required'])('keeps callback error %s in the embedded section', error => {
  window.history.replaceState({}, '', `/login?error=${error}`);
  render(<AuthPage embedded />);
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Continue to secure sign-in/ })).toBeInTheDocument();
});

test('session availability and authorization still control private links', () => {
  useAuth.mockReturnValue({ status: 'unavailable', refresh: jest.fn() });
  const { rerender } = render(<AuthPage embedded />);
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Continue to secure/ })).not.toBeInTheDocument();
  useAuth.mockReturnValue({ status: 'authenticated' });
  rerender(<AuthPage embedded />);
  expect(screen.getByRole('link', { name: /Open invoice generator/ })).toHaveAttribute('href', '/invoice-generator');
});

test.each([false, true])('account navigation uses section five without reloading (mobile=%s)', mobile => {
  const navigate = jest.fn(); const close = jest.fn();
  render(<><div className="parallax-wrapper">{Array.from({ length: 5 }, (_, i) => <button key={i} className="section-dot" onClick={() => navigate(i)} aria-label={`Section ${i}`} />)}</div><AuthNavControl mobile={mobile} onNavigate={close} /></>);
  fireEvent.click(screen.getByRole('link', { name: 'Sign in' }));
  expect(navigate).toHaveBeenCalledWith(LOGIN_SECTION_INDEX);
  expect(close).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
});

test('login has a unique shared aperture shader and the next dark camera distance', () => {
  expect(LOGIN_SECTION_INDEX).toBe(4);
  expect(LOGIN_BLACK_HOLE_ZOOM).toBe(82);
  expect(LOGIN_PRESET.shape).toBe(8);
  expect(VISUAL_RUNTIME_LIGHT_PRESETS[LOGIN_SECTION_INDEX]).toBe(LOGIN_PRESET);
  expect(VISUAL_RUNTIME_LIGHT_FIELD_SHADER).toContain(LOGIN_APERTURE_GLSL);
  expect(VISUAL_RUNTIME_LIGHT_FIELD_SHADER).toContain('if(shape==8)return sceneLoginAperture(uv,t);');
  expect(isLoginPath('/login')).toBe(true);
  expect(isLoginPath('/login/index.html')).toBe(true);
  expect(isLoginPath('/logout')).toBe(false);
});
