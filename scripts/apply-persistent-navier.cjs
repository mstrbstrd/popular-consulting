// Temporary, feature-branch-only integration. Removed before merging.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const hash = file => { const b = fs.readFileSync(file); return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); };
const field = 'src/components/CreatorOSFieldCanvas.js';
assert.equal(hash(field), 'a305f892185c5f6447664b1c4278c0c29ed3e18e', 'Shared renderer changed; reconcile rather than overwrite.');
const replace = (file, before, after) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(source.split(before).length, 2, `Missing or ambiguous anchor in ${file}: ${before}`);
  fs.writeFileSync(file, source.replace(before, after));
};
replace('src/components/navierStokesFluid.js', 'vec2(r.x - l.x, t.x - b.y)', 'vec2(r.x - l.x, t.x - b.x)');
replace(field, 'import { createNavierStokesFluid } from "./navierStokesFluid";', 'import { createNavierStokesFluid } from "./navierStokesFluid";\nimport { writeNavierCores } from "./navierStokesField";');
replace(field, '    let navierFluid;', '    let navierFluid;\n    const navierCores = modeRef.current === 9 ? new Float32Array(16) : null;\n    const navierCoreCount = isMobileTier ? 3 : 4;');
replace(field, '      "u_navierDye",', '      "u_navierDye",\n      "u_navierCores[0]",\n      "u_navierCoreCount",\n      "u_navierAspect",');
replace(field, '      pointerBounds.left = bounds.left;', '      navierFluid?.setAspect(target.width / Math.max(target.height, 1));\n      pointerBounds.left = bounds.left;');
const current = fs.readFileSync(field, 'utf8');
const start = current.indexOf('    const navierPoint = (x, y) => {');
const end = current.indexOf('\n\n    const handlePointerMove', start);
assert(start > 0 && end > start);
replace(field, current.slice(start, end), '    // Full-frame UVs are shared with the shader, including portrait layouts.\n    const navierPoint = (x, y) => [clamp(x), clamp(y)];');
replace(field, '        gl.uniform1f(activeDisplayUniforms.u_navierFluidReady, navierFluid ? 1 : 0);', `        gl.uniform4fv(activeDisplayUniforms["u_navierCores[0]"], navierFluid?.cores
          || writeNavierCores(navierCores, localTime, seed, navierCoreCount));
        gl.uniform1i(activeDisplayUniforms.u_navierCoreCount, navierCoreCount);
        gl.uniform1f(activeDisplayUniforms.u_navierAspect, canvas.width / Math.max(canvas.height, 1));
        gl.uniform1f(activeDisplayUniforms.u_navierFluidReady, navierFluid ? 1 : 0);`);
const page = 'src/components/DitherCanvasPage.js';
replace(page, 'resetLabel: "Replay",', 'resetLabel: "Reseed",');
replace(page, 'Pigment folds into evolving currents. A contracting view evokes a narrowing core: rising speed, finite energy. An artistic interpretation of OpenAI’s reported smooth-forcing construction.', 'One connected fluid field. Several vortices tighten toward tiny, persistent cores while currents circulate from edge to edge. An artistic interpretation of OpenAI’s reported smooth-forcing construction.');
replace('src/components/DitherCanvasPage.test.js', 'fireEvent.click(screen.getByRole("button", { name: "Replay" }));', 'fireEvent.click(screen.getByRole("button", { name: "Reseed" }));');
const controls = 'src/components/NavierStokesControls.js';
replace(controls, 'Leading-order scales, not measured data. Inspect reframes the flow, not its history. Use Pause to freeze it.', 'Leading-order scales, not measured data. Inspect adjusts the core markers, not flow history. Use Pause to freeze it.');
replace(controls, 'Shrinking core. Rising speed. Finite energy.', 'One fluid. Several tightening cores. No fade-out.');
replace(controls, 'Inspired by OpenAI’s reported smooth-forcing construction. Pigment rides an evolving 2D velocity field, folding into eddies and retaining the history of your gestures. Devices without floating-point render targets use an analytical illustration.', 'Inspired by OpenAI’s reported smooth-forcing construction. One continuous 2D pigment field surrounds four vortices, or three on mobile. Their core markers contract toward a tiny visible floor while the surrounding fluid keeps moving. Devices without floating-point render targets use an analytical illustration.');
replace(controls, 'The contracting camera envelope illustrates the 3D core’s concentration, not simulated physical compression. This 2D artwork does not reproduce or verify the 3D proof. Reference scales are not live measurements. Pause freezes the flow; Inspect changes only its framing.', 'The multiple cores are an artistic extension, not a claim about simultaneous physical singularities. This bounded 2D flow does not reproduce or verify the reported 3D proof. Reference scales are not live measurements. Pause freezes the flow; Inspect changes only the displayed core concentration.');
const test = 'src/components/NavierStokes.test.js';
replace(test, 'keeps one specialized display and a bounded replay', 'keeps one full-domain display without periodic fading');
replace(test, '    expect(NAVIER_STOKES_SHADER).toContain("1.0 - smoothstep(0.94, 1.0, cycle)");', '    expect(NAVIER_STOKES_SHADER).not.toMatch(/float replay|float cycle|opacity \\* crop/);\n    expect(NAVIER_STOKES_SHADER).toContain("vec2 q = uv;");\n    expect(NAVIER_STOKES_SHADER).toContain("max(navierRadius(progress), pixel * 1.15)");');
const fluidTest = 'src/components/NavierStokesFluid.test.js';
replace(fluidTest, 'uniform1i: jest.fn(), uniform1f: jest.fn(), uniform2f: jest.fn(),', 'uniform1i: jest.fn(), uniform1f: jest.fn(), uniform2f: jest.fn(), uniform4fv: jest.fn(),');
replace(fluidTest, '  fluid.reset(0.4);', '  fluid.setAspect(1.6);\n  fluid.reset(0.4);\n  expect(fluid.coreCount).toBe(mobile ? 3 : 4);\n  expect(fluid.cores).toHaveLength(16);\n  expect(gl.uniform1f).toHaveBeenCalledWith("u_navierAspect", 1.6);');
replace(fluidTest, '  expect(gl.createTexture).toHaveBeenCalledTimes(9);\n  fluid.dispose();', '  expect(gl.createTexture).toHaveBeenCalledTimes(9);\n  for (const [, values] of gl.uniform4fv.mock.calls) expect([...values].every(Number.isFinite)).toBe(true);\n  const time = fluid.time;\n  const cores = [...fluid.cores];\n  fluid.setAspect(NaN); // Resize/inspection is not a simulation step.\n  expect(fluid.time).toBe(time);\n  expect([...fluid.cores]).toEqual(cores);\n  fluid.dispose();');
replace('scripts/verify-chiral-weave.mjs', '  ["NAVIER_STOKES_SHADER", "NavierStokesShader.js"],', '  ["NAVIER_STOKES_SHADER", "NavierStokesShader.js"],\n  ["NAVIER_CORE_SHADER", "navierStokesField.js"],');
const native = 'scripts/verify-navier-fluid.mjs';
replace(native, "const moduleSource = fs.readFileSync('src/components/navierStokesFluid.js', 'utf8');", "const fieldSource = fs.readFileSync('src/components/navierStokesField.js', 'utf8');\nconst moduleSource = fs.readFileSync('src/components/navierStokesFluid.js', 'utf8');");
replace(native, "  } else if (req.url === '/') {", "  } else if (req.url === '/navierStokesField') {\n    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(fieldSource);\n  } else if (req.url === '/') {");
const shaderTest = 'scripts/verify-navier-stokes-shader.mjs';
replace(shaderTest, "['NAVIER_STOKES_SHADER', 'NavierStokesShader.js']", "['NAVIER_STOKES_SHADER', 'NavierStokesShader.js'], ['NAVIER_CORE_SHADER', 'navierStokesField.js']");
replace(shaderTest, "const output = path.resolve('navier-stokes-evidence');", "const fieldJS = fs.readFileSync('src/components/navierStokesField.js', 'utf8').replaceAll('export ', '');\nconst output = path.resolve('navier-stokes-evidence');");
replace(shaderTest, 'const result={failures:[],light:${light}};', '${fieldJS}\nconst result={failures:[],light:${light}};');
replace(shaderTest, "vector('u_res',canvas.width,canvas.height);", "const cores=writeNavierCores(new Float32Array(16),time,.37,innerWidth<500?3:4);\ngl.uniform4fv(gl.getUniformLocation(program,'u_navierCores[0]'),cores);\ngl.uniform1i(gl.getUniformLocation(program,'u_navierCoreCount'),innerWidth<500?3:4);\nscalar('u_navierAspect',canvas.width/canvas.height);\nvector('u_res',canvas.width,canvas.height);");
replace(shaderTest, 'if(a[i]>100)n++', 'if(a[i]>30)n++');
replace(shaderTest, "check(result.coverage.every(x=>x>.015&&x<.65),'Core disappeared or lost negative space');", "check(result.coverage.every(x=>x>.85),'Fluid no longer occupies the full frame');");
replace(shaderTest, "check(result.coverage[2]<result.coverage[0],'Collapse does not shrink');", "check(navierCoreRadius(1)<navierCoreRadius(0)*.001,'Core does not contract');");
replace(shaderTest, 'result.concentrationDifference>1', 'result.concentrationDifference>.05');
replace(shaderTest, "check(cover(draw(-1,28))<.01,'Replay does not fade before resetting');", "for(const time of [27.99,28,28.01,56,112,100000])check(cover(draw(-1,time))>.85,'Fluid faded at former replay boundary');");
const guide = fs.readFileSync('CLAUDE.md','utf8').split('\n').find(line => line.startsWith('- Finite Infinity uses mode 9'));
replace('CLAUDE.md', guide, '- Finite Infinity uses mode 9 with a bounded, full-domain periodic dye field in the existing WebGL2 context. Four persistent cores (three on mobile) share positions and concentration between solver and display; their radii approach a pixel floor without automatic reset/fading. Inspection changes display markers only. Keep pointer UVs aligned, the nine-target budget fixed, pause/hidden/reduced-motion simulation idle, and local analytical fallback available. This is artwork, not verification of physical singularities. See docs/finite-infinity.md.');
const css = 'src/components/CreatorOSFieldCanvas.css';
const style = fs.readFileSync(css,'utf8'); const marker = style.indexOf('/* Static, local fallback.'); assert(marker>0);
replace(css, style.slice(marker), `/* Static, local fallback for the full-domain field. No loop or remote asset. */
.creatoros-field-mode-9 .creatoros-field-fallback {
  inset: 0; filter: none; opacity: 0.76;
  background:
    radial-gradient(ellipse at 65% 38%, #72d7e18c 0, #137a8733 18%, transparent 48%),
    radial-gradient(ellipse at 27% 57%, #e584586e 0, transparent 48%),
    radial-gradient(ellipse at 73% 78%, #a162cb6e 0, transparent 45%),
    repeating-conic-gradient(from 24deg at 28% 21%, #147e8a24 0deg 40deg, #98479928 60deg 100deg, #ce773530 110deg 160deg);
}
.creatoros-field-mode-9 .creatoros-field-fallback::before,
.creatoros-field-mode-9 .creatoros-field-fallback::after { content: none; }
`);
replace('.github/workflows/navier-stokes-browser.yml', 'branches: [main, feat/navier-advection]', 'branches: [main, feat/navier-persistent-cores]');
const expected = {".github/workflows/navier-stokes-browser.yml":"4d92f927a45e246b7345c5a35ae22db410e4c6fa","CLAUDE.md":"36aa2ea34581bbad993a6cf871b34d6cfaf0e74d","docs/finite-infinity.md":"0db0d600f5d78ff36152f38acab207ea6389e9e7","scripts/verify-chiral-weave.mjs":"a6e8f5e80a8a8270483caf7a28a974a2ff92c02a","scripts/verify-navier-fluid.mjs":"063f5d0447e7dd094b83c5d8d1a9012c7fbb0677","scripts/verify-navier-stokes-shader.mjs":"5dc21314d59c5c00c68225d7043511c6a69337ba","src/components/CreatorOSFieldCanvas.css":"69957348c034608b6d9d364b369bb856a81129ec","src/components/CreatorOSFieldCanvas.js":"6ba2fdb83ea2fa0b0b531c0a4cb69e7c4fa2b348","src/components/DitherCanvasPage.js":"4bbbd6d5777401c171e50442b8063168c0e9b2a6","src/components/DitherCanvasPage.test.js":"4e74a8cd7807b77d280c26ed0ca7270c1fb0732f","src/components/NavierStokes.test.js":"205de9650908cdb5d6ad3d3a83d40097189880b4","src/components/NavierStokesControls.js":"7e1b62e87847f0625b59b3d81874bef22c1e5f3b","src/components/NavierStokesField.test.js":"57ec98212f7c49e5fd71444821e2610281c31c1a","src/components/NavierStokesFluid.test.js":"5e67bab5402aff02994b795e670a80ca0dafbcb8","src/components/NavierStokesShader.js":"9e2d7f8c0ac2136e56c6d4c2369d83a8f128e8a4","src/components/navierStokesField.js":"1724825d3ec4edb425728b72f2c6ee7f9c70a888","src/components/navierStokesFluid.js":"5dba2e2a0b97dbf0c92d5136525f5c35197c24cc"};
for (const [file, sha] of Object.entries(expected)) assert.equal(hash(file), sha, `Reviewed source mismatch: ${file}`);
console.log('All 17 files match the reviewed full-domain implementation.');
