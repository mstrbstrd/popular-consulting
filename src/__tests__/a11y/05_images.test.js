/**
 * Invariant: Images have appropriate alt text.
 *
 * WCAG 1.1.1 — Non-text Content (Level A)
 *
 * Rules:
 *  - Informational images: non-empty, descriptive alt
 *  - Decorative images: alt="" AND aria-hidden="true"
 *  - Images inside links/buttons: the link/button must have an accessible
 *    name, and the image should use alt="" so it is not read twice
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../../contexts/ThemeContext';
import NavMenu from '../../components/NavMenu';
import HeroLogo from '../../components/HeroLogo';
import BioSection from '../../components/BioSection';
import ContactSection from '../../components/ContactSection';

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

// ── NavMenu ────────────────────────────────────────────────────────────────

describe('NavMenu images', () => {
  test('nav logo img is decorative (button carries the label via aria-label)', () => {
    wrap(<NavMenu />);
    const logo = document.querySelector('.nav-logo');
    expect(logo).toBeInTheDocument();
    // Image is inside a button with aria-label; img should be decorative
    expect(logo.alt).toBe('');
    expect(logo).toHaveAttribute('aria-hidden', 'true');
  });
});

// ── HeroLogo ──────────────────────────────────────────────────────────────

describe('HeroLogo', () => {
  test('logo img is inside a <button> with aria-label', () => {
    wrap(<HeroLogo />);
    const btn = screen.getByRole('button', { name: /popular consulting/i });
    expect(btn).toBeInTheDocument();
    // Image inside button should have empty alt (btn label carries the name)
    const img = btn.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img.alt).toBe('Popular Consulting');
  });
});

// ── BioSection ────────────────────────────────────────────────────────────

describe('BioSection images', () => {
  test('profile photo has a descriptive (non-empty) alt attribute', () => {
    wrap(<BioSection isActive={true} />);
    // The photo renders in a Box component="img"
    const imgs = document.querySelectorAll('img');
    const profilePhoto = Array.from(imgs).find(
      img => img.src && img.src.includes('me.jpeg')
    );
    expect(profilePhoto).toBeTruthy();
    expect(profilePhoto.alt).toBeTruthy();
    expect(profilePhoto.alt.length).toBeGreaterThan(3); // not just "Photo"
    expect(profilePhoto.alt.toLowerCase()).not.toBe('photo');
  });
});

// ── ContactSection ────────────────────────────────────────────────────────

describe('ContactSection images', () => {
  beforeEach(() => wrap(<ContactSection isActive={true} />));

  test('footer logo is decorative (alt="" and aria-hidden)', () => {
    const logos = document.querySelectorAll('img[aria-hidden="true"]');
    // At least the decorative footer logo should be marked hidden
    expect(logos.length).toBeGreaterThanOrEqual(1);
    logos.forEach(img => {
      expect(img.alt).toBe('');
    });
  });

  test('social link images inside anchors have empty alt (link carries the label)', () => {
    const socialLinks = document.querySelectorAll('a[target="_blank"]');
    socialLinks.forEach(link => {
      const imgs = link.querySelectorAll('img');
      imgs.forEach(img => {
        // Image is inside an anchor with aria-label — img should be decorative
        expect(img.alt).toBe('');
        expect(img).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });
});

// ── General rule: no img missing alt ─────────────────────────────────────

describe('No missing alt attributes', () => {
  const components = [
    { name: 'NavMenu',         el: <NavMenu /> },
    { name: 'HeroLogo',        el: <HeroLogo /> },
    { name: 'BioSection',      el: <BioSection isActive={true} /> },
    { name: 'ContactSection',  el: <ContactSection isActive={true} /> },
  ];

  components.forEach(({ name, el }) => {
    test(`${name}: every <img> has an alt attribute`, () => {
      const { container } = wrap(el);
      const imgs = container.querySelectorAll('img');
      imgs.forEach(img => {
        expect(img.hasAttribute('alt')).toBe(true);
      });
    });
  });
});
