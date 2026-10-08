// RGB-only Nova palette regressions. Run after npm ci with Playwright on NODE_PATH.
// These masked checks replace the obsolete whole-flame warm-colour assertions.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = 'feaf02478234de961f9ab9d2c30171ca3190218d';
const readBase = name => execFileSync('git', ['show', `${base}:src/components/${name}`], {encoding:'utf8'});
const previousNova = readBase('MetabloomNovaShader.js').split('`')[1];
const before = readBase('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1]
  .split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', previousNova);
const bundle = await build({stdin:{resolveDir:process.cwd(),contents:`import {CREATOROS_FIELD_FRAGMENT_SHADER as current,CREATOROS_FIELD_VERTEX_SHADER as vertex} from './src/components/CreatorOSFieldShader'; window.shaders={current,vertex};`},bundle:true,write:false,format:'iife'});
const inspect = ({before, current, vertex}) => {
  const canvas = document.querySelector('canvas');
  const gl = canvas.getContext('webgl2', {preserveDrawingBuffer:true, premultipliedAlpha:true});
  if (!gl) throw Error('WebGL2 is required for Nova palette verification');
  const prismReturn = 'return vec4(mix(fire.rgb, outlineTint, prismMask * mix(0.92, 0.90, u_light)), fire.a);';
  if (!current.includes(prismReturn)) throw Error('Missing prism inspection point');
  const mask = current.replace(prismReturn,
    'return vec4(yellowFlame * exposedFlame, step(1.20, flameSurface.w), step(0.91, liftedSignal), 1.0);');
  const bodyProbe = current.slice(0,current.lastIndexOf('void main()')) + `void main() {
    vec3 silver = vec3(0.80, 0.85, 0.90);
    vec4 fire = vec4(1.0, 0.5, 0.0, 0.8);
    vec4 metal = novaMetalFinish(fire, vec4(silver, 0.8), 0.8,
      vec4(v_uv.x, 0.0, 0.0, v_uv.x * 3.0));
    fragColor = vec4(metal.rgb, 1.0);
  }`;
  const rootProbe = current.slice(0,current.lastIndexOf('void main()')) + `void main() {
    vec4 metal = novaMetalFinish(vec4(0.0,0.0,0.0,1.0),vec4(0.0),0.0,
      vec4(v_uv.x,1.0,0.0,0.0));
    fragColor = vec4(metal.rgb,1.0);
  }`;
  function compile(type,source) {
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;
  }
  const vs=compile(gl.VERTEX_SHADER,vertex),programs={};
  for(const [name,source] of Object.entries({before,current,mask,bodyProbe,rootProbe})) {
    const p=gl.createProgram(),s=compile(gl.FRAGMENT_SHADER,source);
    gl.attachShader(p,vs);gl.attachShader(p,s);gl.linkProgram(p);gl.deleteShader(s);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));programs[name]=p;
  }
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  function frame(name,palette,seed,time,light,width,height,mode=0) {
    canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);
    const p=programs[name];gl.useProgram(p);
    const a=gl.getAttribLocation(p,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    const loc=n=>gl.getUniformLocation(p,n), f=(n,v)=>gl.uniform1f(loc(n),v);
    gl.uniform2f(loc('u_res'),width,height);gl.uniform2f(loc('u_pointer'),.52,.52);
    gl.uniform2f(loc('u_pulseOrigin'),.52,.52);gl.uniform2f(loc('u_avatarScale'),1,1);
    f('u_avatarEnabled',1);f('u_avatarCenterScale',1);f('u_avatarRadiusScale',1);f('u_intro',1);f('u_pulseAge',8);
    f('u_seed',seed);f('u_time',time);f('u_novaTime',time);f('u_light',light);
    f('u_metabloomPaletteMix',palette==='metalbloom'||palette==='metalnova'?1:0);
    f('u_metabloomNovaMix',palette==='nova'||palette==='metalnova'?1:0);
    gl.uniform1i(loc('u_modeA'),mode);gl.uniform1i(loc('u_modeB'),mode);
    gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(width*height*4);
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;
  }
  let unchanged=true,alphaUnchanged=true,metalAlphaMatches=true,coreChanges=0;
  let yellowRegionPixels=0,rainbowRegionChanges=0,rainbowChromaticPixels=0,metalBeforeDark=0,metalAfterDark=0;
  const images={},cases=[];
  for(const [width,height] of [[240,300],[360,225]]) for(const seed of [.17,.37,.81])
  for(const time of [7,19]) for(const light of [0,1]) {
    for(const [palette,mode] of [['spectral',0],['metalbloom',0],['nova',1],['metalnova',3]]) {
      const a=frame('before',palette,seed,time,light,width,height,mode),b=frame('current',palette,seed,time,light,width,height,mode);
      if(a.some((v,i)=>v!==b[i]))unchanged=false;
    }
    const oldNova=frame('before','nova',seed,time,light,width,height);
    if(seed===.37&&time===7&&width===240)images[`nova-before-${light}`]=canvas.toDataURL();
    const nova=frame('current','nova',seed,time,light,width,height);
    if(seed===.37&&time===7&&width===240)images[`nova-after-${light}`]=canvas.toDataURL();
    const oldMetal=frame('before','metalnova',seed,time,light,width,height);
    if(seed===.37&&time===7&&width===240)images[`metalnova-before-${light}`]=canvas.toDataURL();
    const metal=frame('current','metalnova',seed,time,light,width,height);
    if(seed===.37&&time===7&&width===240)images[`metalnova-after-${light}`]=canvas.toDataURL();
    const diagnostic=frame('mask','nova',seed,time,light,width,height);
    let changed=0;
    for(let i=0;i<nova.length;i+=4) {
      if(nova[i+3]!==oldNova[i+3]||metal[i+3]!==oldMetal[i+3])alphaUnchanged=false;
      if(nova[i+3]!==metal[i+3])metalAlphaMatches=false;
      const differs=nova[i]!==oldNova[i]||nova[i+1]!==oldNova[i+1]||nova[i+2]!==oldNova[i+2];
      if(differs)changed++;
      if(differs&&diagnostic[i+1]>250)coreChanges++;
      if(diagnostic[i]>200&&diagnostic[i+2]>250&&nova[i+3]>60) {
        yellowRegionPixels++;if(differs)rainbowRegionChanges++;
        if(nova[i+1]>nova[i]+8||nova[i+2]>nova[i+1]+8)rainbowChromaticPixels++;
      }
      if(metal[i+3]>160) {
        const oldLuma=oldMetal[i]*.2126+oldMetal[i+1]*.7152+oldMetal[i+2]*.0722;
        const newLuma=metal[i]*.2126+metal[i+1]*.7152+metal[i+2]*.0722;
        if(oldLuma<35)metalBeforeDark++;if(newLuma<35)metalAfterDark++;
      }
    }
    cases.push({width,height,seed,time,light,changed});
  }
  const probes=[];
  for(const light of [0,1]) {
    const body=frame('bodyProbe','metalnova',.37,7,light,64,8);
    const bodyUntinted=body.every((v,i)=>i%4===3?v===255:Math.abs(v-[204,217,230][i%4])<=1);
    const roots=frame('rootProbe','metalnova',.37,7,light,64,8);
    const samples=[0,16,32,48,63].map(x=>[...roots.slice((4*64+x)*4,(4*64+x)*4+3)]);
    probes.push({light,bodyUntinted,samples});
  }
  const error=gl.getError();gl.deleteBuffer(buffer);Object.values(programs).forEach(p=>gl.deleteProgram(p));
  gl.deleteShader(vs);gl.getExtension('WEBGL_lose_context')?.loseContext();
  return {unchanged,alphaUnchanged,metalAlphaMatches,coreChanges,yellowRegionPixels,rainbowRegionChanges,rainbowChromaticPixels,metalBeforeDark,metalAfterDark,probes,cases,error,images};
};
let browser;
try {
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage();await page.setContent('<canvas></canvas>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(inspect,{before,...await page.evaluate(()=>window.shaders)});
  fs.mkdirSync('nova-review',{recursive:true});
  for(const [name,image] of Object.entries(result.images))fs.writeFileSync(`nova-review/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
  delete result.images;fs.writeFileSync('nova-review/rainbow-report.json',JSON.stringify(result,null,2));
  assert.equal(result.error,0);assert(result.unchanged,'other finishes and activity scenes must remain pixel-identical');
  assert(result.alphaUnchanged&&result.metalAlphaMatches,'both Nova silhouettes, placement and transparency must remain identical');
  assert.equal(result.coreChanges,0,'the native Nova body must not be recoloured');
  assert(result.yellowRegionPixels>100&&result.rainbowRegionChanges/result.yellowRegionPixels>.80,'rainbow must fill the yellow crest, not just its outline');
  assert(result.rainbowChromaticPixels>100,'the crest must contain visible non-fire spectrum, not just white');
  assert(result.metalBeforeDark>100&&result.metalAfterDark<result.metalBeforeDark*.25,'the added black perimeter must be removed');
  assert(result.probes.every(p=>p.bodyUntinted),'the supplied metal reflections must not receive extra dark body shading');
  assert(result.probes.every(p=>p.samples[0].every(v=>v>=120)&&p.samples.every((rgb,i)=>i===0||rgb.every((v,c)=>v>=p.samples[i-1][c]))),'metal flame roots must be silver and brighten outward');
  console.log(JSON.stringify({result:'PASS',cases:result.cases.length,coreChanges:result.coreChanges,alphaUnchanged:result.alphaUnchanged,rainbowRegionChanges:result.rainbowRegionChanges,rainbowChromaticPixels:result.rainbowChromaticPixels,metalBeforeDark:result.metalBeforeDark,metalAfterDark:result.metalAfterDark}));
} finally {await browser?.close();}
