// Branch-only integration. This script and its workbench are removed before merge.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const field = 'src/components/CreatorOSFieldCanvas.js';
const bytes = fs.readFileSync(field);
assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
  '550acc89a900262541ee5dde6c0495b656d00b80', 'Shared renderer changed; reconcile rather than overwrite.');
const replace = (file, before, after) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(source.split(before).length, 2, `Missing or ambiguous anchor in ${file}: ${before}`);
  fs.writeFileSync(file, source.replace(before, after));
};
replace(field, 'import { normalizeNavierProgress } from "./navierStokesModel";',
  'import { normalizeNavierProgress } from "./navierStokesModel";\nimport { createNavierStokesFluid } from "./navierStokesFluid";');
replace(field, '    let reactionTargets;', '    let reactionTargets;\n    let navierFluid;\n    let navierImpulse = [0, 0];');
replace(field, '      neutralReactionTexture = createNeutralReactionTexture(gl);',
  '      neutralReactionTexture = createNeutralReactionTexture(gl);\n      if (activeMode === 9) navierFluid = createNavierStokesFluid(gl, isMobileTier);\n      if (activeMode === 9) root.dataset.navierFluid = navierFluid ? "advected" : "analytical";');
replace(field, '      canvas.removeEventListener("webglcontextrestored", handleContextRestored);\n      destroyReactionTargets(gl, reactionTargets);',
  '      canvas.removeEventListener("webglcontextrestored", handleContextRestored);\n      navierFluid?.dispose();\n      destroyReactionTargets(gl, reactionTargets);');
replace(field, '      "u_navierProgress",', '      "u_navierProgress",\n      "u_navierFluidReady",\n      "u_navierDye",');
replace(field, '    const handlePointerMove = (event) => {\n      const next = readPointer(event);', `    const navierPoint = (x, y) => {
      const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
      const mix = (a, b, t) => a + (b - a) * t;
      const aspect = canvas.width / Math.max(canvas.height, 1);
      const portrait = 1 - smooth(0.72, 1.05, aspect);
      const compact = 1 - smooth(340, 410, canvas.height);
      const inspecting = navierProgressRef.current >= 0 ? 1 : 0;
      const vertical = mix(1, mix(mix(0.65, 0.43, compact), mix(0.45, 0.25, compact), inspecting), portrait);
      const centerY = mix(-0.04, mix(-0.12, 0.06, inspecting), portrait);
      const horizontal = clamp(aspect * 1.12, 0.36, 1.05);
      const px = ((x * 2 - 1) * aspect - Math.max(aspect - 1, 0) * 0.36) / horizontal;
      const py = ((y * 2 - 1) - centerY) / vertical;
      const progress = inspecting ? navierProgressRef.current : smooth(0.04, 0.92, (localTime % 28) / 28);
      const c = Math.cos(-0.22), s = Math.sin(-0.22);
      return [(c * px + s * py) / mix(1.48, 0.58, progress) * 0.5 + 0.5,
        (-s * px + c * py) / mix(1.26, 0.96, progress) * 0.5 + 0.5];
    };

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      if (navierFluid && !pausedRef.current && !reducedMotion && !isInteractiveTarget(event.target)) {
        const from = navierPoint(pointer.sampleX, pointer.sampleY);
        const to = navierPoint(next.x, next.y);
        navierImpulse = [clamp(navierImpulse[0] + (to[0] - from[0]) * 2, -0.4, 0.4),
          clamp(navierImpulse[1] + (to[1] - from[1]) * 2, -0.4, 0.4)];
      }`);
replace(field, '      root.setPointerCapture?.(event.pointerId);',
  '      if (navierFluid && !pausedRef.current && !reducedMotion && !isInteractiveTarget(event.target)) navierImpulse = [0.12, 0.08];\n      root.setPointerCapture?.(event.pointerId);');
replace(field, '      seed = Math.random();', '      seed = Math.random();\n      navierFluid?.reset(seed);\n      navierImpulse = [0, 0];');
replace(field, '    const simulate = (delta, now, presentationDelta) => {',
  '    const simulate = (delta, now, presentationDelta) => {\n      if (navierFluid) {\n        navierFluid.step(delta, navierPoint(pointer.x, pointer.y), navierImpulse);\n        navierImpulse = [0, 0];\n      }');
replace(field, '      gl.uniform1f(activeDisplayUniforms.u_navierProgress, navierProgressRef.current);',
  '      gl.uniform1f(activeDisplayUniforms.u_navierProgress, navierProgressRef.current);\n      if (modeRef.current === 9) {\n        gl.uniform1f(activeDisplayUniforms.u_navierFluidReady, navierFluid ? 1 : 0);\n        gl.activeTexture(gl.TEXTURE3);\n        gl.bindTexture(gl.TEXTURE_2D, navierFluid?.texture || neutralReactionTexture);\n        gl.uniform1i(activeDisplayUniforms.u_navierDye, 3);\n      }');
replace(field, '    const drawStatic = () => {', '    const drawStatic = () => {\n      navierImpulse = [0, 0];');
replace(field, '        novaWasPaused = true;', '        novaWasPaused = true;\n        navierImpulse = [0, 0];');
replace(field, '      if (!documentVisible) {\n        frameCadence.cancel();',
  '      if (!documentVisible) {\n        navierImpulse = [0, 0];\n        frameCadence.cancel();');
replace(field, '      frameCadence.dispose();', '      frameCadence.dispose();\n      navierFluid?.dispose();');
const page = 'src/components/DitherCanvasPage.js';
replace(page, 'A vortex folds inward. Its core narrows, its currents accelerate, yet its energy stays finite. A spectral interpretation of OpenAI’s smooth-forcing Navier-Stokes construction.',
  'Pigment folds into evolving currents. A contracting view evokes a narrowing core: rising speed, finite energy. An artistic interpretation of OpenAI’s reported smooth-forcing construction.');
replace(page, 'Move to bend the currents · tap to pulse · inspect the collapse · schematic, not a fluid simulation',
  'Move to stir · tap to pulse · pause to inspect · illustrative 2D flow, not the 3D solution');
const tests = 'src/components/NavierStokes.test.js';
let source = fs.readFileSync(tests, 'utf8');
const start = source.indexOf('    expect(NAVIER_STOKES_SHADER).toContain("side < 2");');
const end = source.indexOf('    expect(NAVIER_STOKES_SHADER).toContain("1.0 - smoothstep', start);
assert(start > 0 && end > start);
source = source.slice(0,start) + '    expect(NAVIER_STOKES_SHADER).toContain("u_navierDye");\n    expect(NAVIER_STOKES_SHADER).toContain("u_navierFluidReady");\n    expect(NAVIER_STOKES_SHADER).not.toMatch(/while\\s*\\(/);\n' + source.slice(end);
source = source.replace('appends one fixed scene and no feedback or ray march', 'keeps one specialized display and a bounded replay');
fs.writeFileSync(tests,source);
source = fs.readFileSync('CLAUDE.md','utf8');
const line = source.split('\n').find(value => value.startsWith('- Finite Infinity appends mode 9:'));
assert(line);
replace('CLAUDE.md',line,'- Finite Infinity uses mode 9 with a bounded 2D advected-dye helper in the existing WebGL2 context. Fixed low-resolution flow/pressure and higher-resolution dye targets must never alias reads and writes; no solver work while paused, hidden or reduced-motion. Inspection reframes retained state without rewinding it or changing the solver. Unsupported float targets fall back locally to an analytical illustration. No claim of reproducing the reported 3D result. See docs/finite-infinity.md for allocation and pass budgets.');
console.log('Applied the reviewed mode-9 integration only.');
