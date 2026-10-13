// Temporary branch-only integration bootstrap. Removed before merging.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const field = 'src/components/CreatorOSFieldCanvas.js';
if (fs.readFileSync(field, 'utf8').includes('const MODE_COUNT = 10;')) process.exit(0);
const replace = (file, before, after, all = false) => {
  const source = fs.readFileSync(file, 'utf8');
  assert(source.includes(before), `Missing reviewed anchor in ${file}: ${before}`);
  if (!all) assert.equal(source.split(before).length, 2, `Ambiguous anchor in ${file}`);
  fs.writeFileSync(file, all ? source.replaceAll(before, after) : source.replace(before, after));
};
const append = (file, source) => fs.appendFileSync(file, source);
replace(field, 'const MODE_COUNT = 9;', 'const MODE_COUNT = 10;');
replace(field, '  "sceneChiralWeave",', '  "sceneChiralWeave",\n  "sceneNavierStokes",');
replace(field, 'import React, { useEffect, useRef, useState } from "react";', 'import React, { useEffect, useRef, useState } from "react";\nimport { normalizeNavierProgress } from "./navierStokesModel";');
replace(field, '  chiralStructure = "classic",', '  chiralStructure = "classic",\n  navierProgress = -1,');
replace(field, '  const chiralStructureRef = useRef(normalizeChiralStructure(chiralStructure));', '  const chiralStructureRef = useRef(normalizeChiralStructure(chiralStructure));\n  const navierProgressRef = useRef(normalizeNavierProgress(navierProgress));');
const effect = '  useEffect(() => {\n    chiralStructureRef.current = normalizeChiralStructure(chiralStructure);\n    redrawRef.current();\n  }, [chiralStructure]);';
replace(field, effect, effect + '\n\n  useEffect(() => {\n    navierProgressRef.current = normalizeNavierProgress(navierProgress);\n    redrawRef.current();\n  }, [navierProgress]);');
replace(field, '      "u_chiralStructure",', '      "u_chiralStructure",\n      "u_navierProgress",');
replace(field, '      gl.uniform1f(activeDisplayUniforms.u_chiralHandedness, chiralHandednessRef.current);', '      gl.uniform1f(activeDisplayUniforms.u_navierProgress, navierProgressRef.current);\n      gl.uniform1f(activeDisplayUniforms.u_chiralHandedness, chiralHandednessRef.current);');
replace(field, '      data-chiral-structure={normalizeChiralStructure(chiralStructure)}', '      data-chiral-structure={normalizeChiralStructure(chiralStructure)}\n      data-navier-progress={normalizeNavierProgress(navierProgress)}');
const shader = 'src/components/CreatorOSFieldShader.js';
replace(shader, 'import { CHIRAL_WEAVE_SHADER }', 'import { NAVIER_STOKES_SHADER } from "./NavierStokesShader";\nimport { CHIRAL_WEAVE_SHADER }');
replace(shader, '${CHIRAL_WEAVE_SHADER}', '${CHIRAL_WEAVE_SHADER}\n${NAVIER_STOKES_SHADER}');
replace(shader, '  if (mode == 8) return sceneChiralWeave(uv, time);', '  if (mode == 8) return sceneChiralWeave(uv, time);\n  if (mode == 9) return sceneNavierStokes(uv, time);');
const page = 'src/components/DitherCanvasPage.js';
replace(page, 'import RuptureCanvas from "./RuptureCanvas";', 'import RuptureCanvas from "./RuptureCanvas";\nimport NavierStokesControls from "./NavierStokesControls";');
replace(page, '];\n\nconst ORIGINAL_SECOND_SURFACE', `  {
    id: "finite-infinity",
    number: "14",
    title: "Finite Infinity",
    type: "creatoros-field",
    kind: "Navier-Stokes",
    mode: 9,
    initialState: "concentrating",
    resetLabel: "Replay",
    description:
      "A vortex folds inward. Its core narrows, its currents accelerate, yet its energy stays finite. A spectral interpretation of OpenAI’s smooth-forcing Navier-Stokes construction.",
    instruction:
      "Move to bend the currents · tap to pulse · inspect the collapse · schematic, not a fluid simulation",
  },
];

const ORIGINAL_SECOND_SURFACE`);
replace(page, '  "chiral-weave": { enter: "chiral-weave", exit: "chiral-weave" },', '  "chiral-weave": { enter: "chiral-weave", exit: "chiral-weave" },\n  "finite-infinity": { enter: "finite-infinity", exit: "finite-infinity" },');
replace(page, '  const [chiralStructure, setChiralStructure] = useState("classic");', '  const [chiralStructure, setChiralStructure] = useState("classic");\n  const [navierProgress, setNavierProgress] = useState(-1);');
replace(page, '  const resetActiveStudy = () => {', '  const resetActiveStudy = () => {\n    if (activeStudy.id === "finite-infinity") setNavierProgress(-1);');
replace(page, '        chiralStructure={chiralStructure}', '        chiralStructure={chiralStructure}\n        navierProgress={navierProgress}');
replace(page, '          {activeStudy.id === "chiral-weave" && (', '          {activeStudy.id === "finite-infinity" && (\n            <NavierStokesControls progress={navierProgress} onProgressChange={setNavierProgress} />\n          )}\n          {activeStudy.id === "chiral-weave" && (');
append('public/dither-typography.css', `
/* 14: condensed scientific display with a quiet numerical counterpoint. */
.dither-canvas-page.dither-study-finite-infinity {
  --study-title-font: "Space Grotesk", "Hanken Grotesk", sans-serif;
  --study-title-size: clamp(4.8rem, 6.1vw, 8.8rem);
  --study-title-mobile: clamp(3.4rem, 9.3vw, 5.8rem);
  --study-title-weight: 500;
  --study-title-tracking: -0.065em;
  --study-title-leading: 0.97;
  --study-title-width: 8ch;
  --study-body-font: "Hanken Grotesk", sans-serif;
  --study-label-font: "JetBrains Mono", monospace;
}
`);
append('src/components/DitherScrollNarrative.css', `
/* Collapse into the axis; reduced-motion animation:none remains authoritative. */
.dither-study-scene.is-exiting[data-transition="finite-infinity"],
.dither-copy.is-exiting[data-transition="finite-infinity"] { animation-name: dither-navier-exit; }
.dither-study-scene.is-entering[data-transition="finite-infinity"],
.dither-copy.is-entering[data-transition="finite-infinity"] { animation-name: dither-navier-enter; }
@keyframes dither-navier-exit { to { opacity: 0; transform: scaleX(0.82) scaleY(0.94); } }
@keyframes dither-navier-enter {
  from { opacity: 0; transform: scaleX(1.16) scaleY(1.04); }
  to { opacity: 1; transform: scale(1); }
}
`);
append('src/components/CreatorOSFieldCanvas.css', `
/* Static, local fallback. No replacement render loop or remote texture. */
.creatoros-field-mode-9 .creatoros-field-fallback {
  inset: 12% 6%; filter: none; opacity: 0.85;
  background: center / contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Cg fill='none' stroke-width='3'%3E%3Cg stroke='%23158b9b'%3E%3Cellipse cx='400' cy='430' rx='325' ry='78'/%3E%3Cellipse cx='400' cy='430' rx='267' ry='64'/%3E%3Cellipse cx='400' cy='430' rx='206' ry='49'/%3E%3C/g%3E%3Cg stroke='%23dd743a'%3E%3Cpath d='M400 90C590 250 210 290 400 430S590 600 400 760M430 90C250 250 550 290 430 430S250 600 430 760M370 90C540 250 240 290 370 430S540 600 370 760'/%3E%3C/g%3E%3Cg stroke='%239967d9'%3E%3Cellipse cx='400' cy='430' rx='130' ry='38'/%3E%3Cellipse cx='400' cy='430' rx='142' ry='44'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}
.creatoros-field-mode-9 .creatoros-field-fallback::before,
.creatoros-field-mode-9 .creatoros-field-fallback::after { content: none; }
`);
replace('scripts/verify-chiral-weave.mjs', '  ["CHIRAL_WEAVE_SHADER", "ChiralWeaveShader.js"],', '  ["CHIRAL_WEAVE_SHADER", "ChiralWeaveShader.js"],\n  ["NAVIER_STOKES_SHADER", "NavierStokesShader.js"],');
replace('CLAUDE.md', 'thirteen-study selector', 'fourteen-study selector');
replace('CLAUDE.md', 'Forward Pass, and Chiral Weave.', 'Forward Pass, Chiral Weave, and Finite Infinity.');
replace('CLAUDE.md', '- Morphogen Divide owns two RGBA8', '- Finite Infinity appends mode 9: an analytic, single-pass illustration of the September 2026 smooth-forcing Navier-Stokes construction. Two cylinder roots and an inward spiral sheet depict a shrinking core; no numerical PDE solver, unforced theorem claim, unbounded GPU values or extra textures. Inspection updates one normalized uniform without resetting the clock, seed or canvas. Source attribution and explicit schematic labeling are part of the study.\n- Morphogen Divide owns two RGBA8');
replace('src/components/CreatorOSFieldCanvas.test.js', 'const MODE_COUNT = 9', 'const MODE_COUNT = 10');
replace('src/components/CreatorOSFieldCanvas.test.js', '      "sceneChiralWeave",', '      "sceneChiralWeave",\n      "sceneNavierStokes",');
const pageTest = 'src/components/DitherCanvasPage.test.js';
replace(pageTest, 'a thirteen-study', 'a fourteen-study');
replace(pageTest, 'toHaveLength(13)', 'toHaveLength(14)', true);
replace(pageTest, '    chiralStructure = "classic",', '    chiralStructure = "classic",\n    navierProgress = -1,');
replace(pageTest, '        "data-chiral-structure": chiralStructure,', '        "data-chiral-structure": chiralStructure,\n        "data-navier-progress": String(navierProgress),');
const testAnchor = '  test("reflects Chiral Weave without resetting, resuming, or replacing its renderer", () => {';
replace(pageTest, testAnchor, `  test("inspects Finite Infinity on the paused renderer and permits it as an underlay", () => {
    render(<DitherCanvasPage />);
    fireEvent.click(screen.getByRole("button", { name: /Finite Infinity/ }));
    flushScrollFrame();
    finishStudyTransition();
    finishStudyTransition();
    const renderer = screen.getByTestId("creatoros-field-renderer");
    expect(renderer).toHaveAttribute("data-mode", "9");
    const reset = renderer.getAttribute("data-reset-version");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
    fireEvent.change(screen.getByRole("slider", { name: /Concentration/ }), { target: { value: "80" } });
    expect(renderer).toHaveAttribute("data-navier-progress", "0.8");
    expect(renderer).toHaveAttribute("data-paused", "true");
    expect(renderer).toHaveAttribute("data-reset-version", reset);
    expect(screen.getByTestId("creatoros-field-renderer")).toBe(renderer);
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(renderer).toHaveAttribute("data-navier-progress", "-1");
    expect(renderer).toHaveAttribute("data-paused", "true");
    fireEvent.click(screen.getByRole("button", { name: /Second Surface/ }));
    flushScrollFrame(); finishStudyTransition();
    fireEvent.change(screen.getByRole("combobox", { name: "Choose the theme beneath Second Surface" }),
      { target: { value: "finite-infinity" } });
    expect(screen.getByTestId("creatoros-field-renderer")).toHaveAttribute("data-mode", "9");
    expect(screen.getByTestId("rupture-renderer")).toHaveAttribute("data-reveal-underlay", "true");
  });

` + testAnchor);
console.log('Applied reviewed Finite Infinity integration.');
