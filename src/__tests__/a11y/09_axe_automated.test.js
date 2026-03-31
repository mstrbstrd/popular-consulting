/**
 * Automated axe-core accessibility scan.
 *
 * Uses jest-axe to run axe-core against rendered component trees.
 * axe-core catches ~30–40% of WCAG violations automatically, including:
 *  - Missing labels
 *  - Invalid ARIA roles/attributes
 *  - Image alt text
 *  - Form label association
 *  - Landmark structure
 *  - Color contrast (when inline styles are present)
 *
 * Components with WebGL are mocked. axe runs against the DOM structure only.
 */

import '../../testHelpers/a11ySetup';
import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeProvider } from '../../contexts/ThemeContext';
import NavMenu from '../../components/NavMenu';
import BioSection from '../../components/BioSection';
import ServicesSection from '../../components/ServicesSection';
import ContactSection from '../../components/ContactSection';
import OrbSection from '../../components/OrbSection';
import { ParallaxBackground } from '../../components/ParallaxBackground';

expect.extend(toHaveNoViolations);

const wrap = async (ui) => {
  const { container } = render(<ThemeProvider>{ui}</ThemeProvider>);
  return container;
};

const Section = ({ id, label }) => (
  <section id={id} aria-label={label}>
    <h2>{label}</h2>
  </section>
);

// ── Per-component axe scans ─────────────────────────────────────────────

describe('axe: NavMenu', () => {
  test('has no automatically detectable violations', async () => {
    const container = await wrap(<NavMenu />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('axe: BioSection', () => {
  test('has no automatically detectable violations', async () => {
    const container = await wrap(<BioSection isActive={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('axe: ServicesSection', () => {
  test('has no automatically detectable violations', async () => {
    const container = await wrap(<ServicesSection isActive={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('axe: ContactSection', () => {
  test('has no automatically detectable violations', async () => {
    const container = await wrap(<ContactSection isActive={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('axe: OrbSection', () => {
  test('has no automatically detectable violations', async () => {
    const container = await wrap(<OrbSection isActive={true} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe('axe: ParallaxBackground (navigation structure)', () => {
  test('has no automatically detectable violations', async () => {
    const container = await wrap(
      <ParallaxBackground>
        <Section id="hero"     label="Hero" />
        <Section id="about"    label="About" />
        <Section id="services" label="Services" />
        <Section id="contact"  label="Contact" />
        <Section id="orb"      label="Interactive Orb" />
      </ParallaxBackground>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
