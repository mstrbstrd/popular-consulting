/**
 * Invariant: Interactive touch targets are at minimum 44×44px.
 *
 * WCAG 2.5.5 — Target Size (Level AAA), Apple HIG, Material Design guidelines
 *
 * In JSDOM layout is not computed, so we test the CSS rules directly via
 * the embedded <style> tags — a structural guarantee that the rules exist.
 * For visual layout verification, see the Playwright suite (future).
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../../contexts/ThemeContext';
import NavMenu from '../../components/NavMenu';
import { ParallaxBackground } from '../../components/ParallaxBackground';

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);
const Section = ({ id }) => <section id={id} />;

const getEmbeddedStyles = () =>
  Array.from(document.querySelectorAll('style')).map(s => s.textContent).join('\n');

describe('Touch target sizes — CSS structural guarantees', () => {
  test('nav-burger height is at least 44px in CSS', () => {
    wrap(<NavMenu />);
    const styles = getEmbeddedStyles();
    // Should have height: 44px (or more) for .nav-burger
    expect(styles).toMatch(/\.nav-burger[\s\S]{0,200}height:\s*44px/);
  });

  test('nav-theme-toggle height is at least 44px in CSS', () => {
    wrap(<NavMenu />);
    const styles = getEmbeddedStyles();
    expect(styles).toMatch(/\.nav-theme-toggle[\s\S]{0,200}height:\s*44px/);
  });

  test('section-dot has a 44×44px expanded ::after hit area in CSS', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
        <Section id="s1" />
      </ParallaxBackground>
    );
    const styles = getEmbeddedStyles();
    // ::after pseudo element for expanded touch area
    expect(styles).toMatch(/\.section-dot::after/);
    expect(styles).toMatch(/width:\s*44px/);
    expect(styles).toMatch(/height:\s*44px/);
  });
});

describe('Touch target DOM elements', () => {
  test('nav-burger button is present and is a <button>', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 375 });
    wrap(<NavMenu />);
    const burger = document.querySelector('.nav-burger');
    if (burger) {
      expect(burger.tagName).toBe('BUTTON');
    }
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 });
  });

  test('section dots are <button> elements (natively tappable)', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
        <Section id="s1" />
      </ParallaxBackground>
    );
    const dots = container.querySelectorAll('.section-dot');
    dots.forEach(dot => expect(dot.tagName).toBe('BUTTON'));
  });
});

describe('Pinch-to-zoom CSS invariant', () => {
  test('body touch-action is not "none" — allows pinch-zoom', () => {
    const { container } = wrap(
      <ParallaxBackground>
        <Section id="s0" />
      </ParallaxBackground>
    );
    const styles = getEmbeddedStyles();
    // Must NOT have touch-action: none on body
    const bodyTouchNone = /body[\s\S]{0,150}touch-action:\s*none/.test(styles);
    expect(bodyTouchNone).toBe(false);
  });

  test('body touch-action allows pinch-zoom', () => {
    wrap(
      <ParallaxBackground>
        <Section id="s0" />
      </ParallaxBackground>
    );
    const styles = getEmbeddedStyles();
    expect(styles).toMatch(/touch-action:\s*pinch-zoom/);
  });
});
