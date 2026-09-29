import { alphaBounds, checkObjects, objectBytes, MAX_OBJECT_BYTES, MAX_OBJECTS, objectBounds, intersects,
  validateObjectRecords, checkObjectPng } from './popcanObjects';

const bitmap = (width = 10, height = 20) => ({ width, height });
const object = (id = 1, image = bitmap()) => ({ id, bitmap: image, kind: 'brush', x: 10, y: 20 });
const doc = { originX: -128, originY: 0, width: 1200, height: 800 };
const record = (id = 1) => ({ id, kind: 'text', x: 100, y: 200, width: 40, height: 20, blob: new Blob(['png'], { type: 'image/png' }) });

test('crops exactly to nontransparent pixels, including edge and faint pigment', () => {
  const pixels = new Uint8ClampedArray(4 * 3 * 4);
  expect(alphaBounds(pixels, 4, 3)).toBeNull();
  pixels[3] = 1; pixels[(2 * 4 + 3) * 4 + 3] = 255;
  expect(alphaBounds(pixels, 4, 3)).toEqual({ left: 0, top: 0, width: 4, height: 3 });
  pixels[3] = 0;
  expect(alphaBounds(pixels, 4, 3)).toEqual({ left: 3, top: 2, width: 1, height: 1 });
});
test('bounds stay in world coordinates, independent of camera and document origin', () => {
  expect(objectBounds(object())).toEqual({ left: 10, top: 20, right: 20, bottom: 40 });
  expect(intersects(objectBounds(object()), { left: 20, top: 20, right: 30, bottom: 40 })).toBe(false);
  expect(intersects(objectBounds(object()), { left: 19, top: 20, right: 30, bottom: 40 })).toBe(true);
});
test('history counts shared bitmaps once but counts immutable eraser replacements separately', () => {
  const asset = bitmap();
  expect(objectBytes([object(1, asset), { ...object(1, asset), x: 200 }])).toBe(800);
  expect(objectBytes([object(1, asset), object(1, bitmap())])).toBe(1600);
});
test('refuses resource growth rather than silently flattening selectable objects', () => {
  expect(() => checkObjects(Array.from({ length: MAX_OBJECTS + 1 }, (_, i) => object(i)))).toThrow(/not been flattened/);
  expect(() => checkObjects([object(1, bitmap(1, MAX_OBJECT_BYTES / 4 + 1))])).toThrow(/Object limit/);
  expect(() => checkObjects([object()])).not.toThrow();
});
test('accepts bounded local PNG records and does not trust persisted positions or ids', () => {
  expect(() => validateObjectRecords([record()], doc)).not.toThrow();
  for (const changed of [{ id: -1 }, { id: Infinity }, { x: NaN }, { x: 0.5 }, { x: -200 }, { width: 9000 },
    { kind: 'script' }, { blob: 'https://example.test/file' }, { blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }) }]) {
    expect(() => validateObjectRecords([{ ...record(), ...changed }], doc)).toThrow();
  }
  expect(() => validateObjectRecords([record(), record()], doc)).toThrow();
  expect(() => validateObjectRecords(null, doc)).toThrow();
});
test('checks actual PNG dimensions before permitting decoding', async () => {
  const header = new Uint8Array(24), view = new DataView(header.buffer);
  header.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  view.setUint32(16, 40); view.setUint32(20, 20);
  const item = { ...record(), blob: { slice: () => ({ arrayBuffer: async () => header.buffer }) } };
  await expect(checkObjectPng(item)).resolves.toBeUndefined();
  view.setUint32(16, 40000);
  await expect(checkObjectPng(item)).rejects.toThrow(/dimensions/);
  header[0] = 0;
  await expect(checkObjectPng(item)).rejects.toThrow();
});
