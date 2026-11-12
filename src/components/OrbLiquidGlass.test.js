import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const css = read('OrbLiquidGlass.css');
const page = read('OrbPage.js');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('Orb liquid glass layer', () => {
  test('loads after every other Orb presentation layer', () => {
    const glass = page.indexOf('import "./OrbLiquidGlass.css";');
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

  test('one material in three densities, with light and dark tokens', () => {
    ['--lg-fill-control', '--lg-fill-panel', '--lg-fill-menu', '--lg-edge', '--lg-lens', '--lg-filter']
      .forEach(token => expect(css).toContain(`${token}:`));
    expect(css).toMatch(/:where\(\[data-theme='dark'\]\) \.orb-page \{[^}]*--lg-fill-menu:/);
  });

  test('accessibility preferences collapse glass to solid panels', () => {
    expect(css).toMatch(/@media \(prefers-reduced-transparency: reduce\), \(prefers-contrast: more\) \{[^@]*--lg-filter: none;/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{[\s\S]*background: Canvas !important;[\s\S]*backdrop-filter: none !important;/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^}]*animation: none;/);
  });

  test('menu entrances animate opacity only, never a transform over backdrop-filter', () => {
    const keyframes = css.match(/@keyframes orb-glass-in \{[^@]*?\}\s*\}/)?.[0] || css.match(/@keyframes orb-glass-in[^\n]*/)[0];
    expect(keyframes).toContain('opacity');
    expect(keyframes).not.toContain('transform');
  });

  test('no gradient-filled text', () => {
    expect(css).not.toMatch(/background-clip:\s*text/);
  });
});
