// Run after npm ci; Playwright can be supplied through NODE_PATH.
// All rendering is local, with deterministic, non-user test inputs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const base = 'b10aca04bbfa542d32316741c8ca4795d28d927b';
const readBase = name => execFileSync('git', ['show', `${base}:src/components/${name}`], { encoding: 'utf8' });
const originalNova = readBase('MetabloomNovaShader.js').split('`')[1];
const original = readBase('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1]
  .split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', originalNova);
assert(original.includes('sceneNovaFire'));
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `import { CREATOROS_FIELD_FRAGMENT_SHADER as fragment, CREATOROS_FIELD_VERTEX_SHADER as vertex } from './src/components/CreatorOSFieldShader'; window.shaders={fragment,vertex};` },
  bundle: true, write: false, format: 'iife',
});
let browser;
try {
  browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  const page = await browser.newPage();
  await page.setContent('<canvas id="field"></canvas>');
  await page.addScriptTag({content: bundle.outputFiles[0].text});
  const result = await page.evaluate(({ original }) => {
    const canvas = document.getElementById('field');
    const gl = canvas.getContext('webgl2', {premultipliedAlpha: true, preserveDrawingBuffer: true});
    if (!gl) throw Error('WebGL2 required for floating-field verification');
    function shader(type, source) {
      const value = gl.createShader(type); gl.shaderSource(value, source); gl.compileShader(value);
      if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(value));
      return value;
    }
    const vertex = shader(gl.VERTEX_SHADER, shaders.vertex);
    function program(source) {
      const fragment = shader(gl.FRAGMENT_SHADER, source), value = gl.createProgram();
      gl.attachShader(value, vertex); gl.attachShader(value, fragment); gl.linkProgram(value); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(value, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(value));
      return value;
    }
    const before = program(original), after = program(shaders.fragment);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    function frame(program, palette, seed, time, light, pose, width, height) {
      canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);gl.useProgram(program);
      const attribute=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      const loc=n=>gl.getUniformLocation(program,n);const f=(n,v)=>gl.uniform1f(loc(n),v);
      gl.uniform2f(loc('u_res'),width,height);gl.uniform2f(loc('u_pointer'),.52,.52);
      gl.uniform2f(loc('u_pulseOrigin'),.52,.52);gl.uniform2f(loc('u_avatarOffset'),pose ? .055 : 0,pose ? .035 : 0);
      gl.uniform2f(loc('u_avatarScale'),pose ? 1.06 : 1,pose ? .96 : 1);
      f('u_avatarRotation',pose ? .10 : 0);f('u_avatarCenterScale',pose ? .7 : 1);f('u_avatarRadiusScale',1);
      f('u_avatarBurst',pose ? .08 : 0);f('u_avatarOrbit',pose ? .15 : 0);f('u_avatarTremble',0);
      f('u_avatarEnabled',1);f('u_avatarIntensity',.4);f('u_avatarExpression',0);f('u_avatarTalking',0);
      f('u_seed',seed);f('u_time',time);f('u_novaTime',time);f('u_intro',1);f('u_pulseAge',8);f('u_energy',0);
      f('u_light',light);f('u_metabloomPaletteMix',palette==='metalbloom'?1:0);f('u_metabloomNovaMix',palette==='nova'?1:0);
      gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
    }
    const measurements=[], images={};let unchanged=true, preserved=true, maxCentreShift=0;
    for (const [width,height] of [[240,300],[360,225]]) for (const seed of [.17,.37,.81]) for (const time of [7,19]) for (const light of [0,1]) {
      const pose=time===19;
      for (const palette of ['spectral','metalbloom']) {
        const a=frame(before,palette,seed,time,light,pose,width,height), b=frame(after,palette,seed,time,light,pose,width,height);
        if (a.some((value,i)=>value!==b[i])) unchanged=false;
      }
      const native=frame(after,'spectral',seed,time,light,pose,width,height);
      if(width===240&&seed===.37&&time===7) images[`spectral-${light}`]=canvas.toDataURL();
      const nova=frame(after,'nova',seed,time,light,pose,width,height);
      if(width===240&&seed===.37&&time===7) images[`nova-${light}`]=canvas.toDataURL();
      let n=0,x=0,y=0,f=0,fx=0,fy=0,warm=0,visible=0;
      for(let i=0;i<native.length;i+=4){
        const col=(i/4)%width,row=Math.floor(i/4/width);
        if(native[i+3]>nova[i+3]+1)preserved=false;
        const a=native[i+3]/255,b=nova[i+3]/255;n+=a;x+=col*a;y+=row*a;f+=b;fx+=col*b;fy+=row*b;
        if(nova[i+3]>160){visible++;if(nova[i]>=nova[i+1]&&nova[i+1]>=nova[i+2])warm++;}
      }
      const shift=Math.hypot(fx/f-x/n,fy/f-y/n)/height;
      maxCentreShift=Math.max(maxCentreShift,shift);
      measurements.push({width,height,seed,time,light,shift,areaRatio:f/n,warmRatio:warm/Math.max(1,visible)});
    }
    const error=gl.getError();gl.deleteBuffer(buffer);gl.deleteProgram(before);gl.deleteProgram(after);gl.deleteShader(vertex);gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {unchanged,preserved,maxCentreShift,error,measurements,images};
  }, {original});
  fs.mkdirSync('nova-review',{recursive:true});
  for(const [name,data] of Object.entries(result.images)) fs.writeFileSync(`nova-review/floating-${name}.png`,Buffer.from(data.split(',')[1],'base64'));
  delete result.images;
  fs.writeFileSync('nova-review/floating-report.json',JSON.stringify(result,null,2));
  assert.equal(result.error,0);
  assert(result.unchanged,'Spectral and Metalbloom pixels must remain identical to the baseline');
  assert(result.preserved,'Nova must retain the whole native Metabloom body');
  assert(result.maxCentreShift<.055,'fire edges must not relocate the native floating body');
  assert(result.measurements.every(m=>m.warmRatio>.98),'Nova must stay in the fire palette');
  console.log(JSON.stringify({result:'PASS',cases:result.measurements.length,unchangedOtherFinishes:true,nativeBodyPreserved:true,maxCentreShift:result.maxCentreShift}));
} finally {await browser?.close();}
