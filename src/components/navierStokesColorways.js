// Display-only colors. Dye, velocity, core positions and clocks never depend on
// this table. Slot zero preserves the exact original shader constants.
const COLORWAYS = [
  { id: "original", label: "Original", description: "Turquoise, ember and violet", colors: [
    [0.04,0.79,0.90], [1.0,0.29,0.07], [0.40,0.09,0.86], [0.73,0.94,1.0],
    [0.035,0.025,0.08], [0.62,0.78,0.90], [0.85,0.98,1.0], [0.10,0.035,0.20],
  ] },
  { id: "glacier", label: "Glacier", description: "Deep blue, cyan and glacial ice", colors: [
    [0.025,0.20,0.62], [0.02,0.76,0.92], [0.46,0.88,0.93], [0.77,0.96,1.0],
    [0.01,0.035,0.07], [0.44,0.75,0.90], [0.84,0.98,1.0], [0.025,0.08,0.20],
  ] },
  { id: "ember", label: "Ember", description: "Garnet, molten orange and gold", colors: [
    [0.40,0.025,0.07], [1.0,0.23,0.025], [1.0,0.74,0.10], [1.0,0.87,0.55],
    [0.065,0.012,0.01], [0.90,0.47,0.18], [1.0,0.96,0.79], [0.22,0.035,0.015],
  ] },
  { id: "aurora", label: "Aurora", description: "Emerald, teal and ultraviolet", colors: [
    [0.035,0.68,0.33], [0.01,0.57,0.74], [0.48,0.065,0.87], [0.66,1.0,0.84],
    [0.022,0.035,0.052], [0.39,0.79,0.72], [0.84,1.0,0.92], [0.04,0.105,0.12],
  ] },
  { id: "rose-quartz", label: "Rose Quartz", description: "Wine, rose and blush pearl", colors: [
    [0.39,0.08,0.23], [0.91,0.28,0.48], [0.97,0.68,0.73], [1.0,0.82,0.89],
    [0.065,0.018,0.044], [0.90,0.59,0.74], [1.0,0.94,0.96], [0.20,0.035,0.11],
  ] },
  { id: "quicksilver", label: "Quicksilver", description: "Graphite, platinum and pearl", colors: [
    [0.12,0.12,0.12], [0.44,0.44,0.44], [0.90,0.90,0.90], [0.94,0.94,0.94],
    [0.035,0.035,0.035], [0.72,0.72,0.72], [1.0,1.0,1.0], [0.065,0.065,0.065],
  ] },
];

export const NAVIER_COLORWAYS = Object.freeze(COLORWAYS.map((colorway, index) => {
  const swatches = colorway.colors.slice(0, 3).map(color =>
    `rgb(${color.map(channel => Math.round(channel * 255)).join(", ")})`);
  return Object.freeze({
    id: colorway.id, label: colorway.label, description: colorway.description, index,
    colors: Object.freeze(colorway.colors.flat()),
    gradient: `linear-gradient(120deg, ${swatches.join(", ")})`,
    cssVariables: Object.freeze(Object.fromEntries(swatches.map((color, i) => [`--navier-ink-${i}`, color]))),
  });
}));

// Exact allowlist, not property indexing or coercion of arbitrary input.
export const getNavierColorway = value =>
  NAVIER_COLORWAYS.find(colorway => colorway.id === value) || NAVIER_COLORWAYS[0];
