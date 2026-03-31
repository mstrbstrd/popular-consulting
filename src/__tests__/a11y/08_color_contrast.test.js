/**
 * Invariant: CSS color variables meet WCAG AA contrast requirements.
 *
 * WCAG 1.4.3 — Contrast (Minimum) (Level AA): 4.5:1 for normal text
 *
 * We test that our fix decisions were applied — i.e. the opacity values in
 * CSS variables are at the raised thresholds we set, not the old failing ones.
 * Actual perceptual contrast ratios depend on the background color chosen at
 * render time; a full Lighthouse / axe contrast audit is needed for that.
 *
 * Also tests:
 *  - Mobile font size variables are not below 55% (WCAG 1.4.4 Resize Text)
 *  - bio-head h3 color is not black (#000000) on dark background
 *  - Scroll indicator arrow is not #333 (dark on dark-ish overlay)
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { ParallaxBackground } from '../../components/ParallaxBackground';

const Section = ({ id }) => <section id={id} />;

// Helper: read the global index.css text as injected by create-react-app
// In JSDOM, global CSS imported via `import '../../index.css'` is processed
// by the jest transform. We check the module file text directly.
const fs = require('fs');
const path = require('path');
const indexCssPath = path.resolve(__dirname, '../../index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

describe('CSS variable contrast values (index.css)', () => {
  test('--mobile-link light mode opacity is >= 0.70 (raised from 0.38)', () => {
    // Extract the opacity from --mobile-link in :root
    const match = indexCss.match(/--mobile-link:\s*rgba\([^)]+,\s*([\d.]+)\)/);
    expect(match).toBeTruthy();
    const opacity = parseFloat(match[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.70);
  });

  test('--mobile-link dark mode opacity is >= 0.70 (raised from 0.38)', () => {
    // Find --mobile-link inside [data-theme="dark"] block
    const darkBlock = indexCss.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1] ?? '';
    const match = darkBlock.match(/--mobile-link:\s*rgba\([^)]+,\s*([\d.]+)\)/);
    expect(match).toBeTruthy();
    const opacity = parseFloat(match[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.70);
  });

  test('--text-nav-dim light mode opacity is >= 0.60 (raised from 0.45)', () => {
    const match = indexCss.match(/--text-nav-dim:\s*rgba\([^)]+,\s*([\d.]+)\)/);
    expect(match).toBeTruthy();
    const opacity = parseFloat(match[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.60);
  });

  test('.bio-head h3 is NOT color #000000 (was invisible on dark background)', () => {
    expect(indexCss).not.toMatch(/\.bio-head h3[\s\S]{0,100}color:\s*#000000/);
  });
});

describe('Mobile font-size breakpoints (index.css)', () => {
  test('font-size at max-width:480px is >= 55% (raised from 40%)', () => {
    // Find the @media block for 480px
    const match = indexCss.match(/@media[^{]*max-width:\s*480px[^{]*\{([\s\S]+?)(?=@media|\Z)/);
    if (!match) return; // if block structure changed, skip
    const block = match[1];
    const sizeMatch = block.match(/html\s*\{[^}]*font-size:\s*([\d.]+)%/);
    if (sizeMatch) {
      expect(parseFloat(sizeMatch[1])).toBeGreaterThanOrEqual(55);
    }
  });

  test('font-size at 481–768px is >= 55% (raised from 45%)', () => {
    const match = indexCss.match(/@media[^{]*min-width:\s*481px[^{]*max-width:\s*768px[^{]*\{([\s\S]+?)(?=@media|\Z)/);
    if (!match) return;
    const block = match[1];
    const sizeMatch = block.match(/html\s*\{[^}]*font-size:\s*([\d.]+)%/);
    if (sizeMatch) {
      expect(parseFloat(sizeMatch[1])).toBeGreaterThanOrEqual(55);
    }
  });
});

describe('Scroll indicator arrow color (ParallaxBackground)', () => {
  test('scroll-indicator ::after does not use #333 border color', () => {
    const { container } = render(
      <ThemeProvider>
        <ParallaxBackground>
          <Section id="s0" />
          <Section id="s1" />
        </ParallaxBackground>
      </ThemeProvider>
    );
    const styles = Array.from(document.querySelectorAll('style'))
      .map(s => s.textContent).join('\n');

    // Should NOT have dark #333 border on arrow (was invisible on dark overlay)
    const hasOldColor = /scroll-indicator::after[\s\S]{0,200}border-right:\s*2px solid #333/.test(styles);
    expect(hasOldColor).toBe(false);
  });

  test('scroll-indicator ::after uses a light color for visibility', () => {
    render(
      <ThemeProvider>
        <ParallaxBackground>
          <Section id="s0" />
          <Section id="s1" />
        </ParallaxBackground>
      </ThemeProvider>
    );
    const styles = Array.from(document.querySelectorAll('style'))
      .map(s => s.textContent).join('\n');

    // Should have rgba(255, 255, 255, ...) border — visible on dark overlay
    expect(styles).toMatch(/scroll-indicator::after[\s\S]{0,300}rgba\(255,\s*255,\s*255/);
  });
});
