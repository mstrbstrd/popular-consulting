// Deterministic local shader checks. No network, user session, or live data.
// Run after npm ci with Playwright available through NODE_PATH.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = 'a4db1f2b79c075ae97819bdb6adef84733022964';
const readBase = name => execFileSync('git', ['show', `${base}:src/components/${name}`], { encoding: 'utf8' });
const previousNova = readBase('MetabloomNovaShader.js').split('`')[1];
const previous = readBase('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1]
  .split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', previousNova);
const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`import {CREATOROS_FIELD_FRAGMENT_SHADER as current, CREATOROS_FIELD_VERTEX_SHADER as vertex} from './src/components/CreatorOSFieldShader'; window.shaders={current,vertex};`},bundle:true,write:false,format:'iife'});

const inspect = ({ previous, current, vertex }) => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2', {preserveDrawingBuffer:true, premultipliedAlpha:true});
  if (!gl) throw Error('WebGL2 required');
  const centred = current.replace('const float NOVA_VERTICAL_OFFSET = 0.10;', 'const float NOVA_VERTICAL_OFFSET = 0.0;');
  if (centred === current) throw Error('Headroom constant changed; update the placement oracle explicitly');
  const prismReturn = 'return vec4(mix(fire.rgb, outlineTint, prismMask * mix(0.46, 0.45, u_light)), fire.a);';
  if (!centred.includes(prismReturn)) throw Error('Missing prism return for mask inspection');
  const mask = centred.replace(prismReturn, 'return vec4(prismMask, step(1.20, flameSurface.w) * 0.5 + step(1.75, flameSurface.w) * 0.5, 1.0 - step(0.82, liftedSignal), 1.0);');
  const noPrism = centred.replace(prismReturn, 'return fire;');
  const ramp = centred.slice(0, centred.lastIndexOf('void main()')) + `void main() {
    float progress = v_uv.x;
    vec4 surface;
    float potential = mix(1.0, 0.30, progress);
    float liftedPotential = mix(1.5, 0.70, progress) / 1.19;
    vec4 fire = novaFireMaterial(vec4(0.0), vec3(potential, 0.5, 0.0),
      vec3(0.0, 0.0, 0.5), liftedPotential, 0.0, surface);
    vec4 metal = novaMetalFinish(fire, vec4(1.0), 0.0, surface);
    fragColor = vec4(metal.rgb, 1.0);
  }`;
  function compile(type, source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs=compile(gl.VERTEX_SHADER,vertex),programs={};
  for(const [name,source] of Object.entries({previous,current,centred,mask,noPrism,ramp})) {
    const p=gl.createProgram(),s=compile(gl.FRAGMENT_SHADER,source);gl.attachShader(p,vs);gl.attachShader(p,s);gl.linkProgram(p);gl.deleteShader(s);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));programs[name]=p;
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  function frame(name,palette,seed,time,light,width,height,mode=0) {
    canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);const p=programs[name];gl.useProgram(p);
    const a=gl.getAttribLocation(p,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    const loc=n=>gl.getUniformLocation(p,n),f=(n,v)=>gl.uniform1f(loc(n),v);
    gl.uniform2f(loc('u_res'),width,height);gl.uniform2f(loc('u_pointer'),.52,.52);gl.uniform2f(loc('u_pulseOrigin'),.52,.52);gl.uniform2f(loc('u_avatarScale'),1,1);
    f('u_avatarEnabled',1);f('u_avatarCenterScale',1);f('u_avatarRadiusScale',1);f('u_intro',1);f('u_pulseAge',8);
    f('u_seed',seed);f('u_time',time);f('u_novaTime',time);f('u_light',light);
    f('u_metabloomPaletteMix',palette==='metalbloom'||palette==='metalnova'?1:0);f('u_metabloomNovaMix',palette==='nova'||palette==='metalnova'?1:0);
    gl.uniform1i(loc('u_modeA'),mode);gl.uniform1i(loc('u_modeB'),mode);
    gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
  }
  let othersUnchanged=true,alphaPreserved=true,sameFireSilhouette=true,bodyPrismPixels=0,tipPixels=0,wispPixels=0,coreChanges=0,visiblePrismPixels=0;
  const images={},placements=[],ramps=[];
  for(const [width,height] of [[240,300],[360,225]]) for(const seed of [.17,.37,.81]) for(const time of [7,19]) for(const light of [0,1]) {
    for(const [palette,mode] of [['spectral',0],['metalbloom',0],['nova',1],['metalnova',3]]) {
      const a=frame('previous',palette,seed,time,light,width,height,mode),b=frame('current',palette,seed,time,light,width,height,mode);
      if(a.some((v,i)=>v!==b[i]))othersUnchanged=false;
    }
    const old=frame('previous','nova',seed,time,light,width,height);
    const centre=frame('centred','nova',seed,time,light,width,height);
    const diagnostic=frame('mask','nova',seed,time,light,width,height);
    const plain=frame('noPrism','nova',seed,time,light,width,height);
    const now=frame('current','nova',seed,time,light,width,height);
    if(seed===.37&&time===7&&width===240)images[`nova-corrected-${light}`]=canvas.toDataURL();
    const metal=frame('current','metalnova',seed,time,light,width,height);
    if(seed===.37&&time===7&&width===240)images[`metalnova-corrected-${light}`]=canvas.toDataURL();
    let oldMass=0,newMass=0,oldY=0,newY=0,oldTop=0,newTop=0;
    for(let i=0;i<now.length;i+=4) {
      if(old[i+3]!==centre[i+3])alphaPreserved=false;
      if(now[i+3]!==metal[i+3])sameFireSilhouette=false;
      if(diagnostic[i]>12) {
        if(diagnostic[i+1]>50)bodyPrismPixels++;
        if(diagnostic[i+2]>128)wispPixels++;else tipPixels++;
      }
      const differs=centre[i]!==plain[i]||centre[i+1]!==plain[i+1]||centre[i+2]!==plain[i+2];
      if(differs&&centre[i+3]>10)visiblePrismPixels++;
      if(diagnostic[i+1]>250&&(old[i]!==centre[i]||old[i+1]!==centre[i+1]||old[i+2]!==centre[i+2]))coreChanges++;
      const y=Math.floor(i/4/width);oldMass+=old[i+3];newMass+=now[i+3];oldY+=old[i+3]*y;newY+=now[i+3]*y;
      if(y===height-1){if(old[i+3]>100)oldTop++;if(now[i+3]>100)newTop++;}
    }
    placements.push({width,height,seed,time,light,downwardShift:(oldY/oldMass-newY/newMass)/height,oldTop,newTop});
  }
  for(const palette of ['nova','metalnova'])for(const light of [0,1]) {
    const data=frame('ramp',palette,.37,7,light,256,16);
    const samples=[.04,.24,.44,.64,.84].map(t=>{const i=(8*256+Math.floor(t*256))*4;return {position:t,rgb:[...data.slice(i,i+3)],luma:.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]};});
    ramps.push({palette,light,samples});
  }
  const error=gl.getError();gl.deleteBuffer(buffer);Object.values(programs).forEach(p=>gl.deleteProgram(p));gl.deleteShader(vs);gl.getExtension('WEBGL_lose_context')?.loseContext();
  return {othersUnchanged,alphaPreserved,sameFireSilhouette,bodyPrismPixels,tipPixels,wispPixels,coreChanges,visiblePrismPixels,placements,ramps,error,images};
};
// END INSPECT
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();await page.setContent('<canvas></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
  const shaders=await page.evaluate(()=>window.shaders);
  const result=await page.evaluate(inspect,{previous,...shaders});
  fs.mkdirSync('nova-review',{recursive:true});
  for(const [name,image] of Object.entries(result.images))fs.writeFileSync(`nova-review/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
  delete result.images;fs.writeFileSync('nova-review/surface-report.json',JSON.stringify(result,null,2));
  assert.equal(result.error,0);assert(result.othersUnchanged,'other finishes and activity scenes must not move or recolour');
  assert(result.alphaPreserved,'only placement may change the existing flame silhouette');assert(result.sameFireSilhouette,'both fire finishes must move together');
  assert.equal(result.bodyPrismPixels,0,'the native orb and flame roots must never receive the prism mask');
  assert.equal(result.coreChanges,0,'Nova dense interiors must retain their original colours');
  assert(result.tipPixels>100&&result.wispPixels>100&&result.visiblePrismPixels>100,'tips AND outer wisps must carry visible prism');
  assert(result.placements.every(p=>p.downwardShift>.04&&p.downwardShift<.12&&p.newTop<=p.oldTop),'both fire bodies must move down, not scale or rise');
  assert(result.placements.filter(p=>p.seed===.37).every(p=>p.newTop===0),'the previously clipped reference pose must clear the top');
  assert(result.ramps.every(r=>r.samples.every((s,i)=>i===0||s.luma>=r.samples[i-1].luma)),'flame colour must brighten outward for both palettes');
  console.log(JSON.stringify({result:'PASS',cases:result.placements.length,bodyPrismPixels:result.bodyPrismPixels,tipPixels:result.tipPixels,wispPixels:result.wispPixels,gradients:result.ramps.length}));
} finally {await browser?.close();}
