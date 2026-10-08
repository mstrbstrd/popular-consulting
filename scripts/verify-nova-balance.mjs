// Local, deterministic shader comparison. Requires npm ci, Playwright, and the
// preceding floating-field commit. Never connects to a user session or service.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = '3dac97bc1aab97091b31c191005090fa89518bdd';
const readBase = name => execFileSync('git', ['show', `${base}:src/components/${name}`], { encoding: 'utf8' });
const originalNova = readBase('MetabloomNovaShader.js').split('`')[1];
const original = readBase('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1]
  .split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', originalNova);
assert(original.includes('novaEdgeFlow'));
const bundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `import { CREATOROS_FIELD_FRAGMENT_SHADER as fragment, CREATOROS_FIELD_VERTEX_SHADER as vertex } from './src/components/CreatorOSFieldShader'; window.shaders={fragment,vertex};` },
  bundle: true, write: false, format: 'iife',
});
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<canvas id="field"></canvas>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(({ original }) => {
    const canvas = document.getElementById('field');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw Error('WebGL2 required for Nova balance verification');
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
    function frame(program, palette, seed, time, light, width, height) {
      canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);gl.useProgram(program);
      const attribute=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
      const loc=n=>gl.getUniformLocation(program,n);const f=(n,v)=>gl.uniform1f(loc(n),v);
      gl.uniform2f(loc('u_res'),width,height);gl.uniform2f(loc('u_pointer'),.52,.52);
      gl.uniform2f(loc('u_pulseOrigin'),.52,.52);gl.uniform2f(loc('u_avatarOffset'),0,0);gl.uniform2f(loc('u_avatarScale'),1,1);
      f('u_avatarEnabled',1);f('u_avatarCenterScale',1);f('u_avatarRadiusScale',1);
      f('u_seed',seed);f('u_time',time);f('u_novaTime',time);f('u_intro',1);f('u_pulseAge',8);
      f('u_light',light);f('u_metabloomPaletteMix',palette==='metalbloom'?1:0);f('u_metabloomNovaMix',palette==='nova'?1:0);
      gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
    }
    const images={},measurements=[];let unchanged=true,preserved=true,previousFringe=0,balancedFringe=0,maxCentreShift=0;
    for(const [width,height] of [[240,300],[360,225]]) for(const seed of [.17,.37,.81]) for(const time of [7,19]) for(const light of [0,1]) {
      for(const palette of ['spectral','metalbloom']) {
        const a=frame(before,palette,seed,time,light,width,height),b=frame(after,palette,seed,time,light,width,height);
        if(a.some((value,i)=>value!==b[i]))unchanged=false;
      }
      const native=frame(after,'spectral',seed,time,light,width,height);
      const a=frame(before,'nova',seed,time,light,width,height);
      if(width===240&&seed===.37&&time===7)images[`before-${light}`]=canvas.toDataURL();
      const b=frame(after,'nova',seed,time,light,width,height);
      if(width===240&&seed===.37&&time===7)images[`balanced-${light}`]=canvas.toDataURL();
      let n=0,x=0,y=0,f=0,fx=0,fy=0,warm=0,visible=0;
      for(let i=0;i<native.length;i+=4){
        const col=(i/4)%width,row=Math.floor(i/4/width);
        if(native[i+3]>b[i+3]+1)preserved=false;
        previousFringe+=Math.max(0,a[i+3]-native[i+3]);balancedFringe+=Math.max(0,b[i+3]-native[i+3]);
        const na=native[i+3]/255,ba=b[i+3]/255;n+=na;x+=col*na;y+=row*na;f+=ba;fx+=col*ba;fy+=row*ba;
        if(b[i+3]>160){visible++;if(b[i]>=b[i+1]&&b[i+1]>=b[i+2])warm++;}
      }
      const shift=Math.hypot(fx/f-x/n,fy/f-y/n)/height;maxCentreShift=Math.max(maxCentreShift,shift);
      measurements.push({width,height,seed,time,light,shift,warmRatio:warm/Math.max(1,visible)});
    }
    const error=gl.getError();gl.deleteBuffer(buffer);gl.deleteProgram(before);gl.deleteProgram(after);gl.deleteShader(vertex);gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {unchanged,preserved,fringeRatio:balancedFringe/Math.max(1,previousFringe),maxCentreShift,error,measurements,images};
  }, { original });
  fs.mkdirSync('nova-review',{recursive:true});
  for(const [name,data] of Object.entries(result.images))fs.writeFileSync(`nova-review/balance-${name}.png`,Buffer.from(data.split(',')[1],'base64'));
  delete result.images;
  fs.writeFileSync('nova-review/balance-report.json',JSON.stringify(result,null,2));
  assert.equal(result.error,0);assert(result.unchanged,'other finishes must remain pixel-identical');
  assert(result.preserved,'the complete floating body must remain intact');
  assert(result.fringeRatio>1.2&&result.fringeRatio<2.8,'flames must gain volume without overwhelming the floating body');
  assert(result.maxCentreShift<.055,'fire must not relocate the floating body');
  assert(result.measurements.every(m=>m.warmRatio>.98),'Nova must keep its fire palette');
  console.log(JSON.stringify({result:'PASS',cases:result.measurements.length,fringeRatio:result.fringeRatio,maxCentreShift:result.maxCentreShift}));
} finally {await browser?.close();}
