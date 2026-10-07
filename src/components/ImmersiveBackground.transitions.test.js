import React from 'react';
import { cleanup, render } from '@testing-library/react';
import ImmersiveBackground from './ImmersiveBackground';
import { ThemeCtx } from '../contexts/ThemeContext';

jest.mock('../utils/deviceTier', () => ({ hasHardwareWebGL: true, isMobileTier: false }));
jest.mock('../utils/graphicsPolicy', () => ({ shouldAttemptWebGL: true }));
jest.mock('./ManagedDitherBackground', () => () => <canvas />);
jest.mock('./ProductionThemeCanvas', () => () => <canvas />);
jest.mock('./BlackHoleBackground', () => ({ exiting }) => <canvas data-testid="dark-field" data-exiting={String(exiting)} />);
const originalMatchMedia = window.matchMedia;
let reduced;
beforeEach(() => {
  reduced = false;
  window.__ditherRevealIn = jest.fn();
  window.__ditherRevealOut = jest.fn();
  window.matchMedia = jest.fn().mockImplementation(query => ({
    get matches() { return query.includes('reduced-motion') && reduced; },
    addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { cleanup(); delete window.__ditherRevealIn; delete window.__ditherRevealOut; jest.restoreAllMocks(); window.matchMedia = originalMatchMedia; });

test('reverses the existing light scene and resumes it on the route handoff', () => {
  const { rerender } = render(<ImmersiveBackground transitionPhase="idle" />);
  expect(window.__ditherRevealIn).not.toHaveBeenCalled();
  rerender(<ImmersiveBackground transitionPhase="covering" />);
  expect(window.__ditherRevealOut).toHaveBeenCalledWith(null, { durationMs: 650, fromCurrent: true, hold: true });
  rerender(<ImmersiveBackground transitionPhase="loading" />);
  expect(window.__ditherRevealIn).toHaveBeenCalledWith({ durationMs: 650, fromCurrent: true });
});

test('gives a newly mounted tool handoff a fully visible field to reverse', () => {
  render(<ImmersiveBackground transitionPhase="covering" />);
  expect(window.__ditherRevealOut).toHaveBeenCalledWith(null, { durationMs: 650, fromCurrent: false, hold: true });
});

test('restores a cancelled exit even when reduced motion is enabled mid-flight', () => {
  const { rerender } = render(<ImmersiveBackground transitionPhase="idle" />);
  rerender(<ImmersiveBackground transitionPhase="covering" />);
  reduced = true;
  rerender(<ImmersiveBackground transitionPhase="idle" />);
  expect(window.__ditherRevealIn).toHaveBeenCalledWith({ durationMs: 1, fromCurrent: true });
});

test('skips light exit choreography for reduced motion', () => {
  reduced = true;
  render(<ImmersiveBackground transitionPhase="covering" />);
  expect(window.__ditherRevealOut).not.toHaveBeenCalled();
});

test('routes dark exits to the camera instead of the light reveal hooks', () => {
  const { getByTestId } = render(<ThemeCtx.Provider value={{ isDark: true }}><ImmersiveBackground transitionPhase="covering" /></ThemeCtx.Provider>);
  expect(getByTestId('dark-field')).toHaveAttribute('data-exiting', 'true');
  expect(window.__ditherRevealOut).not.toHaveBeenCalled();
});
