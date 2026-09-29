import { alphaBounds, checkObjects, objectBounds, objectBytes, intersects, validateObjectRecords, checkObjectPng } from './popcanObjects';
import { loadImage } from './popcanStorage';
import { expandedBounds, validSize, WORLD_LIMIT, TEXT_FONTS, textSettings, textLines } from './popcanView';

// A stationary, document-space adaptation of Morphogen Divide's sand pigment.
// The field lab keeps its live Gray–Scott simulation; this editor owns no WebGL
// context or idle animation loop. Colour and grain are baked into each stroke.
export const DEFAULT_INK = Object.freeze({
  tool: 'brush', material: 'sand', gradient: 'flow', colorA: '#24ccff',
  colorB: '#ff56d6', size: 48, opacity: 1, grain: 0.65, filled: false,
});
export const FORMATS = Object.freeze({ landscape: [1200, 800], square: [1000, 1000], portrait: [800, 1200] });
export const PAPERS = Object.freeze({ midnight: '#111116', warm: '#fff8f7', white: '#ffffff', transparent: 'transparent' });
const HISTORY_BYTES = 40 * 1024 * 1024;
const BAYER = [0,48,12,60,3,51,15,63,32,16,44,28,35,19,47,31,8,56,4,52,11,59,7,55,40,24,36,20,43,27,39,23,2,50,14,62,1,49,13,61,34,18,46,30,33,17,45,29,10,58,6,54,9,57,5,53,42,26,38,22,41,25,37,21];
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const colorHex = (channels) => '#' + channels.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const smooth = (n) => { const t = clamp(n, 0, 1); return t * t * (3 - 2 * t); };
const hash = (x, y) => {
  let n = Math.imul(x + 173, 374761393) ^ Math.imul(y + 317, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const noise = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y), sx = smooth(x - ix), sy = smooth(y - iy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy * (1 - sx) + (d - b) * sx * sy;
};
export const gradientAt = (u, v, mode, aspect = 1.5) => {
  if (mode === 'solid') return 0;
  if (mode === 'linear') return clamp(u * 0.72 + v * 0.28, 0, 1);
  if (mode === 'radial') return clamp(Math.hypot((u - 0.5) * aspect, v - 0.5) * 0.82, 0, 1);
  const x = (u - 0.5) * 2.36 * aspect + 2.3, y = (v - 0.5) * 2.36 + 2.3;
  const fbm = noise(x, y) * 0.57 + noise(x * 2, y * 2) * 0.28 + noise(x * 4, y * 4) * 0.15;
  return 0.5 + 0.5 * Math.sin((u * 0.34 + (1 - v) * 0.28 + fbm * 0.52) * Math.PI * 2);
};
export const canvasPoint = (event, rect, width, height) => ({
  x: clamp((event.clientX - rect.left) * width / Math.max(1, rect.width), -200, width + 200),
  y: clamp((event.clientY - rect.top) * height / Math.max(1, rect.height), -200, height + 200),
  pressure: event.pointerType === 'pen' && event.pressure > 0 ? clamp(event.pressure, 0.1, 1) : 1,
});
export const shapeEnd = (start, end, tool, constrain) => {
  if (!constrain) return end;
  let dx = end.x - start.x, dy = end.y - start.y;
  if (tool === 'line') {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
    const distance = Math.hypot(dx, dy);
    dx = Math.cos(angle) * distance; dy = Math.sin(angle) * distance;
  } else {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * size; dy = (dy < 0 ? -1 : 1) * size;
  }
  return { ...end, x: start.x + dx, y: start.y + dy };
};

// Iterative four-connected fill: each pixel is queued once, with a bounded
// typed-array queue (no recursive call stack or unbounded JS point objects).
export function floodPixels(data, width, height, x, y, replacement, tolerance = 22, coverage = null) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const origin = (y * width + x) * 4;
  const target = Array.from(data.slice(origin, origin + 4));
  if (replacement.every((n, i) => n === target[i])) return false;
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 1;
  queue[0] = y * width + x; visited[queue[0]] = 1;
  const enqueue = (index) => { if (!visited[index]) { visited[index] = 1; queue[tail++] = index; } };
  while (head < tail) {
    const index = queue[head++], p = index * 4;
    const matches = Math.abs(data[p + 3] - target[3]) <= tolerance &&
      (target[3] === 0 || [0, 1, 2].every((c) => Math.abs(data[p + c] - target[c]) <= tolerance));
    if (!matches) continue;
    data.set(replacement, p);
    if (coverage) coverage[index] = 1;
    if (index % width > 0) enqueue(index - 1);
    if (index % width < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < width * (height - 1)) enqueue(index + width);
  }
  return true;
}

const surface = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
};
const context = (canvas) => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser could not open a drawing canvas.');
  return ctx;
};
function pigment(width, height, ink, originX, originY, baseWidth, baseHeight) {
  // Half-resolution pigment and Bayer-8 cells inherit the field lab's crisp
  // sand treatment, while masks and exported geometry retain full resolution.
  const canvas = surface(Math.ceil(width / 2), Math.ceil(height / 2)), ctx = context(canvas);
  const image = ctx.createImageData(canvas.width, canvas.height), a = rgb(ink.colorA), b = rgb(ink.colorB);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const factor = smooth((gradientAt((originX + x * 2) / baseWidth, (originY + y * 2) / baseHeight, ink.gradient, baseWidth / baseHeight) - 0.04) / 0.92);
      const grain = ink.material === 'sand' ? ink.grain : 0;
      const wx = Math.floor(originX / 2) + x, wy = Math.floor(originY / 2) + y;
      const sand = 0.66 + hash(wx, wy) * 0.52;
      const sparkle = Math.pow(hash(wx + 91, wy + 71), 10) * 32 * grain;
      const shade = 1 + (0.76 + sand * 0.34 - 1) * grain;
      const threshold = (BAYER[((wy % 8 + 8) % 8) * 8 + ((wx % 8 + 8) % 8)] / 64 - 0.5) * grain;
      const p = (y * canvas.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const value = (a[c] + (b[c] - a[c]) * factor) * shade + sparkle;
        image.data[p + c] = clamp(ink.material === 'sand' ? Math.round(value / 12 + threshold) * 12 : Math.round(value), 0, 255);
      }
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export class PopcanEngine {
  constructor(canvas, preview, onChange = () => {}) {
    this.canvas = canvas; this.preview = preview; this.onChange = onChange;
    this.ctx = context(canvas); this.previewCtx = context(preview);
    this.mask = surface(1200, 800); this.maskCtx = context(this.mask);
    this.tint = surface(1200, 800); this.tintCtx = context(this.tint);
    this.originX = 0; this.originY = 0; this.baseWidth = 1200; this.baseHeight = 800;
    this.paper = PAPERS.midnight; this.hasInk = false; this.history = []; this.index = -1;
    this.frame = 0; this.stroke = null; this.texture = null; this.textureKey = '';
    this.objects = []; this.selectedId = null; this.drag = null; this.nextId = 1;
    this.destroyed = false; this.objectBlobs = new WeakMap();
    this.resize(1200, 800); this.commit();
  }
  resize(width, height) {
    this.width = width; this.height = height;
    [this.canvas, this.preview, this.mask, this.tint].forEach((c) => { c.width = width; c.height = height; });
    this.textureKey = ''; this.canvas.style.visibility = '';
  }
  state(committed = false) {
    if (committed) { const { objects, ...data } = this.history[this.index]; return data; }
    return { width: this.width, height: this.height, originX: this.originX, originY: this.originY,
      baseWidth: this.baseWidth, baseHeight: this.baseHeight, paper: this.paper, hasInk: this.hasInk,
      canUndo: this.index > 0, canRedo: this.index < this.history.length - 1,
      objectCount: this.objects.length, selection: this.selection() };
  }
  emit() { this.onChange(this.state()); }
  commit() {
    checkObjects(this.objects);
    this.hasInk = this.objects.length > 0;
    const snapshot = { ...this.state(), selection: null, objects: this.objects.slice() };
    this.history.splice(this.index + 1); this.history.push(snapshot);
    // Shared immutable assets make moves cheap. Count each retained bitmap once,
    // with a finite metadata history as well as the 40 MiB pixel budget.
    while (this.history.length > 2 && (this.history.length > 100
      || objectBytes(this.history.flatMap((item) => item.objects)) > HISTORY_BYTES)) this.history.shift();
    this.index = this.history.length - 1; this.emit();
  }
  travel(delta) {
    this.cancel();
    const index = this.index + delta;
    if (index < 0 || index >= this.history.length) return;
    this.index = index;
    this.loadSnapshot(this.history[index]); this.emit();
  }
  loadSnapshot(item) {
    this.originX = item.originX; this.originY = item.originY;
    this.baseWidth = item.baseWidth; this.baseHeight = item.baseHeight;
    if (this.width !== item.width || this.height !== item.height) this.resize(item.width, item.height);
    this.objects = item.objects.slice(); this.paper = item.paper; this.hasInk = this.objects.length > 0;
    if (!this.objects.some((object) => object.id === this.selectedId)) this.selectedId = null;
    this.paintObjects();
    this.textureKey = '';
  }
  local(point) { return { ...point, x: point.x - this.originX, y: point.y - this.originY }; }
  ensureBounds(bounds) {
    const next = expandedBounds(this, bounds);
    if (next.width === this.width && next.height === this.height) return;
    // Allocate before mutating. Existing pixels are copied, never resampled.
    const paint = surface(next.width, next.height), mask = surface(next.width, next.height);
    const dx = this.originX - next.originX, dy = this.originY - next.originY;
    context(paint).drawImage(this.canvas, dx, dy); context(mask).drawImage(this.mask, dx, dy);
    this.resize(next.width, next.height); this.originX = next.originX; this.originY = next.originY;
    this.ctx.drawImage(paint, 0, 0); this.maskCtx.drawImage(mask, 0, 0);
    paint.width = mask.width = 0;
    if (this.stroke && this.stroke.ink.tool !== 'eraser') this.getTexture(this.stroke.ink);
    if (this.stroke) this.canvas.style.visibility = 'hidden';
    this.onChange(this.state(), true);
  }
  newDocument(format, paper) {
    this.cancel(); const [w, h] = FORMATS[format] || FORMATS.landscape;
    this.originX = 0; this.originY = 0; this.baseWidth = w; this.baseHeight = h;
    this.objects = []; this.selectedId = null;
    this.resize(w, h); this.paper = PAPERS[paper] || PAPERS.midnight; this.hasInk = false; this.commit();
  }
  setPaper(paper) { if (paper === this.paper) return; this.cancel(); this.paper = paper; this.commit(); }
  getTexture(ink) {
    const key = [this.width, this.height, this.originX, this.originY, ink.colorA, ink.colorB, ink.gradient, ink.material, ink.grain].join(':');
    if (key !== this.textureKey) { this.texture = pigment(this.width, this.height, ink, this.originX, this.originY, this.baseWidth, this.baseHeight); this.textureKey = key; }
    return this.texture;
  }
  start(point, settings) {
    this.cancel();
    const ink = { ...DEFAULT_INK, ...settings };
    if (ink.tool === 'select') { this.beginMove(point, settings.hitTolerance); return; }
    this.selectedId = null; this.onChange(this.state(), true);
    if (ink.tool === 'fill') { this.fill(point, ink.colorA); return; }
    if (ink.tool === 'pick' || ink.tool === 'hand' || ink.tool === 'text') return;
    this.stroke = { ink, start: point, last: point, bounds: null };
    if (ink.tool !== 'eraser') this.ensureBounds({ left: point.x - ink.size, top: point.y - ink.size, right: point.x + ink.size, bottom: point.y + ink.size });
    if (ink.tool !== 'eraser') this.getTexture(ink);
    this.maskCtx.clearRect(0, 0, this.width, this.height);
    this.canvas.style.visibility = 'hidden';
    if (ink.tool === 'brush' || ink.tool === 'eraser') this.stamp(point);
    this.render();
  }
  stamp(point) {
    const size = this.stroke.ink.size;
    const bounds = { left: point.x - size, top: point.y - size, right: point.x + size, bottom: point.y + size };
    const previous = this.stroke.bounds;
    this.stroke.bounds = previous ? { left: Math.min(previous.left, bounds.left), top: Math.min(previous.top, bounds.top),
      right: Math.max(previous.right, bounds.right), bottom: Math.max(previous.bottom, bounds.bottom) } : bounds;
    point = this.local(point);
    const { ink } = this.stroke, ctx = this.maskCtx;
    const radius = Math.max(0.5, ink.size * (0.35 + point.pressure * 0.65) / 2);
    ctx.globalCompositeOperation = 'source-over';
    if (ink.material === 'sand' && ink.tool === 'brush') {
      const softness = ctx.createRadialGradient(point.x, point.y, radius * 0.65, point.x, point.y, radius);
      softness.addColorStop(0, '#fff'); softness.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = softness;
    } else ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
  }
  move(point, constrain = false) {
    if (this.drag) { this.moveSelection(point, constrain); return; }
    if (!this.stroke) return;
    const { ink, start, last } = this.stroke;
    const end = shapeEnd(start, point, ink.tool, constrain);
    if (ink.tool !== 'eraser') this.ensureBounds({ left: Math.min(start.x, end.x) - ink.size, top: Math.min(start.y, end.y) - ink.size,
      right: Math.max(start.x, end.x) + ink.size, bottom: Math.max(start.y, end.y) + ink.size });
    if (ink.tool === 'brush' || ink.tool === 'eraser') {
      const length = Math.hypot(point.x - last.x, point.y - last.y);
      const steps = Math.min(8192, Math.max(1, Math.ceil(length / Math.max(1, ink.size * 0.08))));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        this.stamp({ x: last.x + (point.x - last.x) * t, y: last.y + (point.y - last.y) * t,
          pressure: last.pressure + (point.pressure - last.pressure) * t });
      }
    } else {
      const end = this.local(shapeEnd(start, point, ink.tool, constrain)), localStart = this.local(start), ctx = this.maskCtx;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = ink.size;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
      if (ink.tool === 'line') { ctx.moveTo(localStart.x, localStart.y); ctx.lineTo(end.x, end.y); }
      if (ink.tool === 'rectangle') ctx.rect(localStart.x, localStart.y, end.x - localStart.x, end.y - localStart.y);
      if (ink.tool === 'ellipse') ctx.ellipse((localStart.x + end.x) / 2, (localStart.y + end.y) / 2,
        Math.max(0.5, Math.abs(end.x - localStart.x) / 2), Math.max(0.5, Math.abs(end.y - localStart.y) / 2), 0, 0, Math.PI * 2);
      if (ink.filled && ink.tool !== 'line') ctx.fill(); else ctx.stroke();
    }
    this.stroke.last = point;
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  render() {
    if (!this.stroke) return;
    const { ink } = this.stroke, ctx = this.previewCtx;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height); ctx.drawImage(this.canvas, 0, 0);
    ctx.globalAlpha = ink.opacity;
    if (ink.tool === 'eraser') {
      // Erase each affected object, not the merged page, so the hole moves
      // with its object. The preview uses the same compositing as commit.
      ctx.globalAlpha = 1; ctx.clearRect(0, 0, this.width, this.height);
      for (const object of this.objects) {
        const x = object.x - this.originX, y = object.y - this.originY;
        if (!intersects(objectBounds(object), this.stroke.bounds)) { ctx.drawImage(object.bitmap, x, y); continue; }
        const tint = this.tintCtx; tint.globalCompositeOperation = 'source-over'; tint.globalAlpha = 1;
        tint.clearRect(0, 0, this.width, this.height); tint.drawImage(object.bitmap, x, y);
        tint.globalCompositeOperation = 'destination-out'; tint.globalAlpha = ink.opacity; tint.drawImage(this.mask, 0, 0);
        tint.globalAlpha = 1; tint.globalCompositeOperation = 'source-over'; ctx.drawImage(this.tint, 0, 0);
      }
    } else {
      const tint = this.tintCtx;
      tint.globalCompositeOperation = 'source-over'; tint.clearRect(0, 0, this.width, this.height);
      tint.drawImage(this.mask, 0, 0); tint.globalCompositeOperation = 'source-in'; tint.imageSmoothingEnabled = false;
      tint.drawImage(this.texture, 0, 0, this.width, this.height); ctx.drawImage(this.tint, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  finish() {
    if (this.drag) {
      const { original } = this.drag, selected = this.objects.find((item) => item.id === original.id);
      const moved = selected.x !== original.x || selected.y !== original.y;
      this.drag = null;
      if (moved) this.commit();
      else { this.loadSnapshot(this.history[this.index]); this.onChange(this.state(), true); }
      return;
    }
    if (!this.stroke) return;
    cancelAnimationFrame(this.frame); this.frame = 0; this.render();
    const { ink } = this.stroke;
    try {
      if (ink.tool === 'eraser') {
        const objects = this.objects.map((object) => {
          if (!intersects(objectBounds(object), this.stroke.bounds)) return object;
          const bitmap = surface(object.bitmap.width, object.bitmap.height), ctx = context(bitmap);
          ctx.drawImage(object.bitmap, 0, 0); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = ink.opacity;
          ctx.drawImage(this.mask, this.originX - object.x, this.originY - object.y);
          const erased = this.captureObject(bitmap, object.x, object.y, object.kind, 1, object.id);
          return erased;
        }).filter(Boolean);
        this.objects = objects;
      } else {
        const object = this.captureObject(this.tint, this.originX, this.originY, ink.tool, ink.opacity);
        if (object) { const objects = [...this.objects, object]; checkObjects(objects); this.objects = objects; this.selectedId = object.id; }
      }
      this.paintObjects(); this.commit(); this.stroke = null; this.cancel();
    } catch (failure) { this.cancel(); throw failure; }
  }
  cancel() {
    const active = this.stroke || this.drag;
    if (active) this.loadSnapshot(this.history[this.index]);
    cancelAnimationFrame(this.frame); this.frame = 0; this.stroke = null; this.drag = null;
    this.previewCtx.clearRect(0, 0, this.width, this.height); this.canvas.style.visibility = '';
    if (active) this.onChange(this.state(), true);
  }
  fill(point, color) {
    this.cancel(); point = this.local(point);
    if (point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) throw new Error('Draw an outline here first. Fill operates inside the current canvas bounds.');
    const image = this.ctx.getImageData(0, 0, this.width, this.height), coverage = new Uint8Array(this.width * this.height);
    if (floodPixels(image.data, this.width, this.height, point.x, point.y, [...rgb(color), 255], 22, coverage)) {
      for (let i = 0; i < coverage.length; i++) if (!coverage[i]) image.data.fill(0, i * 4, i * 4 + 4);
      const bitmap = surface(this.width, this.height); context(bitmap).putImageData(image, 0, 0);
      this.appendObject(this.captureObject(bitmap, this.originX, this.originY, 'fill'));
    }
  }
  pick(point) {
    point = this.local(point);
    if (point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) return this.paper === 'transparent' ? null : this.paper;
    const p = this.ctx.getImageData(clamp(Math.floor(point.x), 0, this.width - 1), clamp(Math.floor(point.y), 0, this.height - 1), 1, 1).data;
    if (!p[3] && this.paper === 'transparent') return null;
    const backdrop = this.paper === 'transparent' ? [255, 255, 255] : rgb(this.paper);
    return colorHex(backdrop.map((n, c) => p[c] * p[3] / 255 + n * (1 - p[3] / 255)));
  }
  placeImage(image) {
    this.cancel();
    const scale = Math.min(this.width / image.naturalWidth, this.height / image.naturalHeight);
    const w = Math.max(1, Math.round(image.naturalWidth * scale)), h = Math.max(1, Math.round(image.naturalHeight * scale));
    const bitmap = surface(w, h); context(bitmap).drawImage(image, 0, 0, w, h);
    this.appendObject(this.captureObject(bitmap, this.originX + Math.round((this.width - w) / 2),
      this.originY + Math.round((this.height - h) / 2), 'image'));
  }
  addText(point, value, options) {
    this.cancel();
    const lines = textLines(value), settings = textSettings(options);
    if (!value.trim()) return false;
    const font = `${settings.bold ? 700 : 400} ${settings.size}px ${TEXT_FONTS[settings.font]}`;
    this.ctx.font = font; this.ctx.textBaseline = 'top'; this.ctx.textAlign = 'left';
    const metrics = lines.map((line) => this.ctx.measureText(line));
    const inset = settings.size * 0.3 + 3;
    const width = Math.max(...metrics.map((m) => Math.max(m.width, m.actualBoundingBoxRight || 0)));
    const height = lines.length * settings.size * 1.3;
    try {
    this.ensureBounds({ left: point.x - inset, top: point.y - inset, right: point.x + width + inset, bottom: point.y + height + inset });
    const local = this.local(point), ctx = this.tintCtx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save(); ctx.font = font; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillStyle = settings.color; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    lines.forEach((line, i) => ctx.fillText(line, local.x, local.y + i * settings.size * 1.3));
    ctx.restore(); this.appendObject(this.captureObject(this.tint, this.originX, this.originY, 'text')); return true;
    } catch (failure) { this.loadSnapshot(this.history[this.index]); this.onChange(this.state(), true); throw failure; }
  }
  async restore(image, draft) {
    if (!validSize(draft.width, draft.height) || image.naturalWidth !== draft.width || image.naturalHeight !== draft.height) throw new Error('Invalid draft size.');
    const originX = draft.originX ?? 0, originY = draft.originY ?? 0;
    if (![originX, originY].every((value) => Number.isInteger(value) && Math.abs(value) <= WORLD_LIMIT)) throw new Error('Invalid draft origin.');
    if (Math.abs(originX + draft.width) > WORLD_LIMIT || Math.abs(originY + draft.height) > WORLD_LIMIT) throw new Error('Invalid draft bounds.');
    let objects = [], recovered = false;
    if (draft.version === 2) {
      try {
        validateObjectRecords(draft.objects, { ...draft, originX, originY });
        if (Boolean(draft.hasInk) !== Boolean(draft.objects.length)) throw new Error('Missing saved objects.');
        for (const item of draft.objects) {
          await checkObjectPng(item);
          const image = await loadImage(item.blob);
          if (this.destroyed) return;
          const bitmap = surface(item.width, item.height); context(bitmap).drawImage(image, 0, 0);
          objects.push({ id: item.id, kind: item.kind, x: item.x, y: item.y, bitmap });
          this.objectBlobs.set(bitmap, Promise.resolve(item.blob));
        }
      } catch { objects = []; recovered = true; }
    }
    if (this.destroyed) return;
    if (draft.version !== 2 || recovered) {
      const bitmap = surface(draft.width, draft.height); context(bitmap).drawImage(image, 0, 0);
      const object = this.captureObject(bitmap, originX, originY, 'legacy');
      if (object) objects = [object];
    }
    this.objects = objects; this.nextId = Math.max(this.nextId, ...objects.map((item) => item.id + 1)); this.selectedId = null;
    this.originX = originX; this.originY = originY;
    this.baseWidth = validSize(draft.baseWidth, draft.baseHeight) ? draft.baseWidth : draft.width;
    this.baseHeight = validSize(draft.baseWidth, draft.baseHeight) ? draft.baseHeight : draft.height;
    this.resize(draft.width, draft.height);
    this.paper = Object.values(PAPERS).includes(draft.paper) ? draft.paper : PAPERS.midnight;
    this.paintObjects(); this.history = []; this.index = -1; this.commit();
    return recovered ? 'Saved artwork recovered as one movable layer.' : objects.some((item) => item.kind === 'legacy')
      ? 'Earlier artwork is one movable layer. New marks can be selected separately.' : 'Your last canvas is back.';
  }
  selection() {
    const item = this.objects.find((object) => object.id === this.selectedId);
    return item ? { id: item.id, kind: item.kind, x: item.x, y: item.y, width: item.bitmap.width, height: item.bitmap.height } : null;
  }
  select(id) {
    this.selectedId = this.objects.some((item) => item.id === id) ? id : null;
    this.onChange(this.state(), true);
  }
  cycleSelection(direction) {
    this.cancel(); if (!this.objects.length) return;
    const index = this.objects.findIndex((item) => item.id === this.selectedId);
    const next = index < 0 ? (direction > 0 ? 0 : this.objects.length - 1) : (index + direction + this.objects.length) % this.objects.length;
    this.select(this.objects[next].id);
  }
  hitTest(point, tolerance = 4) {
    const radius = clamp(Number.isFinite(tolerance) ? Math.ceil(tolerance) : 4, 0, 32);
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const item = this.objects[i], x = Math.floor(point.x - item.x), y = Math.floor(point.y - item.y);
      const left = Math.max(0, x - radius), top = Math.max(0, y - radius);
      const right = Math.min(item.bitmap.width, x + radius + 1), bottom = Math.min(item.bitmap.height, y + radius + 1);
      if (right <= left || bottom <= top) continue;
      const pixels = context(item.bitmap).getImageData(left, top, right - left, bottom - top).data;
      for (let p = 3; p < pixels.length; p += 4) if (pixels[p] > 0) return item;
    }
    return null;
  }
  beginMove(point, tolerance) {
    let item = this.hitTest(point, tolerance);
    const selected = this.objects.find((object) => object.id === this.selectedId);
    if (!item && selected && point.x >= selected.x && point.y >= selected.y
      && point.x < selected.x + selected.bitmap.width && point.y < selected.y + selected.bitmap.height) item = selected;
    this.select(item?.id ?? null);
    if (item) this.drag = { original: item, start: point };
  }
  moveSelection(point, constrain = false) {
    if (!this.drag || ![point.x, point.y].every(Number.isFinite)) return;
    const { original, start } = this.drag;
    let dx = Math.round(point.x - start.x), dy = Math.round(point.y - start.y);
    if (constrain) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
    const moved = { ...original, x: original.x + dx, y: original.y + dy };
    this.ensureBounds(objectBounds(moved));
    this.objects = this.objects.map((item) => item.id === original.id ? moved : item);
    this.paintObjects(); this.onChange(this.state(), true);
  }
  nudge(dx, dy) {
    this.cancel(); const item = this.objects.find((object) => object.id === this.selectedId);
    if (!item) return;
    this.drag = { original: item, start: { x: 0, y: 0 } };
    try { this.moveSelection({ x: dx, y: dy }); this.finish(); }
    catch (failure) { this.cancel(); throw failure; }
  }
  deleteSelection() {
    this.cancel(); if (!this.selection()) return;
    this.objects = this.objects.filter((item) => item.id !== this.selectedId); this.selectedId = null;
    this.paintObjects(); this.commit();
  }
  captureObject(canvas, x, y, kind, opacity = 1, id = this.nextId++) {
    const ctx = context(canvas), pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bounds = alphaBounds(pixels.data, canvas.width, canvas.height);
    if (!bounds) return null;
    const bitmap = surface(bounds.width, bounds.height), output = context(bitmap);
    output.globalAlpha = opacity;
    output.drawImage(canvas, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    return { id, kind, x: Math.round(x + bounds.left), y: Math.round(y + bounds.top), bitmap };
  }
  appendObject(object) {
    if (!object) return;
    const objects = [...this.objects, object]; checkObjects(objects);
    this.objects = objects; this.selectedId = object.id; this.paintObjects(); this.commit();
  }
  paintObjects(ctx = this.ctx, snapshot = this) {
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, snapshot.width, snapshot.height);
    for (const item of snapshot.objects) ctx.drawImage(item.bitmap, item.x - snapshot.originX, item.y - snapshot.originY);
  }
  bitmapBlob(bitmap) {
    if (!this.objectBlobs.has(bitmap)) {
      const pending = new Promise((resolve, reject) => bitmap.toBlob((blob) => {
        if (blob) resolve(blob); else { this.objectBlobs.delete(bitmap); reject(new Error('Could not save an object.')); }
      }, 'image/png'));
      this.objectBlobs.set(bitmap, pending);
    }
    return this.objectBlobs.get(bitmap);
  }
  async draft() {
    // Capture one committed snapshot before awaiting PNG encodes. Selection and
    // drag previews are not document changes and never enter saved/exported data.
    const snapshot = this.history[this.index], { objects, ...data } = snapshot;
    const blob = await this.blob(false, snapshot), records = [];
    for (const item of objects) records.push({ id: item.id, kind: item.kind, x: item.x, y: item.y,
      width: item.bitmap.width, height: item.bitmap.height, blob: await this.bitmapBlob(item.bitmap) });
    return { ...data, version: 2, objects: records, blob };
  }
  blob(includePaper = false, snapshot = this.history[this.index]) {
    const output = surface(snapshot.width, snapshot.height), ctx = context(output);
    this.paintObjects(ctx, snapshot);
    if (includePaper && snapshot.paper !== 'transparent') { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = snapshot.paper; ctx.fillRect(0, 0, snapshot.width, snapshot.height); }
    return new Promise((resolve, reject) => output.toBlob((blob) => {
      output.width = output.height = 0;
      if (blob) resolve(blob); else reject(new Error('Could not create a PNG.'));
    }, 'image/png'));
  }
  destroy() {
    this.onChange = () => {}; this.cancel(); this.destroyed = true; this.history = []; this.objects = []; this.texture = null;
    this.mask.width = this.tint.width = 0; this.objectBlobs = new WeakMap();
  }
}
