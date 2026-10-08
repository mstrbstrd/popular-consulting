// Deterministic native shader checks for the shared, half-strength rainbow crest.
// Requires npm ci and Playwright on NODE_PATH. No live sessions or external APIs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = 'dfac9065de5c117c0a87fe72a49369444503e91c';
const readBase = name => execFileSync('git', ['show', `${base}:src/components/${name}`], { encoding: 'utf8' });
const before = readBase('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1]
  .split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', readBase('MetabloomNovaShader.js').split('`')[1]);
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `import {CREATOROS_FIELD_FRAGMENT_SHADER as current,CREATOROS_FIELD_VERTEX_SHADER as vertex} from './src/components/CreatorOSFieldShader';window.shaders={current,vertex};` }, bundle: true, write: false, format: 'iife' });
const inspect = ({ before, current, vertex }) => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true });
  if (!gl) throw Error('WebGL2 required for Nova spectrum verification');
  const prismReturn = 'return vec4(mix(fire.rgb, outlineTint, prismMask * mix(0.46, 0.45, u_light)), fire.a);';
  if (!current.includes(prismReturn)) throw Error('Missing half-strength prism inspection point');
  const diagnostic = current.replace(prismReturn, 'return vec4(prismMask, step(1.75, flameSurface.w), flameSurface.x, 1.0);');
  let noSeam = current;
  for (const line of ['color = mix(color, seamColor, seam);', 'fireColor = mix(fireColor, seamColor, seam);', 'bodyColor = mix(bodyColor, seamColor, seam);', 'silverFlame = mix(silverFlame, seamColor, seam);']) {
    if (!noSeam.includes(line)) throw Error(`Missing material seam: ${line}`);
    noSeam = noSeam.replace(line, '');
  }
  const probe = current.slice(0, current.lastIndexOf('void main()')) + `void main() {
    vec3 shoulder = mix(vec3(0.85, 0.68, 0.17), vec3(0.82), u_metabloomPaletteMix);
    vec4 fire = novaPrismaticEdges(vec4(shoulder, 0.8),
      vec2(v_uv.y * 3.0 - 1.5, 0.0), 0.3, vec4(v_uv.x, 0.6, 0.0, 0.55), 1.04);
    fragColor = fire;
  }`;
  const fullProbe = probe.replace('prismMask * mix(0.46, 0.45, u_light)', 'prismMask * mix(0.92, 0.90, u_light)');
  const plainProbe = probe.replace(prismReturn, 'return fire;');
  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const vs = compile(gl.VERTEX_SHADER, vertex), programs = {};
  for (const [name, source] of Object.entries({ before, current, diagnostic, noSeam, probe, fullProbe, plainProbe })) {
    const program = gl.createProgram(), fragment = compile(gl.FRAGMENT_SHADER, source);
    gl.attachShader(program, vs); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    programs[name] = program;
  }
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  function frame(name, palette, seed, time, light, width, height, mode = 0) {
    canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
    const p = programs[name]; gl.useProgram(p);
    const a = gl.getAttribLocation(p, 'a_pos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const loc = n => gl.getUniformLocation(p, n), f = (n, v) => gl.uniform1f(loc(n), v);
    gl.uniform2f(loc('u_res'), width, height); gl.uniform2f(loc('u_pointer'), .52, .52);
    gl.uniform2f(loc('u_pulseOrigin'), .52, .52); gl.uniform2f(loc('u_avatarScale'), 1, 1);
    f('u_avatarEnabled', 1); f('u_avatarCenterScale', 1); f('u_avatarRadiusScale', 1); f('u_intro', 1); f('u_pulseAge', 8);
    f('u_seed', seed); f('u_time', time); f('u_novaTime', time); f('u_light', light);
    f('u_metabloomPaletteMix', ['metalbloom', 'metalnova'].includes(palette) ? 1 : 0);
    f('u_metabloomNovaMix', ['nova', 'metalnova'].includes(palette) ? 1 : 0);
    gl.uniform1i(loc('u_modeA'), mode); gl.uniform1i(loc('u_modeB'), mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3); const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
  }
  let othersUnchanged = true, alphaUnchanged = true, sharedSilhouette = true;
  let coreChanges = 0, seamChanges = 0, seamTipChanges = 0, newMetalBlack = 0;
  const images = {}, cases = [];
  for (const [width, height] of [[240, 300], [360, 225]]) for (const seed of [.17, .37, .81])
  for (const time of [7, 19]) for (const light of [0, 1]) {
    for (const [palette, mode] of [['spectral', 0], ['metalbloom', 0], ['nova', 1], ['metalnova', 3]]) {
      const a = frame('before', palette, seed, time, light, width, height, mode), b = frame('current', palette, seed, time, light, width, height, mode);
      if (a.some((v, i) => v !== b[i])) othersUnchanged = false;
    }
    const mask = frame('diagnostic', 'nova', seed, time, light, width, height);
    let nova;
    for (const palette of ['nova', 'metalnova']) {
      const old = frame('before', palette, seed, time, light, width, height);
      if (seed === .37 && width === 240) images[`soft-${palette}-before-${time}-${light}`] = canvas.toDataURL();
      const now = frame('current', palette, seed, time, light, width, height);
      if (seed === .37 && width === 240) images[`soft-${palette}-after-${time}-${light}`] = canvas.toDataURL();
      const hard = frame('noSeam', palette, seed, time, light, width, height);
      if (palette === 'nova') nova = now;
      for (let i = 0; i < now.length; i += 4) {
        if (old[i + 3] !== now[i + 3]) alphaUnchanged = false;
        if (now[i + 3] !== nova[i + 3]) sharedSilhouette = false;
        const changed = [0, 1, 2].some(c => now[i + c] !== old[i + c]);
        if (mask[i + 1] > 250 && changed) coreChanges++;
        const seamChanged = [0, 1, 2].some(c => now[i + c] !== hard[i + c]);
        if (seamChanged && now[i + 3] > 20) {
          seamChanges++;
          if (mask[i + 2] > 140) seamTipChanges++;
        }
        if (palette === 'metalnova' && now[i + 3] > 160) {
          const luma = bytes => bytes[i] * .2126 + bytes[i + 1] * .7152 + bytes[i + 2] * .0722;
          if (luma(old) >= 60 && luma(now) < 35) newMetalBlack++;
        }
      }
    }
    cases.push({ width, height, seed, time, light });
  }
  const probes = [];
  for (const palette of ['nova', 'metalnova']) for (const light of [0, 1]) {
    const width = 256, height = 32;
    const soft = frame('probe', palette, .37, 7, light, width, height);
    const full = frame('fullProbe', palette, .37, 7, light, width, height);
    const plain = frame('plainProbe', palette, .37, 7, light, width, height);
    let shoulderChanges = 0, maxHalfError = 0, crestChanges = 0;
    for (let row = 0; row < height; row++) for (const x of [128, 158, 230]) {
      const i = (row * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        if (x < 170 && soft[i + c] !== plain[i + c]) shoulderChanges++;
        if (x === 230) {
          maxHalfError = Math.max(maxHalfError, Math.abs(2 * (soft[i + c] - plain[i + c]) - (full[i + c] - plain[i + c])));
          if (Math.abs(soft[i + c] - plain[i + c]) > 8) crestChanges++;
        }
      }
    }
    probes.push({ palette, light, shoulderChanges, maxHalfError, crestChanges });
  }
  const error = gl.getError(); gl.deleteBuffer(buffer); Object.values(programs).forEach(p => gl.deleteProgram(p)); gl.deleteShader(vs);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { othersUnchanged, alphaUnchanged, sharedSilhouette, coreChanges, seamChanges, seamTipChanges, newMetalBlack, probes, cases, error, images };
};
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(); await page.setContent('<canvas></canvas>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(inspect, { before, ...await page.evaluate(() => window.shaders) });
  fs.mkdirSync('nova-review', { recursive: true });
  for (const [name, image] of Object.entries(result.images)) fs.writeFileSync(`nova-review/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
  delete result.images; fs.writeFileSync('nova-review/soft-spectrum-report.json', JSON.stringify(result, null, 2));
  assert.equal(result.error, 0); assert(result.othersUnchanged, 'non-fire finishes and activity scenes must remain unchanged');
  assert(result.alphaUnchanged && result.sharedSilhouette, 'placement, transparency and both fire silhouettes must remain identical');
  assert.equal(result.coreChanges, 0, 'dense cores and metal reflections must be preserved');
  assert(result.seamChanges > 100, 'the material seam must actually soften');
  assert.equal(result.seamTipChanges, 0, 'seam blending must not recolour distal flames');
  assert.equal(result.newMetalBlack, 0, 'softening must not introduce a black perimeter');
  assert(result.probes.every(p => p.shoulderChanges === 0), 'yellow and white transition bands must survive before the crest');
  assert(result.probes.every(p => p.maxHalfError <= 2), 'the rainbow colour mix must be half-strength in both themes');
  assert(result.probes.every(p => p.crestChanges > 10), 'both Nova and MetalNova must have visible rainbow crests');
  console.log(JSON.stringify({ result: 'PASS', cases: result.cases.length, alphaUnchanged: result.alphaUnchanged, coreChanges: result.coreChanges, seamChanges: result.seamChanges, probes: result.probes }));
} finally { await browser?.close(); }
