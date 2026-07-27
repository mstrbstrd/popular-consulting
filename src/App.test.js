/**
 * Basic smoke test — verifies the app mounts without crashing.
 * Full accessibility tests live in src/__tests__/a11y/
 */

import { render } from '@testing-library/react';
import App from './App';

// Mock all heavy/WebGL components so the smoke test can run in JSDOM
jest.mock('./components/DitherBackground',   () => () => null);
jest.mock('./components/DitherHero',         () => () => <div data-testid="dither-hero" />);
jest.mock('./components/LoadingOverlay',     () => () => null);
jest.mock('./components/HeroLogo',           () => () => <div data-testid="hero-logo" />);
jest.mock('./components/OrbSection',         () => () => <section id="orb" />);
jest.mock('./components/BioSection',         () => () => <section id="bio" />);
jest.mock('./components/ServicesSection',    () => () => <section id="services" />);
jest.mock('./components/ContactSection',     () => () => <section id="contact" />);
jest.mock('./components/ParallaxBackground', () => ({ children }) => <div>{children}</div>);

jest.mock('./assets/icons/popcon_png.png', () => 'popcon_png.png');
jest.mock('./assets/icons/logo2026.png', () => 'logo2026.png');
jest.mock('./assets/icons/logo2026_128.png', () => 'logo2026_128.png');
jest.mock('./assets/icons/popcon_svg.svg', () => 'popcon_svg.svg');
jest.mock('./assets/icons/twitter.svg',    () => 'twitter.svg');
jest.mock('./assets/icons/instagram.svg',  () => 'instagram.svg');

test('app mounts without crashing', () => {
  expect(() => render(<App />)).not.toThrow();
});

test('skip-to-content link is rendered', () => {
  const { getByText } = render(<App />);
  expect(getByText(/skip to main content/i)).toBeInTheDocument();
});
