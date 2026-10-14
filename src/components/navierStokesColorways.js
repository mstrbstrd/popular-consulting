// Display-only materials. Original is still the exact approved RGB shader.
// Art palettes use six encoded Oklab stops, then two sRGB core-marker colors.
// No palette data is read by the solver, clock, or core-position model.
const ORIGINAL = [
  [0.04,0.79,0.90], [1.0,0.29,0.07], [0.40,0.09,0.86], [0.73,0.94,1.0],
  [0.035,0.025,0.08], [0.62,0.78,0.90], [0.85,0.98,1.0], [0.10,0.035,0.20],
];

// Slots: shadow, body, crest, counterpoint, secondary hue, luminous veil.
// Saturated counterpoints are localized by the material shader, not averaged
// into the whole fluid. Values and hue proportions differ for every material.
const COLORWAYS = [
  { id: "eclipse-bloom", label: "Eclipse Bloom", description: "Indigo velvet, orchid currents, acid-gold seams", harmony: "Violet / chartreuse counterpoint",
    stops: ["#100e2c", "#5624bf", "#d945aa", "#dfed50", "#4788ea", "#fff1bd"], cores: ["#fff1bd", "#21152f"] },
  { id: "verdigris-ember", label: "Verdigris Ember", description: "Malachite patina, burnt copper, warm bone", harmony: "Mineral greens / oxidized copper",
    stops: ["#082e33", "#297d6d", "#9bcbb0", "#d96138", "#ad693d", "#f5e0b9"], cores: ["#ffe1ac", "#193932"] },
  { id: "opaline-static", label: "Opaline Static", description: "Ink-blue opal, lilac, rose and mint interference", harmony: "Cool pearl / warm opal flashes",
    stops: ["#1b243c", "#687bc2", "#c395d2", "#f3bda8", "#66cecb", "#f8f2e4"], cores: ["#fff5ee", "#32324d"] },
  { id: "saffron-nocturne", label: "Saffron Nocturne", description: "Midnight cobalt, smoked plum, saffron silk", harmony: "Blue / amber with plum bridges",
    stops: ["#071d46", "#421c4d", "#eaa134", "#e98691", "#ba471e", "#ffe5a6"], cores: ["#ffe5a6", "#341b35"] },
  { id: "abyssal-coral", label: "Abyssal Coral", description: "Petrol depths, electric jade, living coral", harmony: "Blue-green / coral, lavender edges",
    stops: ["#062b39", "#067987", "#4fe9cf", "#ff735f", "#9693df", "#d4f7ea"], cores: ["#d4f7ea", "#0a3346"] },
  { id: "mercury-garden", label: "Mercury Garden", description: "Graphite, celadon silver, wine and peach glints", harmony: "Muted celadon / wine, peach light",
    stops: ["#1a2929", "#708a71", "#d8dbbd", "#f3aa8a", "#76264f", "#f4e9d4"], cores: ["#fff0d9", "#26362d"] },
];

const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
// W3C CSS Color 4 / Oklab matrices. Calculate once at module initialization,
// not per pixel. Bias the signed a/b axes so all uploaded values stay in [0,1].
export const encodeNavierOklab = color => {
  const [r, g, b] = color.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return [0.2104542553*l + 0.793617785*m - 0.0040720468*s,
    0.5 + 1.9779984951*l - 2.428592205*m + 0.4505937099*s,
    0.5 + 0.0259040371*l + 0.7827717662*m - 0.808675766*s];
};

const originalSwatches = ORIGINAL.slice(0, 3).map(color => `rgb(${color.map(c => Math.round(c * 255)).join(", ")})`);
export const NAVIER_COLORWAYS = Object.freeze([
  { id: "original", label: "Original", description: "Turquoise, ember and violet", harmony: "The original fluid", colors: ORIGINAL.flat(), swatches: originalSwatches, fallback: originalSwatches },
  ...COLORWAYS.map(option => ({ ...option,
    colors: [...option.stops.flatMap(hex => encodeNavierOklab(rgb(hex))), ...option.cores.flatMap(rgb)],
    swatches: option.stops, fallback: [option.stops[1], option.stops[3], option.stops[4]],
  })),
].map((option, index) => Object.freeze({
  id: option.id, label: option.label, description: option.description, harmony: option.harmony, index,
  colors: Object.freeze(option.colors), swatches: Object.freeze(option.swatches),
  gradient: `linear-gradient(120deg, ${option.swatches.join(", ")})`,
  cssVariables: Object.freeze(Object.fromEntries(option.fallback.map((color, i) => [`--navier-ink-${i}`, color]))),
})));

// Exact allowlist, without arbitrary input coercion or property indexing.
export const getNavierColorway = value =>
  NAVIER_COLORWAYS.find(colorway => colorway.id === value) || NAVIER_COLORWAYS[0];
