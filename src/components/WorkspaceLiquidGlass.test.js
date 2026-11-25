import fs from 'fs';
import path from 'path';
import { CALENDAR_REFRACTION_TARGETS, CALENDAR_REFRACTION_PANELS, NAV_REFRACTION_MENUS } from './liquidGlassRefraction';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = css => strip(css).replace(/@[^{]+\{/g, '').match(/[^{}]+(?=\{)/g)
  .flatMap(group => group.split(/,(?![^()]*\))/)).map(selector => selector.trim()).filter(Boolean)
  .filter(selector => !/^(from|to|\d+%)$/.test(selector));
const shared = read('LiquidGlass.css');
const popcan = read('PopcanLiquidGlass.css');
const invoice = read('InvoiceLiquidGlass.css');
const orb = read('OrbLiquidGlass.css');
const calendar = read('CalendarPage.css');

describe('one liquid glass system across the signed-in workspace', () => {
  test('Canvas and the Invoice Generator load the shared tokens before their own glass layer', () => {
    const popcanPage = read('PopcanPage.js');
    expect(popcanPage.indexOf("import './PopcanPage.css';")).toBeLessThan(popcanPage.indexOf("import './LiquidGlass.css';"));
    expect(popcanPage.indexOf("import './LiquidGlass.css';")).toBeLessThan(popcanPage.indexOf("import './PopcanLiquidGlass.css';"));
    const invoicePage = read('InvoiceGeneratorPage.js');
    expect(invoicePage.indexOf('import "./InvoiceGeneratorScene.css";')).toBeLessThan(invoicePage.indexOf('import "./LiquidGlass.css";'));
    expect(invoicePage.indexOf('import "./LiquidGlass.css";')).toBeLessThan(invoicePage.indexOf('import "./InvoiceLiquidGlass.css";'));
    expect(shared).toMatch(/:is\(\.orb-page, \.home-page, \.popcan-page, \.invoice-page, \.calendar-page, \.invoice-site-navigation, \.metabloom-assistant-launcher, \.metabloom-companion\) \{\s*--lg-clear-fill:/);
  });

  test('every Canvas and invoice selector stays inside its own tool', () => {
    selectors(popcan).forEach(selector => expect(selector).toMatch(/^\.popcan-page /));
    selectors(invoice).forEach(selector => expect(selector).toMatch(/^(\.invoice-page |\.metabloom-assistant-launcher)/));
  });

  test('artwork and the printable invoice paper are never glass', () => {
    expect(strip(popcan)).not.toMatch(/\.pc-(stage|artboard|paint|preview|papers)\b/);
    // The pigment preview only opts out of the chrome's text halo.
    strip(popcan).match(/[^{}]*\.pc-pigment-preview[^{]*\{[^}]*\}/g).forEach(rule => expect(rule).toMatch(/\{ text-shadow: none; \}$/));
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
    const islands = strip(popcan).match(/\.popcan-page \.pc-tools,[^{]*\{([^}]*)\}/)[1];
    expect(islands).toContain('background: var(--lg-clear-fill);');
    expect(islands).toContain('backdrop-filter: var(--lg-clear-fallback) var(--lg-post);');
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

  test('Canvas has one top menu, clear glass like the nav pill, with its glass on ::before', () => {
    const page = read('PopcanPage.js');
    expect(page).not.toMatch(/NavMenu/);
    expect(page).toMatch(/<nav className="pc-site" aria-label="Site"><ThemeToggle \/><WorkspaceMenu siteLinks \/><AuthNavControl \/><\/nav>\s*<\/header>/);
    const bar = strip(popcan).match(/\.popcan-page \.pc-topbar \{([^}]*)\}/)[1];
    expect(bar).toContain('backdrop-filter: none;');
    const glass = strip(popcan).match(/\.popcan-page \.pc-topbar::before \{([^}]*)\}/)[1];
    expect(glass).toContain('background: var(--lg-clear-fill);');
    expect(glass).toContain('backdrop-filter: var(--lg-clear-fallback) var(--lg-post);');
    expect(read('PopcanPage.css')).not.toMatch(/nav-header|pc-nav-height/);
  });

  test('forced colours collapse every new surface to system colours', () => {
    [popcan, invoice, orb, calendar].forEach(css => expect(css).toMatch(/@media (screen and )?\(forced-colors: active\) \{[\s\S]*background: Canvas;[\s\S]*backdrop-filter: none;/));
  });

  test('Calendar is on the shared system: shared tokens, Aetheris colours, the Orb\'s two materials', () => {
    const page = read('CalendarPage.js');
    const css = strip(calendar);
    expect(page.indexOf("import './LiquidGlass.css';")).toBeLessThan(page.indexOf("import './CalendarPage.css';"));
    expect(shared).toMatch(/html body :is\([^)]*\.calendar-page[^)]*\) \.nav-pill::before \{/);
    // No private copy of the glass tokens and no off-system accent.
    expect(css).not.toMatch(/--lg-[a-z-]+:/);
    expect(css).not.toMatch(/#1d4ed8|#38bdf8|Poppins/);
    // Clear glass: the toolbar and header capsules float over the field like the
    // Orb's composer controls, lensed in Chromium, with no bar behind them.
    const clear = css.match(/\.calendar-main \.calendar-toolbar :is\(\.calendar-segment, \.calendar-btn\),\s*\.calendar-main \.calendar-header \.calendar-badge \{([^}]*)\}/)[1];
    expect(clear).toContain('background: var(--lg-clear-fill);');
    expect(clear).toMatch(/-webkit-backdrop-filter: var\(--lg-clear-fallback\) var\(--lg-post\);\s*backdrop-filter: var\(--lg-refraction, var\(--lg-clear-fallback\)\) var\(--lg-post\);/);
    expect(clear).toContain('box-shadow: var(--lg-specular), var(--lg-shadow);');
    expect(clear).toContain('text-shadow: var(--lg-text-halo);');
    const bar = css.match(/\.calendar-toolbar \{([^}]*)\}/)[1];
    expect(bar).not.toMatch(/backdrop-filter|background/);
    // Regular glass: frosted panes like the Orb's workspace panel.
    const pane = css.match(/\.calendar-pane \{([^}]*)\}/)[1];
    expect(pane).toContain('background: var(--lg-panel-fill);');
    expect(pane).toContain('backdrop-filter: var(--lg-regular-blur) var(--lg-post);');
    expect(pane).toContain('box-shadow: var(--lg-specular), var(--lg-shadow);');
    expect(css).toMatch(/\.calendar-modal \{[^}]*backdrop-filter: var\(--lg-refraction, var\(--lg-regular-blur\)\) var\(--lg-post\);/);
    // index.css's bare-element styles (padded purple buttons, italic h2) stay out.
    expect(css).toMatch(/\.calendar-main :where\(button, a, h1, h2, h3, p, li, label, input, select, textarea, legend\) \{[^}]*padding: 0;[^}]*font-style: normal;/);
    // Large glass surfaces never animate with transforms (Chrome clip desync).
    expect(css).not.toMatch(/transform:(?!\s*translateX\(-50%\))/);
  });

  test('Calendar lenses only control-sized capsules and its transient dialog', () => {
    expect(read('CalendarPage.js')).toContain('useCalendarLiquidGlass(pageRef)');
    expect(CALENDAR_REFRACTION_TARGETS).toContain('.nav-pill');
    expect(CALENDAR_REFRACTION_PANELS).toEqual([...NAV_REFRACTION_MENUS, '.calendar-modal']);
    // The schedule, session and connect panes are far over the persistent budget,
    // and the field canvas is never a lens target.
    [...CALENDAR_REFRACTION_TARGETS, ...CALENDAR_REFRACTION_PANELS].forEach(selector =>
      expect(selector).not.toMatch(/calendar-(pane|surface|session|connect|page__scene)|canvas/));
  });
});
