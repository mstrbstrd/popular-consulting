import { screenPoint, zoomView, panView, expandedBounds, validSize, textSettings, textLines, MIN_ZOOM, MAX_ZOOM } from './popcanView';

const view = { x: 150, y: -20, scale: 0.5 };
const doc = { originX: 0, originY: 0, width: 1200, height: 800 };
test('zoom shrinks the contents without moving the world point under the pointer', () => {
  const anchor = { x: 420, y: 270 };
  const world = screenPoint(anchor, view);
  const zoomed = zoomView(view, 0.25, anchor);
  expect(screenPoint(anchor, zoomed)).toEqual(world);
  expect(zoomed.scale).toBe(0.25);
  expect(view.scale).toBe(0.5);
});
test('zoom is finite and bounded even for invalid input', () => {
  expect(zoomView(view, 0, { x: 0, y: 0 }).scale).toBe(MIN_ZOOM);
  expect(zoomView(view, 999, { x: 0, y: 0 }).scale).toBe(MAX_ZOOM);
  expect(zoomView(view, NaN, { x: 0, y: 0 }).scale).toBe(view.scale);
});
test('panning does not depend on a scrollable image or viewport edges', () => {
  expect(panView(view, 600, -500)).toEqual({ x: 750, y: -520, scale: 0.5 });
  expect(panView(view, NaN, 0)).toEqual(view);
});
test('drawing beyond the left and top adds space without relocating world pixels', () => {
  const next = expandedBounds(doc, { left: -200, top: -80, right: 100, bottom: 100 });
  expect(next).toEqual({ originX: -256, originY: -128, width: 1456, height: 928 });
  expect(next.originX + next.width).toBe(doc.width);
  expect(next.originY + next.height).toBe(doc.height);
});
test('marks inside the canvas cannot allocate additional space', () => {
  expect(expandedBounds(doc, { left: 100, top: 100, right: 200, bottom: 200 })).toEqual(doc);
});
test('oversized, non-finite and inverted bounds fail before allocation', () => {
  expect(() => expandedBounds(doc, { left: -30000, top: 0, right: 0, bottom: 0 })).toThrow(/limit/);
  expect(() => expandedBounds(doc, { left: NaN, top: 0, right: 5, bottom: 5 })).toThrow(/Invalid/);
  expect(() => expandedBounds(doc, { left: 50, top: 0, right: 5, bottom: 5 })).toThrow(/Invalid/);
  expect(validSize(4096, 4096)).toBe(false);
  expect(validSize(2048, 2048)).toBe(true);
  expect(validSize(1200.5, 800)).toBe(false);
});
test('text accepts multiline plain strings and rejects excessive work', () => {
  expect(textLines('Hi\r\n<script>not HTML</script>')).toEqual(['Hi', '<script>not HTML</script>']);
  expect(() => textLines('a'.repeat(1001))).toThrow();
  expect(() => textLines('\n'.repeat(20))).toThrow();
  expect(() => textLines(null)).toThrow();
  expect(textSettings({ font: 'url(evil)', color: 'red', size: Infinity, bold: 'true' })).toEqual({ font: 'sans', size: 48, bold: false, color: '#24ccff' });
  expect(textSettings({ size: 0, font: 'serif', bold: true }).size).toBe(12);
});
