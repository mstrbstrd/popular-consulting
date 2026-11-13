import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const css = read('OrbLiquidGlass.css');
const shared = read('LiquidGlass.css');
const page = read('OrbPage.js');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Orb liquid glass layer', () => {
  test('loads after every other Orb presentation layer, with the shared layer just before it', () => {
    const glass = page.indexOf('import "./OrbLiquidGlass.css";');
    expect(page.indexOf('import "./LiquidGlass.css";')).toBeGreaterThan(page.indexOf('import "./OrbChatRefinement.css";'));
    expect(page.indexOf('import "./LiquidGlass.css";')).toBeLessThan(glass);
    expect(glass).toBeGreaterThan(-1);
    const otherCss = [...page.matchAll(/import ["']\.\/[^"']+\.css["'];/g)].map(match => match.index);
    expect(Math.max(...otherCss)).toBe(glass);
  });

  test('every selector is scoped to the Orb page so other routes keep their chrome', () => {
    const selectors = rules.replace(/@[^{]+\{/g, '').match(/[^{}]+(?=\{)/g)
      .flatMap(group => group.split(',')).map(selector => selector.trim()).filter(Boolean)
      .filter(selector => !/^(from|to|\d+%)$/.test(selector));
    expect(selectors.length).toBeGreaterThan(20);
    selectors.forEach(selector => expect(selector).toMatch(/\.orb-page/));
  });

  test('clear and regular glass, with light and dark tokens', () => {
    ['--lg-clear-fill', '--lg-input-fill', '--lg-panel-fill', '--lg-menu-fill', '--lg-specular', '--lg-lens', '--lg-regular-blur']
      .forEach(token => expect(shared).toContain(`${token}:`));
    expect(shared).toMatch(/:where\(\[data-theme='dark'\]\) :is\(\.orb-page, \.home-page\) \{[^}]*--lg-menu-fill:/);
  });

  test('accessibility preferences collapse glass to solid panels', () => {
    expect(shared).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\) \{[^@]*--lg-regular-blur: none;[^@]*--lg-post: none;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{[\s\S]*background: Canvas !important;[\s\S]*backdrop-filter: none !important;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none;/);
  });

  test('menu entrances animate opacity only, never a transform over backdrop-filter', () => {
    const keyframes = shared.match(/@keyframes liquid-glass-in[^\n]*/)[0];
    expect(keyframes).toContain('opacity');
    expect(keyframes).not.toContain('transform');
  });

  test('refraction is optional: every lensed surface keeps a blur fallback, prefixed first', () => {
    const uses = [...css.matchAll(/(-webkit-backdrop-filter: [^;]+;)\s*backdrop-filter: (var\(--lg-refraction, [^)]+\)[^;]*);/g)];
    expect(uses.length).toBeGreaterThanOrEqual(3);
    uses.forEach(([, prefixed]) => expect(prefixed).not.toContain('--lg-refraction'));
  });

  test('no gradient-filled text', () => {
    expect(css).not.toMatch(/background-clip:\s*text/);
  });
});

describe('shared liquid glass lenses', () => {
  const sharedRules = shared.replace(/\/\*[\s\S]*?\*\//g, '');
  test('a lens never inherits into the icons and menus inside a lensed surface', () => {
    expect(sharedRules).toMatch(/@property --lg-refraction \{ syntax: "\*"; inherits: false; \}/);
    // The pill's lens is set on the pill but drawn by its pseudo-element.
    const pill = sharedRules.slice(sharedRules.indexOf('.nav-pill::before {'));
    expect(pill.slice(0, pill.indexOf('}'))).toContain('--lg-refraction: inherit;');
  });

  test('opening a nav menu marks its button with a ring, not a darker fill', () => {
    const open = sharedRules.slice(sharedRules.indexOf('.workspace-menu[open] > summary'));
    const body = open.slice(open.indexOf('{') + 1, open.indexOf('}'));
    expect(body).toContain('background: var(--lg-lens-hover) !important;');
    expect(body).not.toMatch(/background: var\(--lg-lens\) /);
  });
});
