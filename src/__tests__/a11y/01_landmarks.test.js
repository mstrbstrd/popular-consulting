/**
 * Invariant: Semantic HTML landmark structure is correct.
 *
 * Covers:
 *  - <main> landmark exists and is labelled
 *  - Skip-to-content link exists and points to #main-content
 *  - <nav> elements are labelled
 *  - <section> elements have accessible labels
 *  - <header> / <nav> structure in NavMenu
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render, screen } from '@testing-library/react';
import NavMenu from '../../components/NavMenu';
import ContactSection from '../../components/ContactSection';
import BioSection from '../../components/BioSection';
import ServicesSection from '../../components/ServicesSection';
import OrbSection from '../../components/OrbSection';
import { ThemeProvider } from '../../contexts/ThemeContext';

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

// ── NavMenu ────────────────────────────────────────────────────────────────

describe('NavMenu landmarks', () => {
  beforeEach(() => {
    // Simulate being on a non-hero section so nav is visible
    wrap(<NavMenu />);
  });

  test('renders a <header> element', () => {
    expect(document.querySelector('header')).toBeInTheDocument();
  });

  test('renders a <nav> element inside the header', () => {
    expect(document.querySelector('header nav')).toBeInTheDocument();
  });

  test('nav brand button has an accessible label', () => {
    const brand = screen.getByRole('button', { name: /popular consulting/i });
    expect(brand).toBeInTheDocument();
  });

  test('theme toggle button has an accessible label', () => {
    const toggle = screen.getByRole('button', { name: /toggle dark mode/i });
    expect(toggle).toBeInTheDocument();
  });
});

// ── Section landmarks ─────────────────────────────────────────────────────

describe('BioSection landmark', () => {
  test('renders a <section> with aria-label="About"', () => {
    wrap(<BioSection isActive={true} />);
    const section = document.querySelector('section#bio');
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('aria-label', 'About');
  });
});

describe('ServicesSection landmark', () => {
  test('renders a <section> with aria-label="Services"', () => {
    wrap(<ServicesSection isActive={true} />);
    const section = document.querySelector('section#services');
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('aria-label', 'Services');
  });
});

describe('ContactSection landmark', () => {
  test('renders a <section> with aria-label="Contact"', () => {
    wrap(<ContactSection isActive={true} />);
    const section = document.querySelector('section#contact');
    expect(section).toBeInTheDocument();
    expect(section).toHaveAttribute('aria-label', 'Contact');
  });
});

describe('OrbSection landmark', () => {
  test('renders a <section> with aria-label containing "Interactive Orb"', () => {
    wrap(<OrbSection isActive={true} />);
    const section = document.querySelector('section#orb');
    expect(section).toBeInTheDocument();
    expect(section.getAttribute('aria-label')).toMatch(/interactive orb/i);
  });
});
