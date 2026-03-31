/**
 * Shared mock setup for accessibility test suite.
 *
 * WebGL/canvas-heavy components cannot run in JSDOM, so we stub them with
 * lightweight semantic placeholders that still expose the HTML structure we
 * want to test against.
 */

import React from 'react';

// ── WebGL / canvas mocks ────────────────────────────────────────────────────

jest.mock('../components/DitherBackground', () => () => (
  <div data-testid="dither-background" aria-hidden="true" />
));

jest.mock('../components/DitherHero', () => () => (
  <div data-testid="dither-hero" aria-label="Hero" />
));

// ── Asset mocks (SVG / PNG / JPEG) ─────────────────────────────────────────

jest.mock('../assets/icons/popcon_png.png',  () => 'popcon_png.png');
jest.mock('../assets/icons/popcon_svg.svg',  () => 'popcon_svg.svg');
jest.mock('../assets/icons/twitter.svg',     () => 'twitter.svg');
jest.mock('../assets/icons/instagram.svg',   () => 'instagram.svg');
jest.mock('../assets/icons/webdev.svg',      () => 'webdev.svg');
jest.mock('../assets/icons/seo.svg',         () => 'seo.svg');
jest.mock('../assets/icons/copywrite.svg',   () => 'copywrite.svg');
jest.mock('../assets/icons/ecommerce.svg',   () => 'ecommerce.svg');
jest.mock('../assets/img/me.jpeg',           () => 'me.jpeg');

// ── Portal target ───────────────────────────────────────────────────────────
// createPortal targets document.body by default; jsdom has it.

// ── Window globals expected by OrbSection / DitherBackground ───────────────
beforeEach(() => {
  window.__orbPop         = jest.fn();
  window.__orbExpress     = jest.fn();
  window.__orbPlaySequence = jest.fn();
  window.__orbStop        = jest.fn();
  window.__orbTalk        = jest.fn();
  window.__orbStopTalk    = jest.fn();
  window.__ditherSetOrb   = jest.fn();
  window.__ditherSetCD    = jest.fn();
  window.__triggerLoading = jest.fn();
});

afterEach(() => {
  jest.clearAllMocks();
});
