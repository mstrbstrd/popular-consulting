// Temporary, branch-only integration. Removed before merge.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const hashes = {
  'src/components/CreatorOSFieldCanvas.js': '6ba2fdb83ea2fa0b0b531c0a4cb69e7c4fa2b348',
  'src/components/CreatorOSFieldCanvas.css': '69957348c034608b6d9d364b369bb856a81129ec',
  'src/components/DitherCanvasPage.js': '4bbbd6d5777401c171e50442b8063168c0e9b2a6',
  'src/components/NavierStokesShader.js': '9e2d7f8c0ac2136e56c6d4c2369d83a8f128e8a4',
  'src/components/NavierStokesControls.js': '7e1b62e87847f0625b59b3d81874bef22c1e5f3b',
  'src/components/NavierStokesControls.css': '4cf2d97a2fb305b0bb57a39a0ae5afefc487a29b',
};
for (const [file, sha] of Object.entries(hashes)) {
  const bytes = fs.readFileSync(file);
  assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), sha,
    `${file} changed; reconcile instead of overwriting.`);
}
const replace = (file, before, after) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(source.split(before).length, 2, `Missing or ambiguous anchor: ${file}: ${before}`);
  fs.writeFileSync(file, source.replace(before, after));
};
const field = 'src/components/CreatorOSFieldCanvas.js';
replace(field, 'import { normalizeNavierProgress } from "./navierStokesModel";',
  'import { normalizeNavierProgress } from "./navierStokesModel";\nimport { getNavierColorway } from "./navierStokesColorways";');
replace(field, '  navierProgress = -1,', '  navierProgress = -1,\n  navierColorway = "original",');
replace(field, '  const navierProgressRef = useRef(normalizeNavierProgress(navierProgress));',
  '  const navierProgressRef = useRef(normalizeNavierProgress(navierProgress));\n  const navierColorwayRef = useRef(getNavierColorway(navierColorway));\n  const navierColorsRef = useRef(new Float32Array(navierColorwayRef.current.colors));');
const effect = '  useEffect(() => {\n    navierProgressRef.current = normalizeNavierProgress(navierProgress);\n    redrawRef.current();\n  }, [navierProgress]);';
replace(field, effect, effect + '\n\n  useEffect(() => {\n    navierColorwayRef.current = getNavierColorway(navierColorway);\n    navierColorsRef.current.set(navierColorwayRef.current.colors);\n    redrawRef.current();\n  }, [navierColorway]);');
replace(field, '      "u_navierProgress",', '      "u_navierProgress",\n      "u_navierColorway",\n      "u_navierColors[0]",');
replace(field, '        gl.uniform1i(activeDisplayUniforms.u_navierCoreCount, navierCoreCount);',
  '        gl.uniform1i(activeDisplayUniforms.u_navierCoreCount, navierCoreCount);\n        gl.uniform1i(activeDisplayUniforms.u_navierColorway, navierColorwayRef.current.index);\n        gl.uniform3fv(activeDisplayUniforms["u_navierColors[0]"], navierColorsRef.current);');
replace(field, '      data-navier-progress={normalizeNavierProgress(navierProgress)}',
  '      data-navier-progress={normalizeNavierProgress(navierProgress)}\n      data-navier-colorway={clampMode(mode) === 9 ? getNavierColorway(navierColorway).id : undefined}\n      style={clampMode(mode) === 9 && getNavierColorway(navierColorway).index > 0\n        ? getNavierColorway(navierColorway).cssVariables : undefined}');
const page = 'src/components/DitherCanvasPage.js';
replace(page, '  const [navierProgress, setNavierProgress] = useState(-1);',
  '  const [navierProgress, setNavierProgress] = useState(-1);\n  const [navierColorway, setNavierColorway] = useState("original");');
replace(page, '        navierProgress={navierProgress}', '        navierProgress={navierProgress}\n        navierColorway={navierColorway}');
replace(page, '<NavierStokesControls progress={navierProgress} onProgressChange={setNavierProgress} />',
  '<NavierStokesControls progress={navierProgress} onProgressChange={setNavierProgress}\n              colorway={navierColorway} onColorwayChange={setNavierColorway} />');
const shader = 'src/components/NavierStokesShader.js';
replace(shader, 'uniform sampler2D u_navierDye;\n',
  'uniform sampler2D u_navierDye;\nuniform int u_navierColorway;\nuniform vec3 u_navierColors[8];\n');
replace(shader, 'vec3 navierPigment(vec2 uv) {',
  'vec3 navierColor(int index, vec3 original) {\n  return u_navierColorway > 0 ? u_navierColors[index] : original;\n}\n\nvec3 navierPigment(vec2 uv) {');
['vec3(0.04,0.79,0.90)', 'vec3(1.0,0.29,0.07)', 'vec3(0.40,0.09,0.86)', 'vec3(0.73,0.94,1.0)',
 'vec3(0.035,0.025,0.08)', 'vec3(0.62,0.78,0.9)', 'vec3(0.85,0.98,1.0)', 'vec3(0.10,0.035,0.20)']
  .forEach((color, i) => replace(shader, color, `navierColor(${i}, ${color})`));
const controls = 'src/components/NavierStokesControls.js';
replace(controls, 'import React from "react";',
  'import React from "react";\nimport NavierStokesColorwaySelector from "./NavierStokesColorwaySelector";');
replace(controls, 'const NavierStokesControls = ({ progress, onProgressChange }) => {',
  'const NavierStokesControls = ({ progress, onProgressChange, colorway = "original", onColorwayChange }) => {');
replace(controls, '    <div className="navier-controls">',
  '    <div className="navier-controls">\n      <NavierStokesColorwaySelector colorway={colorway} onColorwayChange={onColorwayChange} />');
fs.appendFileSync('src/components/NavierStokesControls.css', `
/* Color choices stay compact until opened; closed selection restores focus. */
.navier-colorways { margin: 0 0.8rem 0.4rem; min-width: 0; }
.navier-colorways summary { min-height: 44px; align-content: center; cursor: pointer; color: var(--rupture-text); font-size: 1.15rem; }
.navier-colorways summary::marker { color: var(--rupture-text-soft); }
.navier-colorway-summary { display: inline-flex; width: calc(100% - 1.5rem); justify-content: space-between; align-items: center; gap: 0.6rem; vertical-align: middle; }
.navier-colorway-current { display: inline-flex; align-items: center; gap: 0.6rem; min-width: 0; }
.navier-colorway-current strong { font-weight: 500; }
.navier-colorway-swatch { display: inline-block; flex: 0 0 22px; width: 22px; height: 16px; border-radius: 4px; border: 1px solid color-mix(in srgb, var(--rupture-text) 24%, transparent); }
.navier-colorway-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; padding: 0.3rem 0; }
.navier-colorway-option { display: flex; align-items: center; gap: 0.55rem; min-width: 0; min-height: 44px; padding: 0.6rem; border: 1px solid color-mix(in srgb, var(--rupture-text) 22%, transparent); border-radius: 8px; background: transparent; color: var(--rupture-text); font: inherit; font-size: 1.05rem; text-align: left; cursor: pointer; }
.navier-colorway-option:hover { background: color-mix(in srgb, var(--rupture-text) 7%, transparent); }
.navier-colorway-option[aria-pressed="true"] { border-color: var(--rupture-text); background: color-mix(in srgb, var(--rupture-text) 9%, transparent); }
.navier-colorway-option .navier-colorway-swatch { flex-basis: 18px; width: 18px; }
.navier-colorway-check { margin-left: auto; width: 1em; flex-shrink: 0; }
.navier-colorway-hint { margin: 0.4rem 0 0.6rem; font-size: 1rem; line-height: 1.4; }
@media (forced-colors: active) {
  .navier-colorway-option[aria-pressed="true"] { outline: 2px solid Highlight; outline-offset: -3px; }
}
`);
fs.appendFileSync('src/components/CreatorOSFieldCanvas.css', `
/* Preserve the approved Original fallback. Alternate colors need no WebGL. */
.creatoros-field-mode-9[data-navier-colorway]:not([data-navier-colorway="original"]) .creatoros-field-fallback {
  background:
    radial-gradient(ellipse at 65% 38%, color-mix(in srgb, var(--navier-ink-0) 55%, transparent) 0, transparent 48%),
    radial-gradient(ellipse at 27% 57%, color-mix(in srgb, var(--navier-ink-1) 44%, transparent) 0, transparent 48%),
    radial-gradient(ellipse at 73% 78%, color-mix(in srgb, var(--navier-ink-2) 44%, transparent) 0, transparent 45%),
    repeating-conic-gradient(from 24deg at 28% 21%, color-mix(in srgb, var(--navier-ink-0) 14%, transparent) 0deg 40deg, color-mix(in srgb, var(--navier-ink-2) 16%, transparent) 60deg 100deg, color-mix(in srgb, var(--navier-ink-1) 19%, transparent) 110deg 160deg);
}
`);
const pageTest = 'src/components/DitherCanvasPage.test.js';
replace(pageTest, '    navierProgress = -1,', '    navierProgress = -1,\n    navierColorway = "original",');
replace(pageTest, '        "data-navier-progress": String(navierProgress),',
  '        "data-navier-progress": String(navierProgress),\n        "data-navier-colorway": navierColorway,');
replace(pageTest, '    expect(renderer).toHaveAttribute("data-navier-progress", "0.8");',
  '    expect(renderer).toHaveAttribute("data-navier-progress", "0.8");\n    fireEvent.click(screen.getByRole("button", { name: "Glacier", hidden: true }));\n    expect(renderer).toHaveAttribute("data-navier-colorway", "glacier");');
replace(pageTest, '    expect(renderer).toHaveAttribute("data-navier-progress", "-1");',
  '    expect(renderer).toHaveAttribute("data-navier-progress", "-1");\n    expect(renderer).toHaveAttribute("data-navier-colorway", "glacier");');
replace(pageTest, '    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "9");',
  '    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "9");\n    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-navier-colorway", "glacier");');
fs.appendFileSync('docs/finite-infinity.md', `

## Colorways

Open **Colorway** in the Finite Infinity controls. Original retains the approved turquoise/ember/violet appearance exactly. Glacier adds blue/cyan/ice, Ember garnet/orange/gold, Aurora emerald/teal/ultraviolet, Rose Quartz wine/rose/blush, and Quicksilver neutral graphite/platinum/pearl.

These are display-only pigment, highlight, shadow and core-marker colors, not changes to flow physics. Selecting one invalidates the existing canvas through one enum uniform and one fixed eight-color array. It never changes dye or velocity textures, positions, concentration, seed, clocks, pause state, allocation or draw-pass budgets. The selection stays through Reseed, study changes and Second Surface underlay selection; no new persistent storage or runtime request is added. Invalid names select Original. The analytical and local CSS fallbacks use the selected colors too.

The native disclosure is keyboard operable. Labeled 44px buttons expose the selected state with aria-pressed, a border and a checkmark rather than color alone. Selection closes the choices and restores summary focus. Compact screens retain the existing scrollable controls budget.

NavierStokesColorways tests check data bounds, fallback state and exact recovery of the approved shader after stripping only the color overrides. scripts/verify-navier-colorways.mjs tests actual paused dye/core/clock preservation, distinguishable rendered palettes, round-trip Original output, both themes, keyboard selection and compact viewports. Original shader references in older checks intentionally use the default zero colorway uniform.
`);
console.log('Integrated display-only Finite Infinity colorways.');
