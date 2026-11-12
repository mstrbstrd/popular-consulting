import React from 'react';
import { hasHardwareWebGL, isMobileTier } from '../utils/deviceTier';

// Liquid-glass refraction for signed-in chrome (Orb, Home). Chromium only.
//
// iOS Liquid Glass reads as a thick lens: near the rim the backdrop bends
// inward and splits slightly by wavelength. Chromium can reproduce this with an
// SVG filter in `backdrop-filter`. The displacement map is built once per element
// size/radius from the rounded-rect distance field, so the bend follows the
// element's real shape. Other browsers keep the clear-glass CSS fallback.
//
// Cost is bounded: a map is generated only on size change (cached by size), the
// number of cached filters and the element area are capped, and the feature is
// off for mobile/software rendering, reduced transparency, increased contrast and
// forced colours. No canvas is mounted; maps are encoded off-DOM.

// Each page passes its own module-level lists: controls bend gently, panels
// (menus, cards) a little more with a frosted interior.
export const ORB_REFRACTION_TARGETS = [
  '.nav-pill',
  '.metabloom-chat__composer',
  '.metabloom-reactions__toolbar > button',
  '.metabloom-chat__research-toggle',
  '.metabloom-chat__latest',
  '.orb-appearance__trigger',
  '.metabloom-threads__dock[data-expanded="false"]',
  '.metabloom-threads__floating .metabloom-threads__trigger',
];
export const ORB_REFRACTION_MENUS = [
  '.metabloom-reactions__panel[open]',
  '.orb-appearance__dialog[open]',
  '.workspace-menu[open] .workspace-menu-panel',
  '.site-account-menu[open] .site-account-panel',
];
// SVG backdrop filters are re-rendered every frame the backdrop changes, and the
// signed-in pages sit over live WebGL fields. Measured on Home: lensing four
// ~180k px cards halved the frame rate (59 -> 30 fps) while scrolling and froze
// the background, while small controls cost nothing measurable. Persistent
// surfaces therefore get the lens only up to a control-sized area; transient
// menus may be larger because they are on screen briefly.
export const MAX_PERSISTENT_LENS_AREA = 60000;
const MAX_AREA = 600000;
const MAX_FILTERS = 32;

// Signed distance to a rounded rectangle (negative inside), plus its outward normal.
export function roundedRectField(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const px = x - width / 2;
  const py = y - height / 2;
  const qx = Math.abs(px) - (width / 2 - r);
  const qy = Math.abs(py) - (height / 2 - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const distance = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
  let nx;
  let ny;
  if (qx > 0 && qy > 0) {
    const length = Math.hypot(qx, qy) || 1;
    nx = qx / length; ny = qy / length;
  } else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
  return { distance, nx: Math.sign(px || 1) * nx, ny: Math.sign(py || 1) * ny };
}

// RGBA displacement map: R/G encode an inward vector whose magnitude follows a
// circular bezel profile (flat centre, steep rim), 128 = no displacement.
export function buildLensMap(width, height, radius, bezel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const { distance, nx, ny } = roundedRectField(x + 0.5, y + 0.5, width, height, radius);
      const inside = -distance;
      let magnitude = 0;
      if (inside >= 0 && inside < bezel) {
        const t = 1 - inside / bezel;
        magnitude = 1 - Math.sqrt(Math.max(0, 1 - t * t));
      }
      data[i] = Math.round(128 - 127 * nx * magnitude);
      data[i + 1] = Math.round(128 - 127 * ny * magnitude);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

export const lensGeometry = ({ width, height, radius, menu }) => {
  const r = Math.min(radius, width / 2, height / 2);
  // iOS bends only the rim: a narrow bezel and a modest offset keep the
  // centre of the control optically flat and its label undistorted.
  const bezel = Math.max(6, Math.min(menu ? 18 : 12, r || 12, Math.min(width, height) / 2.5));
  const offset = Math.min(menu ? 10 : 7, bezel * 0.7);
  return { r, bezel, scale: offset * 2, blur: menu ? 14 : 1.2 };
};

const SVG = 'http://www.w3.org/2000/svg';
const node = (name, attributes, parent) => {
  const element = document.createElementNS(SVG, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  parent?.appendChild(element);
  return element;
};

function encodeMap(width, height, radius, bezel) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  let context = null;
  try { context = canvas.getContext('2d'); } catch { context = null; }
  if (!context) return null;
  context.putImageData(new ImageData(buildLensMap(width, height, radius, bezel), width, height), 0, 0);
  return canvas.toDataURL('image/png');
}

function createFilter(defs, id, width, height, geometry) {
  const href = encodeMap(width, height, geometry.r, geometry.bezel);
  if (!href) return false;
  const filter = node('filter', { id, x: 0, y: 0, width, height, filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, defs);
  node('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: geometry.blur, result: 'soft' }, filter);
  node('feImage', { href, x: 0, y: 0, width, height, preserveAspectRatio: 'none', result: 'lens' }, filter);
  // Slightly different bend per channel: the faint prismatic fringe at the rim.
  [['r', 1.08, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['g', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
    ['b', 0.92, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']].forEach(([channel, factor, matrix]) => {
    node('feDisplacementMap', { in: 'soft', in2: 'lens', scale: (geometry.scale * factor).toFixed(2),
      xChannelSelector: 'R', yChannelSelector: 'G', result: `d${channel}` }, filter);
    node('feColorMatrix', { in: `d${channel}`, type: 'matrix', values: matrix, result: channel }, filter);
  });
  node('feBlend', { in: 'r', in2: 'g', mode: 'screen', result: 'rg' }, filter);
  node('feBlend', { in: 'rg', in2: 'b', mode: 'screen' }, filter);
  return true;
}

const PREFERENCES = ['(prefers-reduced-transparency: reduce)', '(prefers-contrast: more)', '(forced-colors: active)'];
// `?liquid-glass=refraction` forces the lens on (hardware comparison and
// software-rendered verification); `?liquid-glass=off` forces the CSS fallback.
// Accessibility preferences always win.
export const ORB_REFRACTION_QUERY_PARAM = 'liquid-glass';
export const supportsOrbRefraction = (win = window) => {
  if (PREFERENCES.some(query => win.matchMedia?.(query)?.matches)) return false;
  let override = null;
  try { override = new URLSearchParams(win.location?.search || '').get(ORB_REFRACTION_QUERY_PARAM); } catch { override = null; }
  if (override === 'off') return false;
  if (override === 'refraction') return true;
  const brands = win.navigator?.userAgentData?.brands || [];
  const chromium = brands.some(brand => /Chromium/i.test(brand.brand));
  return chromium && hasHardwareWebGL && !isMobileTier
    && !PREFERENCES.some(query => win.matchMedia?.(query)?.matches);
};

export function useLiquidGlassRefraction(rootRef, { controls, panels }) {
  const [enabled, setEnabled] = React.useState(() => supportsOrbRefraction());
  React.useEffect(() => {
    const queries = PREFERENCES.map(query => window.matchMedia?.(query)).filter(Boolean);
    const update = () => setEnabled(supportsOrbRefraction());
    queries.forEach(query => query.addEventListener?.('change', update));
    return () => queries.forEach(query => query.removeEventListener?.('change', update));
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root || typeof ResizeObserver === 'undefined') return undefined;
    const svg = node('svg', { class: 'orb-page__lens-definitions', width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    const defs = node('defs', {}, svg);
    root.appendChild(svg);
    const filters = new Map();
    const tracked = new Set();
    let frame = 0;
    const apply = element => {
      const width = Math.round(element.offsetWidth);
      const height = Math.round(element.offsetHeight);
      const menu = panels.some(selector => element.matches(selector));
      if (!width || !height || width * height > (menu ? MAX_AREA : MAX_PERSISTENT_LENS_AREA)) {
        element.style.removeProperty('--lg-refraction');
        return;
      }
      const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      const geometry = lensGeometry({ width, height, radius, menu });
      const key = `orb-lens-${width}x${height}r${Math.round(geometry.r)}${menu ? 'm' : 'c'}`;
      if (!filters.has(key)) {
        if (filters.size >= MAX_FILTERS) {
          const [oldest] = filters.keys();
          defs.querySelector(`#${oldest}`)?.remove();
          filters.delete(oldest);
        }
        if (!createFilter(defs, key, width, height, geometry)) return;
        filters.set(key, true);
      }
      element.style.setProperty('--lg-refraction', `url(#${key})`);
    };
    const resize = new ResizeObserver(entries => entries.forEach(entry => apply(entry.target)));
    const selector = [...controls, ...panels].join(',');
    const scan = () => {
      frame = 0;
      const current = new Set(root.querySelectorAll(selector));
      tracked.forEach(element => {
        if (current.has(element)) return;
        resize.unobserve(element);
        element.style.removeProperty('--lg-refraction');
        tracked.delete(element);
      });
      current.forEach(element => {
        if (tracked.has(element)) return;
        tracked.add(element);
        resize.observe(element);
        apply(element);
      });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(scan); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'data-expanded'] });
    root.dataset.liquidRefraction = 'on';
    scan();
    return () => {
      window.cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      tracked.forEach(element => element.style.removeProperty('--lg-refraction'));
      delete root.dataset.liquidRefraction;
      svg.remove();
    };
  }, [enabled, rootRef, controls, panels]);
}

export const NAV_REFRACTION_MENUS = [
  '.workspace-menu[open] .workspace-menu-panel',
  '.site-account-menu[open] .site-account-panel',
];
// Card arrows sit inside a lensed card: a nested backdrop filter would only see
// the card's own backdrop root, so they are highlights on the card, not panes.
export const HOME_REFRACTION_TARGETS = ['.nav-pill', '.home-session-action'];
// Home's cards, welcome panel and footer are unfrosted glass panes with no
// backdrop filter at all (see HomeLiquidGlass.css), so they take no lens.
export const HOME_REFRACTION_PANELS = [...NAV_REFRACTION_MENUS];
const HOME_LISTS = Object.freeze({ controls: HOME_REFRACTION_TARGETS, panels: HOME_REFRACTION_PANELS });
export function useHomeLiquidGlass(rootRef) { useLiquidGlassRefraction(rootRef, HOME_LISTS); }

const ORB_LISTS = Object.freeze({ controls: ORB_REFRACTION_TARGETS, panels: ORB_REFRACTION_MENUS });
export default function useOrbLiquidGlass(rootRef) { useLiquidGlassRefraction(rootRef, ORB_LISTS); }
