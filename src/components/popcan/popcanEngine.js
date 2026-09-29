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
export function floodPixels(data, width, height, x, y, replacement, tolerance = 22) {
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
    this.resize(1200, 800); this.commit();
  }
  resize(width, height) {
    this.width = width; this.height = height;
    [this.canvas, this.preview, this.mask, this.tint].forEach((c) => { c.width = width; c.height = height; });
    this.textureKey = ''; this.canvas.style.visibility = '';
  }
  state(committed = false) {
    if (committed) { const { pixels, ...data } = this.history[this.index]; return data; }
    return { width: this.width, height: this.height, originX: this.originX, originY: this.originY,
      baseWidth: this.baseWidth, baseHeight: this.baseHeight, paper: this.paper, hasInk: this.hasInk,
      canUndo: this.index > 0, canRedo: this.index < this.history.length - 1 };
  }
  emit() { this.onChange(this.state()); }
  commit() {
    const snapshot = { ...this.state(), pixels: this.ctx.getImageData(0, 0, this.width, this.height) };
    this.history.splice(this.index + 1);
    this.history.push(snapshot);
    let bytes = this.history.reduce((total, item) => total + item.pixels.data.byteLength, 0);
    while (this.history.length > 2 && bytes > HISTORY_BYTES) bytes -= this.history.shift().pixels.data.byteLength;
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
    this.ctx.putImageData(item.pixels, 0, 0); this.paper = item.paper; this.hasInk = item.hasInk;
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
    if (ink.tool === 'fill') { this.fill(point, ink.colorA); return; }
    if (ink.tool === 'pick' || ink.tool === 'hand' || ink.tool === 'text') return;
    this.stroke = { ink, start: point, last: point };
    if (ink.tool !== 'eraser') this.ensureBounds({ left: point.x - ink.size, top: point.y - ink.size, right: point.x + ink.size, bottom: point.y + ink.size });
    if (ink.tool !== 'eraser') this.getTexture(ink);
    this.maskCtx.clearRect(0, 0, this.width, this.height);
    this.canvas.style.visibility = 'hidden';
    if (ink.tool === 'brush' || ink.tool === 'eraser') this.stamp(point);
    this.render();
  }
  stamp(point) {
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
      ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(this.mask, 0, 0);
    } else {
      const tint = this.tintCtx;
      tint.globalCompositeOperation = 'source-over'; tint.clearRect(0, 0, this.width, this.height);
      tint.drawImage(this.mask, 0, 0); tint.globalCompositeOperation = 'source-in'; tint.imageSmoothingEnabled = false;
      tint.drawImage(this.texture, 0, 0, this.width, this.height); ctx.drawImage(this.tint, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  finish() {
    if (!this.stroke) return;
    cancelAnimationFrame(this.frame); this.frame = 0; this.render();
    this.ctx.clearRect(0, 0, this.width, this.height); this.ctx.drawImage(this.preview, 0, 0);
    if (this.stroke.ink.tool !== 'eraser') this.hasInk = true;
    this.commit(); this.stroke = null; this.cancel();
  }
  cancel() {
    const changedBounds = this.history[this.index] && (this.width !== this.history[this.index].width || this.height !== this.history[this.index].height);
    if (this.stroke) { this.loadSnapshot(this.history[this.index]); if (changedBounds) this.onChange(this.state(), true); }
    cancelAnimationFrame(this.frame); this.frame = 0; this.stroke = null;
    this.previewCtx.clearRect(0, 0, this.width, this.height); this.canvas.style.visibility = '';
  }
  fill(point, color) {
    point = this.local(point);
    if (point.x < 0 || point.y < 0 || point.x >= this.width || point.y >= this.height) throw new Error('Draw an outline here first. Fill operates inside the current canvas bounds.');
    const image = this.ctx.getImageData(0, 0, this.width, this.height);
    if (floodPixels(image.data, this.width, this.height, point.x, point.y, [...rgb(color), 255])) {
      this.ctx.putImageData(image, 0, 0); this.hasInk = true; this.commit();
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
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    this.ctx.drawImage(image, (this.width - w) / 2, (this.height - h) / 2, w, h);
    this.hasInk = true; this.commit();
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
    const local = this.local(point);
    this.ctx.save(); this.ctx.font = font; this.ctx.textBaseline = 'top'; this.ctx.textAlign = 'left';
    this.ctx.fillStyle = settings.color; this.ctx.globalAlpha = 1; this.ctx.globalCompositeOperation = 'source-over';
    lines.forEach((line, i) => this.ctx.fillText(line, local.x, local.y + i * settings.size * 1.3));
    this.ctx.restore(); this.hasInk = true; this.commit(); return true;
    } catch (failure) { this.loadSnapshot(this.history[this.index]); this.onChange(this.state(), true); throw failure; }
  }
  restore(image, draft) {
    if (!validSize(draft.width, draft.height) || image.naturalWidth !== draft.width || image.naturalHeight !== draft.height) throw new Error('Invalid draft size.');
    const originX = draft.originX ?? 0, originY = draft.originY ?? 0;
    if (![originX, originY].every((value) => Number.isInteger(value) && Math.abs(value) <= WORLD_LIMIT)) throw new Error('Invalid draft origin.');
    if (Math.abs(originX + draft.width) > WORLD_LIMIT || Math.abs(originY + draft.height) > WORLD_LIMIT) throw new Error('Invalid draft bounds.');
    this.originX = originX; this.originY = originY;
    this.baseWidth = validSize(draft.baseWidth, draft.baseHeight) ? draft.baseWidth : draft.width;
    this.baseHeight = validSize(draft.baseWidth, draft.baseHeight) ? draft.baseHeight : draft.height;
    this.resize(draft.width, draft.height);
    this.paper = Object.values(PAPERS).includes(draft.paper) ? draft.paper : PAPERS.midnight;
    this.ctx.drawImage(image, 0, 0, this.width, this.height); this.hasInk = Boolean(draft.hasInk);
    this.history = []; this.index = -1; this.commit();
  }
  blob(includePaper = false) {
    const snapshot = this.history[this.index];
    const output = surface(snapshot.width, snapshot.height), ctx = context(output);
    ctx.putImageData(snapshot.pixels, 0, 0);
    if (includePaper && snapshot.paper !== 'transparent') { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = snapshot.paper; ctx.fillRect(0, 0, snapshot.width, snapshot.height); }
    return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create a PNG.')), 'image/png'));
  }
  destroy() { this.onChange = () => {}; this.cancel(); this.history = []; this.texture = null; }
}
