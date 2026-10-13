import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { createBuildServer } from './dark-evidence-browser.mjs';

const output = path.resolve('navier-stokes-evidence');
fs.mkdirSync(output, { recursive: true });
const fieldSource = fs.readFileSync('src/components/navierStokesField.js', 'utf8');
const moduleSource = fs.readFileSync('src/components/navierStokesFluid.js', 'utf8');
const server = http.createServer((req, res) => {
  if (req.url === '/solver.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(moduleSource);
  } else if (req.url === '/navierStokesField') {
    res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(fieldSource);
  } else if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>Local fluid verifier</title><canvas></canvas>');
  } else { res.writeHead(404); res.end(); }
});
const app = createBuildServer({ buildRoot: path.resolve('build') });
await Promise.all([new Promise(resolve => server.listen(0,'127.0.0.1',resolve)), new Promise(resolve => app.listen(0,'127.0.0.1',resolve))]);
const browser = await chromium.launch({ executablePath: process.env.VISUAL_CAPTURE_BROWSER,
  headless: true, args: ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const results = [];
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const report = await page.evaluate(async mobile => {
      const { createNavierStokesFluid } = await import('/solver.js');
      const gl = document.querySelector('canvas').getContext('webgl2');
      if (!gl) throw Error('No WebGL2');
      const fluid = createNavierStokesFluid(gl,mobile);
      if (!fluid) throw Error('Native fluid failed to initialize');
      const fbo = gl.createFramebuffer();
      const read = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,fluid.texture,0);
        const data = new Float32Array(fluid.dyeSize * fluid.dyeSize * 4);
        gl.readPixels(0,0,fluid.dyeSize,fluid.dyeSize,gl.RGBA,gl.FLOAT,data);
        if (gl.getError() !== gl.NO_ERROR) throw Error('Native fluid/readback GL error');
        gl.bindFramebuffer(gl.FRAMEBUFFER,null); return data;
      };
      const diff = (a,b) => a.reduce((sum,value,i) => sum + Math.abs(value-b[i]),0)/a.length;
      // The disturbed and control runs each advance exactly 30 steps.
      const advance = (count = 30) => { for(let i=0;i<count;i++) fluid.step(1/30); };
      fluid.reset(0.37); const initial = read(); advance(); const baseline = read();
      fluid.reset(0.37); const repeat = read(); advance(); const deterministic = read();
      fluid.reset(0.37); fluid.step(1/30,[0.6,0.5],[0.3,-0.2]); advance(29); const disturbed = read();
      const settled = read(); fluid.step(0); fluid.step(NaN); fluid.step(Infinity); const invalid = read();
      const result = { mobile, size: fluid.size, dyeSize: fluid.dyeSize,
        evolves: diff(initial,baseline), deterministicReset: diff(initial,repeat),
        deterministicEvolution: diff(baseline,deterministic), persistentImpulse: diff(baseline,disturbed),
        invalidDoesNoWork: diff(settled,invalid), finite: disturbed.every(Number.isFinite),
        bounded: disturbed.every(v => v>=0 && v<=3.01) };
      fluid.dispose(); fluid.dispose(); gl.deleteFramebuffer(fbo); return result;
    },mobile);
    assert(report.evolves>0.001 && report.persistentImpulse>0.00001);
    assert.equal(report.deterministicReset,0); assert.equal(report.deterministicEvolution,0);
    assert.equal(report.invalidDoesNoWork,0); assert(report.finite && report.bounded);
    results.push(report); await page.close();
  }
  // Real playing page, not only the existing reduced-motion control fixture.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await context.addInitScript(() => {
    localStorage.setItem('popcon-theme','dark');
    Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
    Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
    for (const name of ['WebGLRenderingContext','WebGL2RenderingContext']) {
      const proto = window[name]?.prototype; if (!proto) continue;
      const get = proto.getParameter;
      proto.getParameter = function(p) { return p===37446 ? 'Verification adapter' : get.call(this,p); };
    }
    window.__fluidSteps=0;
    const proto=WebGL2RenderingContext.prototype, names=new WeakMap();
    const locate=proto.getUniformLocation, set=proto.uniform1i;
    proto.getUniformLocation=function(p,n){ const loc=locate.call(this,p,n); if(loc)names.set(loc,n); return loc; };
    proto.uniform1i=function(loc,value){ if(names.get(loc)==='u_pass' && value===8)window.__fluidSteps++; return set.call(this,loc,value); };
  });
  const page=await context.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/api/auth/**',route=>route.fulfill({contentType:'application/json',body:'{"authenticated":false}'}));
  await page.goto(`http://127.0.0.1:${app.address().port}/dither-canvas?graphics=webgl`);
  await page.getByRole('button',{name:/Finite Infinity/}).click();
  await page.locator('.creatoros-field-mode-9[data-navier-fluid="advected"]').waitFor();
  await page.waitForFunction(()=>window.__fluidSteps>20);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.waitForTimeout(150);
  const before=await page.evaluate(()=>{ window.__fluidCanvas=document.querySelector('.creatoros-field-mode-9 canvas');return window.__fluidSteps; });
  await page.getByRole('button',{name:'Inspect',exact:true}).click();
  const slider=page.getByRole('slider',{name:/Concentration/});
  await slider.focus(); await slider.press('End'); await slider.press('Home');
  await page.getByRole('button',{name:'Inspect',exact:true}).click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.__fluidSteps),before,'Paused inspection stepped the solver');
  assert(await page.evaluate(()=>window.__fluidCanvas===document.querySelector('.creatoros-field-mode-9 canvas')));
  await page.screenshot({path:path.join(output,'navier-advected-playing-dark.png')});
  await page.getByRole('button',{name:'Use light mode'}).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__fluidSteps),before,'Palette redraw stepped the solver');
  await page.screenshot({path:path.join(output,'navier-advected-playing-light.png')});
  assert.deepEqual(errors,[]);
  results.push({playingPage:true,steps:before,pausedInspectionPreservesState:true,errors});
  await context.close();
  fs.writeFileSync(path.join(output,'fluid-report.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally { await browser.close(); server.close(); app.close(); }
