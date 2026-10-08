// Run after npm ci. Supply Playwright through NODE_PATH or a local installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'jsx',
    contents: `import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import CreatorOSFieldCanvas from './src/components/CreatorOSFieldCanvas';
import { CREATOROS_FIELD_FRAGMENT_SHADER as fragment, CREATOROS_FIELD_VERTEX_SHADER as vertex, CREATOROS_FIELD_PAINT_FRAGMENT_SHADER as paint } from './src/components/CreatorOSFieldShader';
window.novaShaders = { fragment, vertex, paint };
function Harness() {
  const [props, setProps] = React.useState({metabloomPalette:'spectral',isDark:true});
  window.setNovaProps = patch => flushSync(() => setProps(old => ({...old,...patch})));
  return <CreatorOSFieldCanvas metabloomAvatarEnabled metabloomSceneTransitions {...props} />;
}
createRoot(document.getElementById('root')).render(<Harness/>);`,
  },
  bundle: true, write: false, format: 'iife', loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const instrumentation = `
window.novaStats = { uniforms:{}, draws:0, programs:0, contexts:0, errors:[] };
const proto = WebGL2RenderingContext.prototype;
const names = new Map();
const getUniform = proto.getUniformLocation;
proto.getUniformLocation = function(p,n){const location=getUniform.call(this,p,n);if(location)names.set(location,n);return location;};
const uniform = proto.uniform1f;
proto.uniform1f=function(l,v){if(names.has(l)){const name=names.get(l);novaStats.uniforms[name]=v;if(name==='u_novaTime'&&window.captureNovaResume){window.novaResumeTime=v;window.captureNovaResume=false;}}return uniform.call(this,l,v);};
const draw=proto.drawArrays;
proto.drawArrays=function(...a){novaStats.draws++;return draw.apply(this,a);};
const program=proto.createProgram;
proto.createProgram=function(...a){novaStats.programs++;return program.apply(this,a);};
const getContext=HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext=function(type,options){const gl=getContext.call(this,type,options);if(type==='webgl2'&&gl)novaStats.contexts++;return gl;};
`;
const html = `<!doctype html><html><body style="margin:0;background:#080809"><div id="root" style="position:absolute;inset:0"></div><style>.creatoros-field-shell,.creatoros-field-canvas{position:absolute;inset:0;width:100%;height:100%}.creatoros-field-canvas{image-rendering:pixelated}</style><script>${instrumentation}</script><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
const server = http.createServer((req,res) => {res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:480,height:600}});
  const errors = [];
  page.on('pageerror',error => errors.push(String(error)));
  page.on('console',m => {if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/?graphics=webgl`);
  await page.waitForFunction(() => window.novaStats?.draws > 2);
  const initial = await page.evaluate(() => {window.originalNovaCanvas=document.querySelector('canvas');return {...novaStats};});
  await page.evaluate(() => setNovaProps({metabloomPalette:'nova'}));
  await page.waitForFunction(() => novaStats.uniforms.u_metabloomNovaMix > .999);
  await page.waitForTimeout(800);
  assert(await page.evaluate(() => originalNovaCanvas===document.querySelector('canvas')));
  const active = await page.evaluate(() => ({...novaStats}));
  assert.equal(active.programs,initial.programs,'finish change must not compile another program');
  assert.equal(active.contexts,initial.contexts,'finish change must not create another context');
  assert(active.uniforms.u_novaTime>0);
  await page.evaluate(() => setNovaProps({metabloomPalette:'metalnova'}));
  await page.waitForFunction(() => novaStats.uniforms.u_metabloomPaletteMix>.999 && novaStats.uniforms.u_metabloomNovaMix>.999);
  assert(await page.evaluate(() => originalNovaCanvas===document.querySelector('canvas')));
  const metal = await page.evaluate(() => ({...novaStats}));
  assert.equal(metal.programs,initial.programs);assert.equal(metal.contexts,initial.contexts);
  await page.evaluate(() => setNovaProps({metabloomPalette:'nova'}));
  await page.waitForFunction(() => novaStats.uniforms.u_metabloomPaletteMix<.001);
  // Pausing intentionally requests one static redraw. Wait for that frame,
  // rather than racing an arbitrary delay on a busy software GPU.
  const pauseDraws = await page.evaluate(() => {
    const draws = novaStats.draws;
    setNovaProps({paused:true});
    return draws;
  });
  await page.waitForFunction(draws => novaStats.draws > draws, pauseDraws);
  const paused = await page.evaluate(() => ({...novaStats}));
  await page.waitForTimeout(300);
  assert.deepEqual(await page.evaluate(() => [novaStats.draws,novaStats.uniforms.u_novaTime]),[paused.draws,paused.uniforms.u_novaTime],'paused fire must not tick');
  await page.evaluate(() => setNovaProps({metabloomPalette:'metalbloom'}));
  await page.waitForFunction(() => novaStats.uniforms.u_metabloomNovaMix===0);
  assert.equal(await page.evaluate(() => novaStats.uniforms.u_metabloomPaletteMix),1);
  assert.equal(await page.evaluate(() => novaStats.uniforms.u_novaTime),paused.uniforms.u_novaTime);
  await page.waitForTimeout(400);
  await page.evaluate(() => {window.captureNovaResume=true;setNovaProps({metabloomPalette:'nova',paused:false});});
  await page.waitForFunction(() => Number.isFinite(window.novaResumeTime));
  assert.equal(await page.evaluate(() => window.novaResumeTime),paused.uniforms.u_novaTime,'resume must not catch up paused wall time');
  await page.waitForFunction(() => novaStats.uniforms.u_metabloomNovaMix>.999);
  await page.evaluate(() => {
    window.hiddenNovaTime=novaStats.uniforms.u_novaTime;window.hiddenNovaDraws=novaStats.draws;
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => novaStats.draws===window.hiddenNovaDraws),'hidden tabs must not draw');
  await page.evaluate(() => {
    window.captureNovaResume=true;window.novaResumeTime=undefined;
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => Number.isFinite(window.novaResumeTime));
  assert(await page.evaluate(() => window.novaResumeTime===window.hiddenNovaTime),'hidden wall time must not advance the fire');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(() => novaStats.uniforms.u_novaTime===40);
  const reduced = await page.evaluate(() => novaStats.draws);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => novaStats.draws),reduced,'reduced motion must draw a static fire');
  // Compile the complete production shader and render deterministic frames.
  const pixels = await page.evaluate(() => {
    const canvas=document.createElement('canvas');canvas.width=240;canvas.height=300;
    const gl=canvas.getContext('webgl2',{premultipliedAlpha:true,preserveDrawingBuffer:true});
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    const paintShader=shader(gl.FRAGMENT_SHADER,novaShaders.paint);gl.deleteShader(paintShader);
    const p=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,novaShaders.vertex),fs=shader(gl.FRAGMENT_SHADER,novaShaders.fragment);
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
    const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(p,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    const loc=n=>gl.getUniformLocation(p,n);const f=(n,v)=>gl.uniform1f(loc(n),v);
    gl.uniform2f(loc('u_res'),240,300);gl.uniform2f(loc('u_pointer'),.5,.5);gl.uniform2f(loc('u_avatarScale'),1,1);
    f('u_seed',.37);f('u_intro',1);f('u_pulseAge',8);f('u_metabloomNovaMix',1);f('u_avatarEnabled',1);f('u_avatarCenterScale',1);f('u_avatarRadiusScale',1);
    function frame(time,light=0){f('u_novaTime',time);f('u_light',light);gl.drawArrays(gl.TRIANGLES,0,3);const data=new Uint8Array(240*300*4);gl.readPixels(0,0,240,300,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
    const first=frame(7),second=frame(7.4);let changed=0,warm=0,visible=0;
    for(let i=0;i<first.length;i+=4){if(first[i+3]>100){visible++;if(first[i]>=first[i+1]&&first[i+1]>=first[i+2])warm++;}if(first[i+3]!==second[i+3])changed++;}
    frame(7);const dark=canvas.toDataURL();frame(7,1);const light=canvas.toDataURL();
    const error=gl.getError();gl.deleteBuffer(b);gl.deleteProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {changed,warm,visible,error,dark,light};
  });
  assert.equal(pixels.error,0,'GL must not report errors');
  assert(pixels.visible>300,'flame must be visibly present');
  // Warm core and rainbow crest are verified separately in verify-nova-rainbow.mjs.
  assert(pixels.changed>200,'the flame silhouette must evolve, not only its color');
  assert.deepEqual(errors,[]);
  fs.mkdirSync('nova-review',{recursive:true});
  for(const theme of ['dark','light'])fs.writeFileSync(`nova-review/${theme}.png`,Buffer.from(pixels[theme].split(',')[1],'base64'));
  console.log('NOVA_DARK_PNG='+pixels.dark.split(',')[1]);
  console.log(JSON.stringify({result:'PASS',nativeShader:true,singleRenderer:true,pause:true,reducedMotion:true,visible:pixels.visible,warm:pixels.warm,changedAlphaPixels:pixels.changed}));
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
