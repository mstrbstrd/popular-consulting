import { screenPoint, zoomView, panView, expandedBounds, validSize, textSettings, textLines, MIN_ZOOM, MAX_ZOOM, rasterFrame, validWorldSize } from './popcanView';

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
  expect(() => expandedBounds(doc, { left: -40000, top: 0, right: 0, bottom: 0 })).toThrow(/limit/);
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

test('distant small marks grow logical bounds without requesting a huge bitmap', () => {
  const distant = expandedBounds(doc, { left: -9000, top: -4000, right: 9000, bottom: 4000 });
  expect(validSize(distant.width, distant.height)).toBe(false);
  expect(validWorldSize(distant.width, distant.height)).toBe(true);
  const frame = rasterFrame({ left: distant.originX, top: distant.originY,
    right: distant.originX + distant.width, bottom: distant.originY + distant.height });
  expect(validSize(frame.pixelWidth, frame.pixelHeight)).toBe(true);
  expect(frame.pixelSize).toBeGreaterThan(1);
});
test('small raster targets keep exact pixels and oversized targets stay bounded', () => {
  expect(rasterFrame({ left: 0, top: 0, right: 1200, bottom: 800 })).toEqual({
    originX: 0, originY: 0, width: 1200, height: 800, pixelWidth: 1200, pixelHeight: 800, pixelSize: 1,
  });
  for (const size of [4096, 12000, 65536]) {
    const frame = rasterFrame({ left: -size / 2, top: -size / 2, right: size / 2, bottom: size / 2 });
    expect(validSize(frame.pixelWidth, frame.pixelHeight)).toBe(true);
    expect(frame.pixelSize).toBeLessThanOrEqual(32);
  }
  expect(() => rasterFrame({ left: 0, top: 0, right: Infinity, bottom: 1 })).toThrow();
});
