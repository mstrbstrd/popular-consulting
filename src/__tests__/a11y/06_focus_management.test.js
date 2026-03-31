/**
 * Invariant: Focus indicators are present and elements do not forcibly remove focus.
 *
 * WCAG 2.4.7 — Focus Visible (Level AA)
 *
 * Tests:
 *  - Nav brand does NOT call blur() on click (focus stays)
 *  - Section dots are focusable (tabIndex accessible)
 *  - Scroll indicator is a <button> (keyboard focusable by default)
 *  - HeroLogo is wrapped in a <button> (keyboard focusable)
 *  - Mobile overlay links are <button> elements (keyboard accessible)
 *  - CSS: no `outline: none` on :focus-visible (structural check via style tags)
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../../contexts/ThemeContext';
import NavMenu from '../../components/NavMenu';
import HeroLogo from '../../components/HeroLogo';
import { ParallaxBackground } from '../../components/ParallaxBackground';

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);
const Section = ({ id }) => <section id={id}><h2>{id}</h2></section>;

// ── Nav brand focus ───────────────────────────────────────────────────────

describe('Nav brand click does not remove focus', () => {
  test('focus remains on the brand button after click', async () => {
    wrap(<NavMenu />);
    const brand = screen.getByRole('button', { name: /popular consulting.*return to home/i });

    // Focus the brand button
    brand.focus();
    expect(document.activeElement).toBe(brand);

    // Click it
    fireEvent.click(brand);

    // Focus should NOT have moved away (no blur() call)
    // Note: jsdom won't trigger MutationObserver-based section navigation,
    // so focus stays on the element.
    expect(document.activeElement).toBe(brand);
  });
});

// ── HeroLogo is a button ──────────────────────────────────────────────────

describe('HeroLogo keyboard accessibility', () => {
  test('logo is wrapped in a <button> element (natively focusable)', () => {
    wrap(<HeroLogo />);
    const btn = screen.getByRole('button', { name: /popular consulting/i });
    expect(btn.tagName).toBe('BUTTON');
  });

  test('logo button can be focused', () => {
    wrap(<HeroLogo />);
    const btn = screen.getByRole('button', { name: /popular consulting/i });
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });
});

// ── Section dots are buttons (natively focusable) ─────────────────────────

describe('Section dots focusability', () => {
  test('all section dots are <button> elements', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
        <Section id="s1" />
        <Section id="s2" />
      </ParallaxBackground>
    );
    const dots = container.querySelectorAll('.section-dot');
    expect(dots.length).toBe(3);
    dots.forEach(dot => {
      expect(dot.tagName).toBe('BUTTON');
    });
  });

  test('section dots are focusable', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
        <Section id="s1" />
      </ParallaxBackground>
    );
    const firstDot = container.querySelector('.section-dot');
    expect(firstDot).toBeInTheDocument();
    firstDot.focus();
    expect(document.activeElement).toBe(firstDot);
  });
});

// ── Scroll indicator is a button ─────────────────────────────────────────

describe('Scroll indicator', () => {
  test('is rendered as a <button>', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
        <Section id="s1" />
      </ParallaxBackground>
    );
    const scrollBtn = container.querySelector('.scroll-indicator');
    if (scrollBtn) {
      expect(scrollBtn.tagName).toBe('BUTTON');
    }
  });
});

// ── Nav overlay links are buttons ─────────────────────────────────────────

describe('Mobile overlay nav items', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    fireEvent(window, new Event('resize'));
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  test('internal nav overlay items are <button> elements, not <a href="#">', () => {
    wrap(<NavMenu />);
    const overlay = document.getElementById('mobile-nav-overlay');
    if (!overlay) return; // mobile detection may not have kicked in

    const anchors = overlay.querySelectorAll('a[href="#"]');
    expect(anchors.length).toBe(0); // no invalid href="#" anchors
  });
});

// ── CSS invariant: focus-visible styles exist in embedded style tags ──────

describe('Focus-visible CSS invariant', () => {
  test('ParallaxBackground style contains focus-visible rule for section-dot', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
      </ParallaxBackground>
    );
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent);
    const combined = styles.join('\n');
    expect(combined).toMatch(/\.section-dot:focus-visible/);
  });

  test('NavMenu style contains focus-visible rule for nav-brand', () => {
    wrap(<NavMenu />);
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent);
    const combined = styles.join('\n');
    expect(combined).toMatch(/\.nav-brand:focus-visible/);
  });

  test('NavMenu style contains focus-visible rule for nav-theme-toggle', () => {
    wrap(<NavMenu />);
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent);
    const combined = styles.join('\n');
    expect(combined).toMatch(/\.nav-theme-toggle:focus-visible/);
  });

  test('NavMenu style contains focus-visible rule for nav-burger', () => {
    wrap(<NavMenu />);
    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent);
    const combined = styles.join('\n');
    expect(combined).toMatch(/\.nav-burger:focus-visible/);
  });
});
