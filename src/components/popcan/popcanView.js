// View transforms never change document pixels. World coordinates survive growth.
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const WORLD_LIMIT = 32768;
export const MAX_CANVAS_SIDE = 4096;
export const MAX_CANVAS_PIXELS = 4 * 1024 * 1024;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const screenPoint = (point, view) => ({
  x: (point.x - view.x) / view.scale,
  y: (point.y - view.y) / view.scale,
});
export const zoomView = (view, scale, anchor) => {
  scale = clamp(finite(scale, view.scale), MIN_ZOOM, MAX_ZOOM);
  const world = screenPoint(anchor, view);
  return { x: anchor.x - world.x * scale, y: anchor.y - world.y * scale, scale };
};
export const panView = (view, dx, dy) => ({
  ...view,
  x: clamp(view.x + finite(dx, 0), -WORLD_LIMIT * view.scale, WORLD_LIMIT * view.scale),
  y: clamp(view.y + finite(dy, 0), -WORLD_LIMIT * view.scale, WORLD_LIMIT * view.scale),
});
export const validSize = (width, height) => Number.isInteger(width) && Number.isInteger(height)
  && width > 0 && height > 0 && width <= MAX_CANVAS_SIDE && height <= MAX_CANVAS_SIDE
  && width * height <= MAX_CANVAS_PIXELS;
// Logical page bounds are not bitmap allocation bounds. Empty space costs no pixels.
export const validWorldSize = (width, height) => Number.isInteger(width) && Number.isInteger(height)
  && width > 0 && height > 0 && width <= WORLD_LIMIT * 2 && height <= WORLD_LIMIT * 2;
export function rasterFrame(bounds, pixelBudget = MAX_CANVAS_PIXELS) {
  const width = Math.max(1, Math.ceil(bounds.right) - Math.floor(bounds.left));
  const height = Math.max(1, Math.ceil(bounds.bottom) - Math.floor(bounds.top));
  if (!Number.isInteger(pixelBudget) || pixelBudget < 1 || pixelBudget > MAX_CANVAS_PIXELS
    || ![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)
    || bounds.left > bounds.right || bounds.top > bounds.bottom || !validWorldSize(width, height)) throw new Error('Invalid render bounds.');
  let pixelSize = 1;
  while (!validSize(Math.ceil(width / pixelSize), Math.ceil(height / pixelSize))
    || Math.ceil(width / pixelSize) * Math.ceil(height / pixelSize) > pixelBudget) pixelSize *= 2;
  return { originX: Math.floor(bounds.left), originY: Math.floor(bounds.top),
    width: Math.ceil(width / pixelSize) * pixelSize, height: Math.ceil(height / pixelSize) * pixelSize,
    pixelWidth: Math.ceil(width / pixelSize), pixelHeight: Math.ceil(height / pixelSize), pixelSize };
}
export function expandedBounds(doc, bounds) {
  const values = [bounds.left, bounds.top, bounds.right, bounds.bottom];
  if (!values.every(Number.isFinite) || bounds.left > bounds.right || bounds.top > bounds.bottom) throw new Error('Invalid drawing bounds.');
  // Grow in small blocks, without allocating an enormous bitmap just to pan.
  const left = Math.min(doc.originX, Math.floor(bounds.left / 128) * 128);
  const top = Math.min(doc.originY, Math.floor(bounds.top / 128) * 128);
  const right = Math.max(doc.originX + doc.width, Math.ceil(bounds.right / 128) * 128);
  const bottom = Math.max(doc.originY + doc.height, Math.ceil(bounds.bottom / 128) * 128);
  if (Math.max(Math.abs(left), Math.abs(top), Math.abs(right), Math.abs(bottom)) > WORLD_LIMIT || !validWorldSize(right - left, bottom - top)) {
    throw new Error('Workspace edge limit reached. Move back toward your artwork to continue drawing.');
  }
  return { originX: left, originY: top, width: right - left, height: bottom - top };
}
export const TEXT_FONTS = Object.freeze({ sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'monospace' });
export function textSettings(options = {}) {
  return {
    font: Object.hasOwn(TEXT_FONTS, options.font) ? options.font : 'sans',
    size: clamp(finite(options.size, 48), 12, 240),
    bold: options.bold === true,
    color: /^#[0-9a-f]{6}$/i.test(options.color) ? options.color : '#24ccff',
  };
}
export function textLines(value) {
  if (typeof value !== 'string' || value.length > 1000) throw new Error('Use up to 1,000 characters.');
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 20) throw new Error('Use up to 20 lines of text.');
  return lines;
}
