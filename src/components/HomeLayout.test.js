import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const page = read('HomePage.js');
const css = read('HomePage.css');

describe('Home layout and feature art', () => {
  test('Orb is the first tool, followed by the creative tools, then business', () => {
    const order = [...page.matchAll(/\{ id: '(\w+)', title:/g)].map(match => match[1]);
    expect(order).toEqual(['orb', 'popcan', 'dither', 'invoice']);
  });

  test('Orb is the featured card and Invoice closes the grid as a full-width strip', () => {
    expect(css).toMatch(/\.home-tool--orb \{ grid-column: span 7; grid-row: span 2;/);
    expect(css).toMatch(/\.home-tool--popcan, \.home-tool--dither \{ grid-column: span 5; \}/);
    expect(css).toMatch(/\.home-tool--invoice \{ grid-column: span 12;/);
  });

  test('each card has one action: no duplicate arrow button', () => {
    expect(page).not.toContain('home-tool-arrow');
    expect(page).toContain('className="home-tool-action"');
  });

  test('every illustration is decorative SVG in the shared spectral palette', () => {
    ['home-art--orb', 'home-art--popcan', 'home-art--dither', 'home-art--invoice']
      .forEach(name => expect(page).toContain(`className="home-art ${name}"`));
    expect(page).toContain("const SPECTRUM = [['#00d9ef', 0], ['#8b6cff', 0.38], ['#ff65c9', 0.7], ['#ffc94a', 1]];");
    expect(page).toContain('<div className="home-tool-art" aria-hidden="true">');
    // The Orb mark is faceless, like the live Metabloom: no eyes or mouth painted on.
    const orb = page.slice(page.indexOf("if (kind === 'orb')"), page.indexOf("if (kind === 'popcan')"));
    expect(orb).not.toMatch(/eye|mouth|face/i);
  });
});
