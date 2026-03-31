/**
 * Invariant: Skip-to-content link is present and navigates to #main-content.
 *
 * WCAG 2.4.1 — Bypass Blocks (Level A)
 *
 * The link must:
 *  - exist as the first focusable element
 *  - href="#main-content"
 *  - have visible text
 *  - target element #main-content must exist in the page
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../../App';

// Mock heavy components that fail in JSDOM
jest.mock('../../components/LoadingOverlay', () => () => null);
jest.mock('../../components/HeroLogo',       () => () => <div data-testid="hero-logo" />);
jest.mock('../../components/OrbSection',     () => () => <section id="orb" />);
jest.mock('../../components/BioSection',     () => () => <section id="bio" />);
jest.mock('../../components/ServicesSection',() => () => <section id="services" />);
jest.mock('../../components/ContactSection', () => () => <section id="contact" />);
jest.mock('../../components/ParallaxBackground', () => ({ children }) => <div>{children}</div>);

describe('Skip-to-content link', () => {
  beforeEach(() => {
    render(<App />);
  });

  test('exists with text "Skip to main content"', () => {
    expect(screen.getByText(/skip to main content/i)).toBeInTheDocument();
  });

  test('href points to #main-content', () => {
    const link = screen.getByText(/skip to main content/i);
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '#main-content');
  });

  test('#main-content target element exists', () => {
    expect(document.getElementById('main-content')).toBeInTheDocument();
  });

  test('skip link is an <a> (keyboard focusable)', () => {
    const link = screen.getByText(/skip to main content/i);
    expect(link.tagName).toBe('A');
  });
});
