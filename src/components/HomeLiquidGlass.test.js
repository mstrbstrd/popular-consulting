import fs from 'fs';
import path from 'path';
import { HOME_REFRACTION_TARGETS, HOME_REFRACTION_PANELS, NAV_REFRACTION_MENUS, MAX_PERSISTENT_LENS_AREA } from './liquidGlassRefraction';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const shared = read('LiquidGlass.css');
const home = read('HomeLiquidGlass.css');
const homeBase = read('HomePage.css');
const homePage = read('HomePage.js');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = css => strip(css).replace(/@[^{]+\{/g, '').match(/[^{}]+(?=\{)/g)
  .flatMap(group => group.split(/,(?![^()]*\))/)).map(selector => selector.trim()).filter(Boolean)
  .filter(selector => !/^(from|to|\d+%)$/.test(selector));

describe('shared liquid glass and nav chrome', () => {
  test('applies only inside the signed-in Orb and Home pages', () => {
    selectors(shared).forEach(selector => expect(selector).toMatch(/:is\(\.orb-page, \.home-page\)|\.home-page/));
    selectors(home).forEach(selector => expect(selector).toMatch(/\.home-page/));
  });

  test('every nav icon is one glass button: no painted ring, no flat outline, no hover lift', () => {
    ['.nav-theme-toggle', '.nav-burger', '.workspace-menu > summary', '.site-account-control']
      .forEach(icon => expect(shared).toContain(`.nav-pill ${icon}`));
    const rule = strip(shared).match(/\.nav-pill \.site-account-control \{([^}]*)\}/)[1];
    expect(rule).toContain('background: var(--lg-lens-hover) !important;');
    expect(rule).toContain('box-shadow: var(--lg-lens-edge) !important;');
    expect(rule).toContain('transform: none !important;');
    expect(rule).toContain('border: 0 !important;');
  });

  test('the nav pill is not a backdrop root, so its menus blur the page', () => {
    const pill = strip(shared).match(/html body :is\(\.orb-page, \.home-page\) \.nav-pill \{([^}]*)\}/)[1];
    expect(pill).toContain('backdrop-filter: none !important;');
    const glass = strip(shared).match(/\.nav-pill::before \{([^}]*)\}/)[1];
    expect(glass).toContain('backdrop-filter: var(--lg-refraction, var(--lg-clear-fallback)) var(--lg-post);');
    expect(glass).toContain('z-index: -1;');
  });
});

describe('Home liquid glass', () => {
  test('Home loads the shared layer and its own layer after its base styles and runs refraction', () => {
    const base = homePage.indexOf("import './HomePage.css';");
    expect(homePage.indexOf("import './LiquidGlass.css';")).toBeGreaterThan(base);
    expect(homePage.indexOf("import './HomeLiquidGlass.css';")).toBeGreaterThan(homePage.indexOf("import './LiquidGlass.css';"));
    expect(homePage).toContain('useHomeLiquidGlass(pageRef)');
  });

  test('the entry animation still removes backdrop filters while surfaces move', () => {
    expect(homeBase).toMatch(/\.home-page\[data-entry="revealing"\] :is\([^)]*\.home-tool[^)]*\) \{ -webkit-backdrop-filter: none !important; backdrop-filter: none !important; \}/);
    expect(shared).toContain(".home-page[data-entry='revealing'] .nav-pill::before");
  });

  test('the greeting sits on the field without a pane, and menus are the only lensed panels', () => {
    expect(strip(home)).toMatch(/\.home-page \.home-welcome \{[^}]*background: none;[^}]*backdrop-filter: none;/);
    expect(HOME_REFRACTION_PANELS).toEqual(NAV_REFRACTION_MENUS);
  });

  test('the panes look the same during and after the entry: no backdrop filter to snap in', () => {
    // Lensing the tool cards halved Home's frame rate while scrolling (59 -> 30 fps),
    // and frost returning after the entry animation visibly snapped in.
    [...HOME_REFRACTION_TARGETS, ...HOME_REFRACTION_PANELS].forEach(selector =>
      expect(selector).not.toMatch(/home-tool|home-welcome|home-footer-pill|home-session(?!-)/));
    const css = strip(home);
    expect(css).toMatch(/html body \.home-page \.home-tool \{[^}]*-webkit-backdrop-filter: none !important;[^}]*backdrop-filter: none !important;/);
    expect(css).toMatch(/\.home-page \.home-session,\s*\.home-page \.home-footer-pill \{[^}]*backdrop-filter: none;/);
    expect(css).toMatch(/\.home-page\[data-entry='open'\] \.nav-pill::before \{ animation: liquid-glass-in/);
  });

  test('the refraction budget keeps persistent lenses control-sized', () => {
    expect(MAX_PERSISTENT_LENS_AREA).toBeLessThanOrEqual(60000);
    // The Orb composer (about 760 x 60) and nav pill (about 800 x 61) stay inside it.
    expect(760 * 60).toBeLessThanOrEqual(MAX_PERSISTENT_LENS_AREA);
    expect(645 * 280).toBeGreaterThan(MAX_PERSISTENT_LENS_AREA);
  });

  test('the header stacks above the workspace and the mobile overlay, so its menus and Close button are never covered', () => {
    const zIndex = Number(homeBase.match(/\.home-stage > \.nav-header \{ z-index: (\d+); \}/)?.[1]);
    expect(zIndex).toBeGreaterThan(1); // .home-main workspace
    expect(zIndex).toBeGreaterThan(999); // .nav-overlay, whose Close button lives in this header
    expect(zIndex).toBeLessThan(1100); // the .home-intro entry scene stays on top
  });
});
