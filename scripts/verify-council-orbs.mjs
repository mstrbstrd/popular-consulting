// Native shader rendering with deterministic inputs. No accounts or model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { findBrowser } from './dark-evidence-browser.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const output = process.env.COUNCIL_EVIDENCE || path.join(os.tmpdir(), 'metabloom-council-evidence');
const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
  import { CREATOROS_FIELD_FRAGMENT_SHADER as fragment, CREATOROS_FIELD_VERTEX_SHADER as vertex } from './src/components/CreatorOSFieldShader';
  window.shaders = {fragment, vertex};` }, bundle: true, write: false, format: 'iife' });
let browser;
try {
  browser = await chromium.launch({ ...(findBrowser() ? { executablePath: findBrowser() } : {}),
    headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<canvas></canvas>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: true });
    if (!gl) throw Error('WebGL2 is required for the council shader check');
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, shaders.vertex), fragment = compile(gl.FRAGMENT_SHADER, shaders.fragment);
    const program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const attribute = gl.getAttribLocation(program, 'a_pos'); gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
    const loc = name => gl.getUniformLocation(program, name), f = (name, value) => gl.uniform1f(loc(name), value);
    gl.uniform2f(loc('u_pointer'), .52, .52); gl.uniform2f(loc('u_pulseOrigin'), .52, .52);
    gl.uniform2f(loc('u_avatarScale'), 1, 1);
    gl.uniform3f(loc('u_avatarColorA'), 0, .933, 1); gl.uniform3f(loc('u_avatarColorB'), 1, 0, 1); gl.uniform3f(loc('u_avatarColorC'), .616, 0, 1);
    gl.uniform4fv(loc('u_councilPose[0]'), [0,0,1,1, 0,0,1,1, 0,0,1,1]);
    gl.uniform4fv(loc('u_councilGesture[0]'), [0,1,1,0, 0,1,1,0, 0,1,1,0]);
    f('u_avatarEnabled', 1); f('u_avatarCenterScale', 1); f('u_avatarRadiusScale', 1);
    f('u_intro', 1); f('u_pulseAge', 8); f('u_seed', .37); f('u_time', 19); f('u_novaTime', 19);
    const render = layout => {
      f('u_councilLayout', layout); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const bytes = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      return bytes;
    };
    const cases = [], images = {};
    let normalRestored = true;
    for (const [width, height] of [[600, 400], [390, 700]]) for (const light of [0, 1])
    for (const finish of ['spectral', 'metalbloom', 'nova', 'metalnova']) {
      canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
      gl.uniform2f(loc('u_res'), width, height); f('u_light', light);
      f('u_metabloomPaletteMix', finish.startsWith('metal') ? 1 : 0);
      f('u_metabloomNovaMix', finish.includes('nova') ? 1 : 0);
      const normal = render(0), council = render(1);
      const key = `${width}-${light}-${finish}`;
      images[key] = canvas.toDataURL();
      // Test all three positions, including the Nova-only early material return.
      const seats = [.18, .5, .82].map(centre => {
        const rgb = [0, 0, 0]; let count = 0;
        for (let i = 0; i < council.length; i += 4) {
          const x = (i / 4 % width) / width;
          if (Math.abs(x - centre) > .12 || council[i + 3] < 100) continue;
          count++; for (let c = 0; c < 3; c++) rgb[c] += council[i + c];
        }
        return { count, rgb: rgb.map(value => value / Math.max(count, 1)) };
      });
      const restored = render(0);
      if (normal.some((value, i) => value !== restored[i])) normalRestored = false;
      cases.push({ key, seats });
    }
    const error = gl.getError();
    gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { cases, images, error, normalRestored };
  });
  fs.mkdirSync(output, { recursive: true });
  for (const [name, data] of Object.entries(result.images)) fs.writeFileSync(path.join(output, `orbs-${name}.png`), Buffer.from(data.split(',')[1], 'base64'));
  delete result.images;
  fs.writeFileSync(path.join(output, 'orbs-report.json'), JSON.stringify(result, null, 2));
  assert.equal(result.error, 0); assert(result.normalRestored, 'Normal pixels must return unchanged after council');
  for (const { key, seats } of result.cases) {
    assert(seats.every(seat => seat.count > 50), `${key}: all three seats must be visible`);
    const [left, centre, right] = seats.map(seat => seat.rgb);
    assert(left[2] > left[0] && left[2] > left[1], `${key}: DeepSeek must remain blue`);
    assert(centre[1] > centre[0] && centre[1] > centre[2], `${key}: OpenAI must remain jade`);
    assert(right[0] > right[1] && right[1] > right[2], `${key}: Claude must remain orange`);
  }
  console.log(`Council shader passed ${result.cases.length} desktop/mobile, light/dark and material cases.`);
} finally { await browser?.close(); }
