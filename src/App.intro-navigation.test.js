import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { IMMERSIVE_MODES } from './immersiveMode';

let mockStatus = 'anonymous';
jest.mock('./contexts/AuthContext', () => ({ useAuth: () => ({ status: mockStatus }) }));
jest.mock('./contexts/ThemeContext', () => ({ ThemeProvider: ({ children }) => children, useThemeMode: () => ({ isDark: false }) }));
jest.mock('./utils/deviceTier', () => ({ hasHardwareWebGL: false, isMobileTier: false }));
jest.mock('./components/ManagedDitherBackground', () => () => null);
jest.mock('./components/ProductionThemeCanvas', () => () => null);
jest.mock('./components/NavMenu', () => () => null);
jest.mock('./components/ProfessionalHero', () => () => null);
jest.mock('./components/DitherHero', () => () => <section>Intro</section>);
jest.mock('./components/BioSection', () => () => <section>About</section>);
jest.mock('./components/ServicesSection', () => () => <section>Services</section>);
jest.mock('./components/ContactSection', () => () => <section>Contact</section>);
jest.mock('./components/AuthPage', () => () => null);
jest.mock('./components/LoadingOverlay', () => () => null);
jest.mock('./components/HeroLogo', () => () => <button onClick={() => global.document.querySelectorAll('.section-dot')[1].click()}>Enter site</button>);

const originalLocation = window.location;
const start = async props => {
  let view;
  await act(async () => { view = render(<App {...props} />); });
  act(() => jest.advanceTimersByTime(50));
  return view;
};

beforeEach(() => {
  jest.useFakeTimers(); mockStatus = 'anonymous';
  delete window.location;
  window.location = { ...originalLocation, pathname: '/', hash: '', replace: jest.fn() };
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); window.location = originalLocation; });

test.each(['click', 'wheel', 'keyboard', 'touch', 'dot'])('verified sessions leave the intro for home through %s', async method => {
  mockStatus = 'authenticated';
  await start();
  if (method === 'click') fireEvent.click(screen.getByRole('button', { name: 'Enter site' }));
  if (method === 'wheel') fireEvent.wheel(window, { deltaY: 80 });
  if (method === 'keyboard') fireEvent.keyDown(window, { key: 'ArrowDown' });
  if (method === 'touch') {
    fireEvent.touchStart(document.body, { touches: [{ clientX: 100, clientY: 500, target: document.body }] });
    fireEvent.touchEnd(document.body, { changedTouches: [{ clientX: 100, clientY: 200 }] });
  }
  if (method === 'dot') fireEvent.click(screen.getByRole('button', { name: 'Navigate to Services' }));
  expect(window.location.replace).toHaveBeenCalledWith('/home');
  expect(document.querySelector('.section-dot.active')).toHaveAttribute('aria-label', 'Navigate to Hero');
});

test('an early entry waits for verification and redirects without revealing business sections', async () => {
  mockStatus = 'loading';
  const view = await start();
  fireEvent.click(screen.getByRole('button', { name: 'Enter site' }));
  expect(window.location.replace).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(500));
  expect(document.querySelector('.section-dot.active')).toHaveAttribute('aria-label', 'Navigate to Hero');
  mockStatus = 'authenticated'; view.rerender(<App />);
  expect(window.location.replace).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Enter site' }));
  expect(window.location.replace).toHaveBeenCalledTimes(1);
});

test.each(['anonymous', 'unavailable'])('pending entry continues normally when verification ends %s', async status => {
  mockStatus = 'loading';
  const view = await start();
  fireEvent.click(screen.getByRole('button', { name: 'Enter site' }));
  mockStatus = status; view.rerender(<App />);
  act(() => jest.advanceTimersByTime(1000));
  expect(window.location.replace).not.toHaveBeenCalled();
  expect(document.querySelector('.section-dot.active')).toHaveAttribute('aria-label', 'Navigate to About');
});

test.each(['engineering', 'login', 'deep-link'])('preserves explicit %s navigation for verified sessions', async destination => {
  mockStatus = 'authenticated';
  if (destination === 'engineering') window.location.pathname = '/engineering';
  if (destination === 'login') window.location.pathname = '/login';
  if (destination === 'deep-link') window.location.hash = '#section-2';
  await start(destination === 'engineering' ? { immersiveMode: IMMERSIVE_MODES.ENGINEERING } : {});
  fireEvent.click(screen.getByRole('button', { name: 'Navigate to About' }));
  act(() => jest.advanceTimersByTime(1000));
  expect(window.location.replace).not.toHaveBeenCalled();
});
