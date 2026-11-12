import { buildLensMap, lensGeometry, roundedRectField, supportsOrbRefraction,
  ORB_REFRACTION_TARGETS, ORB_REFRACTION_MENUS } from './liquidGlassRefraction';

const pixel = (data, width, x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const fakeWindow = ({ search = '', brands = [{ brand: 'Chromium' }], matches = [] } = {}) => ({
  location: { search }, navigator: { userAgentData: { brands } },
  matchMedia: query => ({ matches: matches.includes(query) }),
});

describe('liquid glass lens map', () => {
  test('the rounded-rect field is negative inside, zero at the rim and points outward', () => {
    expect(roundedRectField(50, 20, 100, 40, 20).distance).toBeLessThan(0);
    expect(Math.abs(roundedRectField(50, 0, 100, 40, 20).distance)).toBeLessThan(1e-9);
    const top = roundedRectField(50, 1, 100, 40, 20);
    expect(top.ny).toBe(-1);
    expect(roundedRectField(99, 20, 100, 40, 20).nx).toBe(1);
  });

  test('the centre is optically flat and the rim bends inward, strongest at the edge', () => {
    const width = 120; const height = 40;
    const map = buildLensMap(width, height, 20, 12);
    expect(map).toHaveLength(width * height * 4);
    expect(pixel(map, width, 60, 20)).toEqual([128, 128, 128, 255]);
    const [, nearEdge] = pixel(map, width, 60, 0);
    const [, inner] = pixel(map, width, 60, 8);
    // Top rim: the sample point moves down (inward), so G rises above neutral.
    expect(nearEdge).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThanOrEqual(128);
    const [leftRim] = pixel(map, width, 0, 20);
    expect(leftRim).toBeGreaterThan(128);
    const [rightRim] = pixel(map, width, width - 1, 20);
    expect(rightRim).toBeLessThan(128);
  });

  test('controls bend gently and menus a little more, always within the bezel', () => {
    const control = lensGeometry({ width: 760, height: 60, radius: 30, menu: false });
    const menu = lensGeometry({ width: 400, height: 320, radius: 24, menu: true });
    expect(control.scale / 2).toBeLessThanOrEqual(7);
    expect(menu.scale / 2).toBeLessThanOrEqual(10);
    expect(control.scale / 2).toBeLessThan(control.bezel);
    expect(control.blur).toBeLessThan(menu.blur);
  });
});

describe('liquid glass refraction gating', () => {
  test('accessibility preferences always disable refraction, even when forced', () => {
    ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)'].forEach(query =>
      expect(supportsOrbRefraction(fakeWindow({ search: '?liquid-glass=refraction', matches: [query] }))).toBe(false));
  });

  test('the query override forces the lens on or off', () => {
    expect(supportsOrbRefraction(fakeWindow({ search: '?liquid-glass=refraction', brands: [] }))).toBe(true);
    expect(supportsOrbRefraction(fakeWindow({ search: '?liquid-glass=off' }))).toBe(false);
  });

  test('non-Chromium browsers and software rendering keep the CSS fallback', () => {
    expect(supportsOrbRefraction(fakeWindow({ brands: [{ brand: 'Safari' }] }))).toBe(false);
    // jsdom has no hardware WebGL, so even a Chromium brand stays on the fallback.
    expect(supportsOrbRefraction(fakeWindow())).toBe(false);
  });

  test('targets are the floating controls and transient menus, never the field or transcript', () => {
    [...ORB_REFRACTION_TARGETS, ...ORB_REFRACTION_MENUS].forEach(selector => {
      expect(selector).not.toMatch(/metabloom-chat__(field|messages|bubble)|canvas/);
    });
  });
});
