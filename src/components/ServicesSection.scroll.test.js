/**
 * ServicesSection — scroll container invariants
 *
 * Invariants under test:
 *  1. scrollTop is 0 immediately when isActive → true
 *  2. overflowY is 'hidden' during the animation lock window after activation
 *  3. overflowY becomes 'auto' after the animation lock (750 ms) expires
 *  4. scrollTop is 0 and overflowY is 'hidden' when isActive → false
 *  5. A lingering touch-scroll that arrives during the lock window cannot
 *     move the container (overflow is hidden, so scrollTop stays 0)
 */

import React from 'react';
import { render, act } from '@testing-library/react';
import ServicesSection from './ServicesSection';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../contexts/ThemeContext', () => ({
  useThemeMode: () => ({ isDark: false }),
}));

// MUI / Emotion work fine in jsdom — no mock needed.
// Canvas / WebGL are not used by ServicesSection directly.

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the inner scrollable div (first child of <section id="services">). */
const getScrollEl = (container) =>
  container.querySelector('#services > div');

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ServicesSection scroll container invariants', () => {
  test('1. scrollTop is 0 immediately when section activates', () => {
    const { container, rerender } = render(<ServicesSection isActive={false} />);
    const el = getScrollEl(container);

    // Simulate a residual scroll from a previous visit
    el.scrollTop = 400;

    act(() => {
      rerender(<ServicesSection isActive={true} />);
    });

    expect(el.scrollTop).toBe(0);
  });

  test('2. overflowY is hidden during the animation lock window', () => {
    const { container, rerender } = render(<ServicesSection isActive={false} />);
    const el = getScrollEl(container);

    act(() => {
      rerender(<ServicesSection isActive={true} />);
      // Still inside the 750 ms lock window
      jest.advanceTimersByTime(400);
    });

    expect(el.style.overflowY).toBe('hidden');
  });

  test('3. overflowY becomes auto after the animation lock expires', () => {
    const { container, rerender } = render(<ServicesSection isActive={false} />);
    const el = getScrollEl(container);

    act(() => {
      rerender(<ServicesSection isActive={true} />);
    });

    // Flush the 750 ms timer in a separate act so React processes the callback
    act(() => {
      jest.advanceTimersByTime(800);
    });

    expect(el.style.overflowY).toBe('auto');
    expect(el.scrollTop).toBe(0);
  });

  test('4. scrollTop is 0 and overflow is hidden when section deactivates', () => {
    const { container, rerender } = render(<ServicesSection isActive={true} />);
    const el = getScrollEl(container);

    act(() => {
      jest.advanceTimersByTime(800); // let it become scrollable
    });

    // User scrolled down while on the section
    el.scrollTop = 600;

    act(() => {
      rerender(<ServicesSection isActive={false} />);
    });

    expect(el.scrollTop).toBe(0);
    expect(el.style.overflowY).toBe('hidden');
  });

  test('5. momentum scroll during lock window is blocked by hidden overflow', () => {
    const { container, rerender } = render(<ServicesSection isActive={false} />);
    const el = getScrollEl(container);

    act(() => {
      rerender(<ServicesSection isActive={true} />);
    });

    act(() => {
      jest.advanceTimersByTime(200); // still inside lock window
    });

    // The guard must be in place — real browsers won't scroll a hidden-overflow element
    expect(el.style.overflowY).toBe('hidden');

    // If jsdom does allow scrollTop to be set (it does, unlike real browsers),
    // a subsequent deactivation must still reset it to 0
    el.scrollTop = 200;

    act(() => {
      rerender(<ServicesSection isActive={false} />);
    });

    expect(el.scrollTop).toBe(0);
    expect(el.style.overflowY).toBe('hidden');
  });
});
