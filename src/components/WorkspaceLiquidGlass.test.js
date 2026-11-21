import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = css => strip(css).replace(/@[^{]+\{/g, '').match(/[^{}]+(?=\{)/g)
  .flatMap(group => group.split(/,(?![^()]*\))/)).map(selector => selector.trim()).filter(Boolean)
  .filter(selector => !/^(from|to|\d+%)$/.test(selector));
const shared = read('LiquidGlass.css');
const popcan = read('PopcanLiquidGlass.css');
const invoice = read('InvoiceLiquidGlass.css');
const orb = read('OrbLiquidGlass.css');

describe('one liquid glass system across the signed-in workspace', () => {
  test('Canvas and the Invoice Generator load the shared tokens before their own glass layer', () => {
    const popcanPage = read('PopcanPage.js');
    expect(popcanPage.indexOf("import './PopcanPage.css';")).toBeLessThan(popcanPage.indexOf("import './LiquidGlass.css';"));
    expect(popcanPage.indexOf("import './LiquidGlass.css';")).toBeLessThan(popcanPage.indexOf("import './PopcanLiquidGlass.css';"));
    const invoicePage = read('InvoiceGeneratorPage.js');
    expect(invoicePage.indexOf('import "./InvoiceGeneratorScene.css";')).toBeLessThan(invoicePage.indexOf('import "./LiquidGlass.css";'));
    expect(invoicePage.indexOf('import "./LiquidGlass.css";')).toBeLessThan(invoicePage.indexOf('import "./InvoiceLiquidGlass.css";'));
    expect(shared).toMatch(/:is\(\.orb-page, \.home-page, \.popcan-page, \.invoice-page, \.invoice-site-navigation, \.metabloom-assistant-launcher\) \{\s*--lg-clear-fill:/);
  });

  test('every Canvas and invoice selector stays inside its own tool', () => {
    selectors(popcan).forEach(selector => expect(selector).toMatch(/^\.popcan-page /));
    selectors(invoice).forEach(selector => expect(selector).toMatch(/^(\.invoice-page |\.metabloom-assistant-launcher)/));
  });

  test('artwork and the printable invoice paper are never glass', () => {
    expect(strip(popcan)).not.toMatch(/\.pc-(stage|artboard|paint|preview|pigment-preview|papers)\b/);
    expect(strip(invoice)).not.toMatch(/invoice-paper|invoice-document/);
    expect(strip(invoice)).toMatch(/^@media screen \{/m);
    expect(strip(invoice)).not.toMatch(/@media print/);
  });

  test('long scrolling form sections are unfrosted panes; floating bars are frosted', () => {
    const panes = strip(invoice).match(/\.invoice-page \.invoice-assistant-scope,\s*\.invoice-page \.invoice-form > fieldset,\s*\.invoice-page \.invoice-settings \{([^}]*)\}/)[1];
    expect(panes).toContain('backdrop-filter: none;');
    expect(panes).toContain('box-shadow: var(--lg-specular), var(--lg-shadow);');
    const bars = strip(invoice).match(/\.invoice-page \.invoice-actions,\s*\.invoice-page \.invoice-toolbar \{([^}]*)\}/)[1];
    expect(bars).toContain('backdrop-filter: var(--lg-regular-blur) var(--lg-post);');
    const islands = strip(popcan).match(/\.popcan-page \.pc-topbar,[^{]*\{([^}]*)\}/)[1];
    expect(islands).toContain('background: var(--lg-menu-fill);');
    expect(islands).toContain('backdrop-filter: var(--lg-regular-blur) var(--lg-post);');
  });

  test('content inside a glass panel is a lens, never a nested frosted layer or opaque card', () => {
    expect(strip(orb)).toMatch(/\.orb-page \.metabloom-chat__workspace,[\s\S]*?--aetheris-card-panel: var\(--lg-lens-hover\);/);
    expect(strip(orb)).toMatch(/\.metabloom-component-workspace__body > \.metabloom-research-slot \{ background: transparent; \}/);
    expect(strip(orb)).toMatch(/\.orb-page \.metabloom-chat__workspace \.metabloom-source-preview \{\s*-webkit-backdrop-filter: none; backdrop-filter: none;/);
    expect(strip(orb)).toMatch(/\.orb-page \.metabloom-saved-work \{[^}]*background: var\(--lg-menu-fill\);[^}]*backdrop-filter: var\(--lg-regular-blur\) var\(--lg-post\);/);
  });

  test('reduced motion drops blur site-wide, so text-bearing glass densifies its tint', () => {
    expect(shared).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*--lg-menu-fill: rgba\(255, 252, 251, 0\.94\);[^@]*--lg-menu-fill: rgba\(18, 18, 26, 0\.94\);/);
    // Accessibility solids are declared after it, so reduced transparency still wins.
    expect(shared.indexOf('(prefers-reduced-motion: reduce) {\n  :is(')).toBeLessThan(shared.indexOf('(prefers-reduced-transparency: reduce), (prefers-contrast: more)'));
  });

  test('forced colours collapse every new surface to system colours', () => {
    [popcan, invoice, orb].forEach(css => expect(css).toMatch(/@media (screen and )?\(forced-colors: active\) \{[\s\S]*background: Canvas;[\s\S]*backdrop-filter: none;/));
  });
});
