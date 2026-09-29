// Immutable cropped bitmaps retain the authored pigment. Moving an object never
// samples the flattened page, changes z-order, or mutates an undo snapshot.
import { validSize, WORLD_LIMIT } from './popcanView';

export const MAX_OBJECTS = 512;
export const MAX_OBJECT_BYTES = 20 * 1024 * 1024;
export const OBJECT_KINDS = ['brush', 'line', 'rectangle', 'ellipse', 'fill', 'text', 'image', 'legacy'];
export const objectBounds = (object) => ({
  left: object.x, top: object.y,
  right: object.x + object.bitmap.width, bottom: object.y + object.bitmap.height,
});
export const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export function objectBytes(objects) {
  const bitmaps = new Set(objects.map((object) => object.bitmap));
  return [...bitmaps].reduce((bytes, bitmap) => bytes + bitmap.width * bitmap.height * 4, 0);
}
export function checkObjects(objects) {
  if (objects.length > MAX_OBJECTS || objectBytes(objects) > MAX_OBJECT_BYTES) {
    throw new Error('Object limit reached. Export your work and start a new canvas. Existing items have not been flattened.');
  }
}
export function alphaBounds(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!data[(y * width + x) * 4 + 3]) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
export function validateObjectRecords(records, doc) {
  if (!Array.isArray(records) || records.length > MAX_OBJECTS) throw new Error('Invalid saved objects.');
  const ids = new Set(); let bytes = 0, encoded = 0;
  for (const item of records) {
    if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || item.id >= Number.MAX_SAFE_INTEGER || ids.has(item.id)
      || !OBJECT_KINDS.includes(item.kind) || !validSize(item.width, item.height)
      || ![item.x, item.y].every((n) => Number.isInteger(n) && Math.abs(n) <= WORLD_LIMIT)
      || item.x < doc.originX || item.y < doc.originY
      || item.x + item.width > doc.originX + doc.width || item.y + item.height > doc.originY + doc.height
      || !(item.blob instanceof Blob) || item.blob.type !== 'image/png' || !item.blob.size) {
      throw new Error('Invalid saved object.');
    }
    ids.add(item.id); bytes += item.width * item.height * 4; encoded += item.blob.size;
  }
  if (bytes > MAX_OBJECT_BYTES || encoded > MAX_OBJECT_BYTES * 2) throw new Error('Saved objects exceed the memory limit.');
}
// Validate PNG dimensions before decoding each object. No URLs, SVG, HTML, or
// executable text enter the object model, including when restoring local data.
export async function checkObjectPng(item) {
  const buffer = await item.blob.slice(0, 24).arrayBuffer();
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (bytes.length !== 24 || !signature.every((n, i) => bytes[i] === n)
    || view.getUint32(16) !== item.width || view.getUint32(20) !== item.height) throw new Error('Invalid object image dimensions.');
}
