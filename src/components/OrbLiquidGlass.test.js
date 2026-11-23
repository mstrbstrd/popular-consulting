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
    expect(shared).toMatch(/:where\(\[data-theme='dark'\]\) :is\(\.orb-page, \.home-page, \.popcan-page, \.invoice-page, \.calendar-page, \.invoice-site-navigation, \.metabloom-assistant-launcher\) \{[^}]*--lg-menu-fill:/);
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

  test('both sidebar layouts use clear nav glass rather than an opaque menu fill', () => {
    const start = css.indexOf('.orb-page .metabloom-threads__dock,');
    const material = css.slice(start, css.indexOf('}', start));
    expect(material).toContain('.orb-page .metabloom-threads__drawer');
    expect(material).toContain('background: var(--lg-clear-fill) !important;');
    expect(material).toContain('var(--lg-refraction, var(--lg-clear-fallback))');
    expect(material).toContain('box-shadow: var(--lg-specular), var(--lg-shadow)');
    expect(css).not.toContain(".metabloom-threads__dock[data-expanded='true']");
    expect(css).toContain('@supports not ((backdrop-filter: blur(1px))');
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

  test('composer and dialog controls carry the spectral ring: soft, full on hover/focus, 2px when selected', () => {
    const ring = css.slice(css.indexOf('Spectral rings on glass controls'));
    ['.metabloom-model-picker__trigger', '.metabloom-reactions__toolbar > button', '.metabloom-chat__research-toggle',
      '.metabloom-chat__latest', '.metabloom-model-picker__dialog button', '.metabloom-model-picker__field']
      .forEach(control => expect(ring).toContain(`.orb-page ${control}::before`));
    expect(ring).toMatch(/background: var\(--aetheris-spectral-border-soft\);/);
    expect(ring).toMatch(/mask-composite: exclude;/);
    expect(rules).toMatch(/\.metabloom-chat__research-toggle\[data-enabled='true'\]::before,[^{]*\{ padding: 2px; background: var\(--aetheris-spectral\); \}/);
    expect(rules).toMatch(/\.metabloom-reactions__toolbar > button:focus-visible::before,[^{]*\{ background: var\(--aetheris-spectral\); \}/);
    // The teal ring no longer marks an enabled chip; the spectral ring does.
    expect(rules).not.toMatch(/research-toggle\[data-enabled='true'\] \{[^}]*--aetheris-teal/);
    // Forced colours drop painted rings for system colours.
    expect(rules).toMatch(/@media \(forced-colors: active\) \{[^@]*\.metabloom-chat__research-toggle::before,[^@]*display: none;/);
  });

  test('menu rows stay ringless until hovered or focused', () => {
    expect(rules).toMatch(/\.metabloom-reactions__panel \.metabloom-reactions__saved-tool::before \{ opacity: 0; background: var\(--aetheris-spectral\); \}/);
    expect(rules).toMatch(/\.metabloom-reactions__saved-tool:focus-visible::before \{ opacity: 1; \}/);
  });

  test('the More, chat model and Theme popovers share the sidebar clear glass', () => {
    const start = css.indexOf('.orb-page .metabloom-reactions__panel,\n.orb-page .metabloom-model-picker__dialog,');
    const material = css.slice(start, css.indexOf('}', start));
    expect(material).toContain(".orb-page .orb-appearance__dialog:not([data-inline='true'])");
    expect(material).toContain('background: var(--lg-clear-fill) !important;');
    expect(material).toContain('var(--lg-refraction, var(--lg-clear-fallback))');
    expect(material).toContain('text-shadow: var(--lg-text-halo);');
    expect(material).not.toContain('--lg-menu-fill');
    expect(read('MetabloomModelPicker.css')).toContain('.metabloom-model-picker__dialog::backdrop { background: rgba(8, 8, 9, 0.12); }');
    // Like the More panel, the model dialog is a transient menu that receives the rim lens.
    expect(read('liquidGlassRefraction.js')).toContain("'.metabloom-model-picker__dialog[open]',");
  });
});
