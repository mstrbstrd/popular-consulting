import { canvasPoint, colorHex, DEFAULT_INK, floodPixels, gradientAt, PAPERS, shapeEnd } from './popcanEngine';
import { exportName } from './popcanStorage';

describe('Popular Canvas document math', () => {
  test('preserves the Morphogen pigment defaults', () => {
    expect(DEFAULT_INK.colorA).toBe('#24ccff');
    expect(DEFAULT_INK.colorB).toBe('#ff56d6');
    expect(DEFAULT_INK.material).toBe('sand');
    expect(PAPERS.transparent).toBe('transparent');
  });
  test('maps zoomed and translated CSS coordinates into document pixels', () => {
    expect(canvasPoint({ clientX: 230, clientY: 140, pointerType: 'pen', pressure: 0.4 },
      { left: 30, top: 40, width: 600, height: 400 }, 1200, 800)).toEqual({ x: 400, y: 200, pressure: 0.4 });
  });
  test('mouse strokes use consistent pressure and off-canvas coordinates stay bounded', () => {
    const point = canvasPoint({ clientX: 90000, clientY: -90000, pointerType: 'mouse', pressure: 0 },
      { left: 0, top: 0, width: 100, height: 100 }, 1200, 800);
    expect(point).toEqual({ x: 1400, y: -200, pressure: 1 });
  });
  test('constrains shapes in every drag direction without moving their origin', () => {
    const origin = { x: 100, y: 100 };
    expect(shapeEnd(origin, { x: 20, y: 120 }, 'rectangle', true)).toEqual({ x: 20, y: 180 });
    const end = shapeEnd(origin, { x: 180, y: 170 }, 'line', true);
    expect(end.x - 100).toBeCloseTo(end.y - 100);
    expect(shapeEnd(origin, { x: 90, y: 120 }, 'ellipse', false)).toEqual({ x: 90, y: 120 });
  });
  test.each(['solid', 'linear', 'radial', 'flow'])('%s pigment is deterministic and bounded', (mode) => {
    for (let i = 0; i <= 10; i++) {
      const value = gradientAt(i / 10, (10 - i) / 10, mode);
      expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
      expect(gradientAt(i / 10, (10 - i) / 10, mode)).toBe(value);
    }
  });
  test('keeps the solid endpoint and radial centre at the primary colour', () => {
    expect(gradientAt(0.8, 0.9, 'solid')).toBe(0);
    expect(gradientAt(0.5, 0.5, 'radial')).toBe(0);
    expect(colorHex([36, 204, 255])).toBe('#24ccff');
  });
  test('sanitizes local export names', () => {
    expect(exportName('../../a painting<script>')).toBe('a paintingscript.png');
    expect(exportName('***')).toBe('popular-canvas.png');
  });
});

describe('bounded flood fill', () => {
  const red = [220, 30, 40, 255];
  test('fills only a four-connected region and never wraps rows', () => {
    const pixels = new Uint8ClampedArray(3 * 3 * 4);
    [1, 4, 7].forEach((i) => pixels.set([255, 255, 255, 255], i * 4));
    expect(floodPixels(pixels, 3, 3, 0, 0, red)).toBe(true);
    [0, 3, 6].forEach((i) => expect(Array.from(pixels.slice(i * 4, i * 4 + 4))).toEqual(red));
    [2, 5, 8].forEach((i) => expect(pixels[i * 4 + 3]).toBe(0));
    expect(pixels[4 * 4]).toBe(255);
  });
  test('treats transparent pixels with stale RGB values as the same region', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 0, 255, 12, 120, 0]);
    floodPixels(pixels, 2, 1, 0, 0, red);
    expect(Array.from(pixels)).toEqual([...red, ...red]);
  });
  test('ignores outside points and exact no-op replacements', () => {
    const pixels = new Uint8ClampedArray(red);
    expect(floodPixels(pixels, 1, 1, -1, 0, red)).toBe(false);
    expect(floodPixels(pixels, 1, 1, 1, 0, red)).toBe(false);
    expect(floodPixels(pixels, 1, 1, 0, 0, red)).toBe(false);
  });
  test('fills a large region without recursion or stack overflow', () => {
    const pixels = new Uint8ClampedArray(320 * 240 * 4);
    floodPixels(pixels, 320, 240, 160, 120, red);
    expect(Array.from(pixels.slice(-4))).toEqual(red);
    expect(Array.from(pixels.slice(0, 4))).toEqual(red);
  });
});
