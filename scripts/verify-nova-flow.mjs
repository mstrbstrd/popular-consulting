// Deterministic native-shader comparison, not a physical-device FPS benchmark.
// Run after npm ci with Playwright installed locally or on NODE_PATH.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = '6cc4aad09c06450b15c43a042b24274cc203edfb';
const previous = name => execFileSync('git', ['show', `${base}:src/components/${name}`], { encoding: 'utf8' });
const nova = fs.readFileSync('src/components/MetabloomNovaShader.js', 'utf8');
assert.equal(nova.slice(nova.indexOf('float novaSurfaceEmber(')), previous('MetabloomNovaShader.js').slice(previous('MetabloomNovaShader.js').indexOf('float novaSurfaceEmber(')), 'embers, colors, soft seams and rainbow mixing must not change');
assert.equal(fs.readFileSync('src/components/CreatorOSFieldShader.js', 'utf8'), previous('CreatorOSFieldShader.js'), 'native bodies and all other scenes must not change');
const before = previous('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1]
  .split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', previous('MetabloomNovaShader.js').split('`')[1]);
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `import {CREATOROS_FIELD_FRAGMENT_SHADER as current,CREATOROS_FIELD_VERTEX_SHADER as vertex} from './src/components/CreatorOSFieldShader';window.shaders={current,vertex};` }, bundle: true, write: false, format: 'iife' });
const inspect = ({ before, current, vertex }) => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true });
  if (!gl) throw Error('WebGL2 required for native flame checks');
  const flowProbe = source => source.slice(0, source.lastIndexOf('void main()')) + `void main() {
    vec3 flow = novaEdgeFlow(vec2((v_uv.x - 0.5) * 1.2, (v_uv.y - 0.5) * 0.6), vec2(0.0, 1.0));
    bool valid = !any(isnan(flow)) && !any(isinf(flow))
      && flow.y >= 0.0 && flow.y <= 0.216001;
    fragColor = vec4(flow.z, flow.y / 0.216, flow.x + 0.5, valid ? 1.0 : 0.0);
  }`;
  // Both fire finishes inherit spectralMaterial.a, not Metalbloom's separate
  // optical alpha. Inspect that exact source before Nova's early return.
  const native = current.replace('vec4 novaMaterial = vec4(0.0);', 'return spectralMaterial;\nvec4 novaMaterial = vec4(0.0);');
  if (native === current) throw Error('Missing native material inspection point');
  function compile(type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  const vs = compile(gl.VERTEX_SHADER, vertex), programs = {};
  for (const [name, source] of Object.entries({ before, current, native, oldFlow: flowProbe(before), newFlow: flowProbe(current) })) {
    const program = gl.createProgram(), fragment = compile(gl.FRAGMENT_SHADER, source);
    gl.attachShader(program, vs); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    programs[name] = program;
  }
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  function frame(name, { palette = 'nova', seed = .37, time = 7, light = 0, width = 240, height = 300, mode = 0, pulse = 8 } = {}) {
    canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
    const p = programs[name]; gl.useProgram(p);
    const a = gl.getAttribLocation(p, 'a_pos'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const loc = n => gl.getUniformLocation(p, n), f = (n, v) => gl.uniform1f(loc(n), v);
    gl.uniform2f(loc('u_res'), width, height); gl.uniform2f(loc('u_pointer'), .5, .5);
    gl.uniform2f(loc('u_pulseOrigin'), .5, .5); gl.uniform2f(loc('u_avatarScale'), 1, 1);
    f('u_avatarEnabled', 1); f('u_avatarCenterScale', 1); f('u_avatarRadiusScale', 1); f('u_intro', 1); f('u_pulseAge', pulse);
    f('u_seed', seed); f('u_time', time); f('u_novaTime', time); f('u_light', light);
    f('u_metabloomPaletteMix', ['metalbloom', 'metalnova'].includes(palette) ? 1 : 0);
    f('u_metabloomNovaMix', ['nova', 'metalnova'].includes(palette) ? 1 : 0);
    gl.uniform1i(loc('u_modeA'), mode); gl.uniform1i(loc('u_modeB'), mode);
    gl.drawArrays(gl.TRIANGLES, 0, 3); const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels;
  }
  const metrics = { before: { temporal: 0, spatial: 0, peaks: 0 }, current: { temporal: 0, spatial: 0, peaks: 0 } };
  let probeCases = 0;
  for (const seed of [.17, .37, .81]) for (let sample = 0; sample < 24; sample++) {
    const time = 3 + sample * 1.13;
    for (const [name, label] of [['oldFlow', 'before'], ['newFlow', 'current']]) {
      const props = { seed, time, width: 512, height: 8 };
      const a = frame(name, props), b = frame(name, { ...props, time: time + 0.06 });
      for (let i = 0; i < a.length; i += 4) metrics[label].temporal += Math.abs(a[i] - b[i]);
      for (let y = 0; y < 8; y++) {
        let previousValue, lastDirection = 0;
        // Smooth quantization noise before counting the main flare ridges.
        for (let x = 4; x < 508; x++) {
          let value = 0; for (let dx = -4; dx <= 4; dx++) value += a[(y * 512 + x + dx) * 4] / 9;
          if (previousValue !== undefined) {
            const delta = value - previousValue;
            metrics[label].spatial += Math.abs(delta);
            const direction = Math.abs(delta) > 0.03 ? Math.sign(delta) : lastDirection;
            if (lastDirection > 0 && direction < 0) metrics[label].peaks++;
            lastDirection = direction;
          }
          previousValue = value;
        }
      }
    }
    probeCases++;
  }
  let unchangedOtherScenes = true, sharedSilhouette = true, nativeBodyPreserved = true, visibleCases = 0;
  let oldBorder = 0, newBorder = 0, cases = 0;
  const images = {};
  for (const [width, height] of [[240, 300], [360, 225]]) for (const seed of [.17, .37, .81])
  for (const time of [7, 19]) for (const light of [0, 1]) {
    const props = { width, height, seed, time, light };
    for (const [palette, mode] of [['spectral', 0], ['metalbloom', 0], ['nova', 1], ['metalnova', 3]]) {
      const a = frame('before', { ...props, palette, mode }), b = frame('current', { ...props, palette, mode });
      if (a.some((v, i) => v !== b[i])) unchangedOtherScenes = false;
    }
    let novaAlpha;
    for (const palette of ['nova', 'metalnova']) {
      const original = frame('before', { ...props, palette });
      if (seed === .37 && width === 240) images[`before-${palette}-${time}-${light}`] = canvas.toDataURL();
      const now = frame('current', { ...props, palette });
      if (seed === .37 && width === 240) images[`after-${palette}-${time}-${light}`] = canvas.toDataURL();
      const body = frame('native', { ...props, palette });
      if (palette === 'nova') novaAlpha = now;
      let visible = 0;
      for (let i = 0; i < now.length; i += 4) {
        if (now[i + 3] !== novaAlpha[i + 3]) sharedSilhouette = false;
        if (now[i + 3] + 1 < body[i + 3]) nativeBodyPreserved = false;
        if (now[i + 3] > 100) visible++;
        const pixel = i / 4, x = pixel % width, y = Math.floor(pixel / width);
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          if (original[i + 3] > 64) oldBorder++;
          if (now[i + 3] > 64) newBorder++;
        }
      }
      if (visible > 300) visibleCases++;
      cases++;
    }
  }
  // Keep the full existing bounded pulse response, including maximum input.
  let boundedPulse = true;
  for (const pulse of [0, .2, 8]) {
    const values = frame('newFlow', { width: 128, height: 16, pulse });
    if (values.some((v, i) => i % 4 === 3 && v !== 255)) boundedPulse = false;
  }
  const error = gl.getError(); gl.deleteBuffer(buffer); Object.values(programs).forEach(p => gl.deleteProgram(p)); gl.deleteShader(vs);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { metrics, probeCases, unchangedOtherScenes, sharedSilhouette, nativeBodyPreserved, visibleCases, cases, oldBorder, newBorder, boundedPulse, error, images };
};
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage(); await page.setContent('<canvas></canvas>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(inspect, { before, ...await page.evaluate(() => window.shaders) });
  fs.mkdirSync('nova-flow-review', { recursive: true });
  for (const [name, image] of Object.entries(result.images)) fs.writeFileSync(`nova-flow-review/${name}.png`, Buffer.from(image.split(',')[1], 'base64'));
  delete result.images;
  result.ratios = Object.fromEntries(['temporal', 'spatial', 'peaks'].map(k => [k, result.metrics.current[k] / result.metrics.before[k]]));
  fs.writeFileSync('nova-flow-review/render-report.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  assert.equal(result.error, 0);
  assert(result.boundedPulse, 'pulse extremes must stay finite and within the existing lift envelope');
  assert(result.unchangedOtherScenes, 'non-fire finishes and activity scenes must remain pixel-identical');
  assert(result.sharedSilhouette && result.nativeBodyPreserved, 'both finishes must share flow and retain the native body');
  assert.equal(result.visibleCases, result.cases, 'both finishes must remain visible');
  assert(result.ratios.temporal < 1, 'the flame field must vary less between adjacent times');
  assert(result.ratios.spatial < 1 && result.ratios.peaks < 1, 'coarser flow must produce fewer, broader flare ridges');
  console.log('PASS native Nova/MetalNova flow, unchanged palettes, body preservation and other scenes');
} finally { await browser?.close(); }
