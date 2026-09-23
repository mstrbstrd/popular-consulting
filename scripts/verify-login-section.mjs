// Exercises built production shaders with a SOFTWARE-rendering test fixture.
// This is correctness/visual evidence, not physical-GPU performance evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { findBrowser } from './dark-evidence-browser.mjs';

const out = path.resolve('login-section-evidence');
fs.mkdirSync(out, { recursive: true });
const literal = (file, name) => {
  const match = fs.readFileSync(file, 'utf8').match(new RegExp(`${name} = \x60([\\s\\S]*?)\x60;`));
  assert.ok(match, `Missing shader literal: ${name}`);
  return match[1];
};
const aperture = literal('src/utils/loginScene.js', 'LOGIN_APERTURE_GLSL');
const shaders = {
  aperture,
  legacyVertex: literal('src/components/DitherBackground.js', 'VERT'),
  legacyFragment: literal('src/components/DitherBackground.js', 'FRAG').replace('${LOGIN_APERTURE_GLSL}', aperture),
  mobileVertex: literal('src/utils/visualRuntimeLightShaders.js', 'VISUAL_RUNTIME_LIGHT_VERTEX_SHADER'),
  mobileFragment: literal('src/utils/visualRuntimeLightShaders.js', 'VISUAL_RUNTIME_LIGHT_FIELD_SHADER').replace('${LOGIN_APERTURE_GLSL}', aperture),
};
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: () => ({ authenticated: false }) });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popcon-login-section-'));
const browser = spawn(findBrowser(), ['--headless=new', '--remote-debugging-pipe', '--no-first-run', '--disable-sync', '--disable-extensions', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let serial = 0; let buffer = ''; const pending = new Map(); const errors = []; const decoder = new StringDecoder('utf8');
browser.stderr.on('data', () => {});
browser.stdio[4].on('data', chunk => {
  buffer += decoder.write(chunk); let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id); if (!request) continue;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 60000);
  pending.set(id, { resolve, reject, timer });
  browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
const reports = [];
try {
  for (const [width, height] of [[1440, 900], [390, 844]]) for (const theme of ['light', 'dark']) {
    const mobile = width <= 768;
    // Reduce only the software test's drawing resolution; CSS layout is unchanged.
    const deviceScaleFactor = mobile ? 1 : 0.5;
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}) => send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const wait = expression => evaluate(`new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{if(${expression}){clearInterval(t);resolve(true)}else if(++n>300){clearInterval(t);reject(new Error('Login section wait timed out'))}},50)})`);
    const report = { width, height, theme, deviceScaleFactor, renderer: 'software-test-fixture', failures: [] };
    const capture = async label => {
      const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, optimizeForSpeed: true });
      fs.writeFileSync(path.join(out, `${width}-${theme}-${label}.png`), Buffer.from(result.data, 'base64'));
    };
    try {
      await call('Page.enable'); await call('Runtime.enable');
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
      if (mobile) await call('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
      });
      // Opt into the exact production renderers in this isolated software test.
      // Production's hardware probe and fallback policy are never modified.
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `
        localStorage.setItem('popcon-theme', ${JSON.stringify(theme)});
        Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
        Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
        const original = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = function(name) {
          if (name === 'WEBGL_debug_renderer_info') return null;
          return original.call(this, name);
        };
      ` });
      if (width === 1440 && theme === 'light') {
        report.shaderCompilation = await evaluate(`(${function verify(s) {
          const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
          const gl = canvas.getContext('webgl2'); if (!gl) throw new Error('Software WebGL2 unavailable');
          const compile = (type, text) => {
            const shader = gl.createShader(type); gl.shaderSource(shader, text); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
            return shader;
          };
          const program = (vertex, fragment) => {
            const v = compile(gl.VERTEX_SHADER, vertex); const f = compile(gl.FRAGMENT_SHADER, fragment);
            const p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
            gl.deleteShader(v); gl.deleteShader(f);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
            return p;
          };
          gl.deleteProgram(program(s.legacyVertex, s.legacyFragment));
          gl.deleteProgram(program(s.mobileVertex, s.mobileFragment));
          const test = program(s.legacyVertex, '#version 300 es\nprecision highp float; uniform vec2 u_res; uniform float u_time; out vec4 fragColor;\n' + s.aperture + '\nvoid main(){float value=sceneLoginAperture(gl_FragCoord.xy/u_res,u_time);fragColor=vec4(vec3(value),1.);}');
          gl.useProgram(test); const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
          const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
          const pos = gl.getAttribLocation(test, 'a_pos'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
          gl.uniform2f(gl.getUniformLocation(test, 'u_res'), 64, 64); gl.viewport(0, 0, 64, 64);
          const samples = [0, 7].map(time => { gl.uniform1f(gl.getUniformLocation(test, 'u_time'), time); gl.drawArrays(gl.TRIANGLES, 0, 3); const pixels = new Uint8Array(64*64*4); gl.readPixels(0,0,64,64,gl.RGBA,gl.UNSIGNED_BYTE,pixels); return pixels; });
          let changed = 0; for (let i = 0; i < samples[0].length; i += 4) if (Math.abs(samples[0][i] - samples[1][i]) > 2) changed++;
          if (changed < 500) throw new Error('Aperture is static or blank');
          if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL error');
          gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); gl.deleteProgram(test); gl.getExtension('WEBGL_lose_context')?.loseContext();
          return { legacy: 'linked', mobile: 'linked', animatedPixels: changed };
        }.toString()})(${JSON.stringify(shaders)})`);
      }
      await call('Page.navigate', { url: `${origin}/login?graphics=webgl` });
      await wait('document.querySelector("#login .auth-primary") && document.querySelector(".nav-header.nav-in") && document.querySelector(".fixed-background canvas")');
      await evaluate('document.fonts.ready');
      await evaluate('new Promise(resolve => setTimeout(resolve, 3000))');
      assert.equal(await evaluate('document.querySelectorAll(".section-dot").length'), 5, 'Missing fifth section');
      assert.equal(await evaluate('document.querySelector(".section-container.active").dataset.section'), '4');
      assert.equal(await evaluate('document.querySelectorAll("main").length'), 1, 'Duplicate main landmark');
      assert.equal(await evaluate('document.querySelectorAll(".nav-header").length'), 1, 'Duplicate navigation');
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'), 'Horizontal overflow');
      report.runtime = await evaluate('({ mobileLight: document.querySelector(".parallax-wrapper").dataset.mobileLightRuntime, canvases: document.querySelectorAll(".fixed-background canvas").length })');
      if (mobile && theme === 'light') assert.equal(report.runtime.mobileLight, 'high-fidelity', 'Optimized mobile renderer was not exercised');
      await capture('login');
      await evaluate(`new Promise(resolve => {
        window.__loginDocumentMarker = 'same-document';
        window.addEventListener('sectionChangeEnd', () => resolve(true), {once:true});
        document.querySelectorAll('.section-dot')[3].click();
      })`);
      assert.equal(await evaluate('document.querySelector(".section-container.active").dataset.section'), '3');
      if (mobile) {
        await evaluate('document.querySelector(".nav-burger").click()');
        await wait('document.querySelector(".nav-overlay--open")');
        assert.ok(await evaluate('document.querySelector("main").hasAttribute("inert")'), 'Mobile overlay did not lock main');
      }
      await evaluate(`new Promise(resolve => {
        window.addEventListener('sectionChangeEnd', () => resolve(true), {once:true});
        document.querySelector(${JSON.stringify(mobile ? '.nav-overlay-link[href="/login"]' : '.site-account-control[href="/login"]')}).click();
      })`);
      assert.equal(await evaluate('window.__loginDocumentMarker'), 'same-document', 'Account link reloaded the page');
      assert.equal(await evaluate('document.querySelector(".section-container.active").dataset.section'), '4');
      assert.ok(await evaluate('!document.querySelector("main").hasAttribute("inert")'), 'Navigation left main locked');
      await capture('returned');
    } catch (error) {
      report.failures.push(error.message);
      report.body = await evaluate('document.body.innerText').catch(() => 'unavailable');
      await capture('error').catch(() => {});
    }
    reports.push(report); console.log(JSON.stringify(report));
    await send('Target.closeTarget', { targetId });
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ reports, errors }, null, 2));
  assert.equal(errors.length, 0, 'Uncaught client exceptions');
  assert.ok(reports.every(report => report.failures.length === 0), 'Immersive login regression');
} finally {
  await send('Browser.close').catch(() => {});
  if (browser.exitCode === null) browser.kill();
  for (const request of pending.values()) clearTimeout(request.timer);
  server.close();
  await new Promise(resolve => setTimeout(resolve, 500));
  await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
