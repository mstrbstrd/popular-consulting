import React from 'react';
import { cleanup, render } from '@testing-library/react';
import BlackHoleBackground, { BLACK_HOLE_SECTION_ZOOMS } from './BlackHoleBackground';
import { BlackHolePipeline } from './blackHolePipeline';

let mockReadFrame;
const originalMatchMedia = window.matchMedia;
let reduced = false;
jest.mock('../utils/deviceTier', () => ({ hasHardwareWebGL: true, isMobileTier: false }));
jest.mock('../utils/graphicsPolicy', () => ({ recordGraphicsEvent: jest.fn() }));
jest.mock('./blackHolePipeline', () => ({ BlackHolePipeline: jest.fn() }));
beforeEach(() => {
  reduced = false; mockReadFrame = undefined; BlackHolePipeline.mockClear();
  BlackHolePipeline.mockImplementation(({ getFrameInput }) => {
    mockReadFrame = getFrameInput;
    return { initialize: () => true, schedule: { id: 'test' }, tick: () => false, destroy() {}, requestResize() {} };
  });
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  window.matchMedia = jest.fn().mockImplementation(() => ({ get matches() { return reduced; }, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); window.matchMedia = originalMatchMedia; });
const scene = exiting => <><div className="fixed-background" /><BlackHoleBackground isDark activeSection={1} pathname="/home" exiting={exiting} /></>;

test('pulls the existing camera back during exit and resumes section tracking on cancellation', () => {
  const { rerender } = render(scene(false));
  const before = mockReadFrame(100, false).zoom;
  rerender(scene(true));
  const start = mockReadFrame(200, false).zoom;
  const middle = mockReadFrame(525, false).zoom;
  const end = mockReadFrame(850, false).zoom;
  expect(start).toBe(before);
  expect(middle).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(middle);
  expect(mockReadFrame(5000, true).zoom).toBe(end);
  rerender(scene(false));
  expect(mockReadFrame(5100, false).zoom).toBeLessThan(end);
  expect(BlackHolePipeline).toHaveBeenCalledTimes(1);
});

test('keeps the settled section camera when reduced motion is enabled', () => {
  reduced = true;
  render(scene(true));
  expect(mockReadFrame(200, false).zoom).toBe(BLACK_HOLE_SECTION_ZOOMS[1]);
  expect(mockReadFrame(850, false).zoom).toBe(BLACK_HOLE_SECTION_ZOOMS[1]);
});
