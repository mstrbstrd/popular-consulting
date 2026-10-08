// Local shader and real finish-selector checks. No user session or external APIs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { build } from 'esbuild';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = '2616cf6b14e96376b2f3676e4bda37c26c1ab8a8';
const readBase = name => execFileSync('git', ['show', `${base}:src/components/${name}`], { encoding: 'utf8' });
const previousNova = readBase('MetabloomNovaShader.js').split('`')[1];
const previousShader = readBase('CreatorOSFieldShader.js').split('export const CREATOROS_FIELD_FRAGMENT_SHADER = `')[1].split('`;')[0].replace('${METABLOOM_NOVA_SHADER}', previousNova);
const shaderBundle = await build({
  stdin: { resolveDir: process.cwd(), contents: `import { CREATOROS_FIELD_FRAGMENT_SHADER as fragment, CREATOROS_FIELD_VERTEX_SHADER as vertex } from './src/components/CreatorOSFieldShader'; window.shaders={fragment,vertex};` },
  bundle: true, write: false, format: 'iife',
});
fs.mkdirSync('nova-review', { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setContent('<canvas id="field"></canvas>');
  await page.addScriptTag({ content: shaderBundle.outputFiles[0].text });
  const result = await page.evaluate(({ previousShader }) => {
    const canvas = document.getElementById('field');
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw Error('WebGL2 is required for MetalNova verification');
    function compile(type, source) {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const vertex = compile(gl.VERTEX_SHADER, shaders.vertex);
    function program(source) {
      const fragment = compile(gl.FRAGMENT_SHADER, source), program = gl.createProgram();
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      return program;
    }
    const before = program(previousShader), after = program(shaders.fragment);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
    function frame(program, palette, seed, time, light, width, height, mode = 0) {
      canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);gl.useProgram(program);
      const a=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
      const loc=n=>gl.getUniformLocation(program,n), f=(n,v)=>gl.uniform1f(loc(n),v);
      gl.uniform2f(loc('u_res'),width,height);gl.uniform2f(loc('u_pointer'),.52,.52);gl.uniform2f(loc('u_pulseOrigin'),.52,.52);
      gl.uniform2f(loc('u_avatarOffset'),time===19 ? .05 : 0,time===19 ? .035 : 0);gl.uniform2f(loc('u_avatarScale'),1,1);
      f('u_avatarEnabled',1);f('u_avatarCenterScale',time===19 ? .7 : 1);f('u_avatarRadiusScale',1);
      f('u_seed',seed);f('u_time',time);f('u_novaTime',time);f('u_intro',1);f('u_pulseAge',8);f('u_light',light);
      gl.uniform1i(loc('u_modeA'),mode);gl.uniform1i(loc('u_modeB'),mode);
      f('u_metabloomPaletteMix',palette==='metalbloom'||palette==='metalnova'?1:0);
      f('u_metabloomNovaMix',palette==='nova'||palette==='metalnova'?1:0);
      gl.drawArrays(gl.TRIANGLES,0,3);const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
    }
    let unchanged=true,alphaUnchanged=true,coreUnchanged=true,metalAlphaMatches=true,changedEdgePixels=0,totalPixels=0,metalRed=0,metalBlue=0;
    const images={},cases=[];
    for(const [width,height] of [[240,300],[360,225]]) for(const seed of [.17,.37,.81]) for(const time of [7,19]) for(const light of [0,1]) {
      for(const palette of ['spectral','metalbloom']) {
        const a=frame(before,palette,seed,time,light,width,height),b=frame(after,palette,seed,time,light,width,height);
        if(a.some((v,i)=>v!==b[i]))unchanged=false;
      }
      const tidalBefore=frame(before,'spectral',seed,time,light,width,height,1),tidalAfter=frame(after,'metalnova',seed,time,light,width,height,1);
      if(tidalBefore.some((v,i)=>v!==tidalAfter[i]))unchanged=false;
      const a=frame(before,'nova',seed,time,light,width,height);
      if(width===240&&seed===.37&&time===7)images[`nova-before-${light}`]=canvas.toDataURL();
      const b=frame(after,'nova',seed,time,light,width,height);
      if(width===240&&seed===.37&&time===7)images[`nova-prism-${light}`]=canvas.toDataURL();
      const m=frame(after,'metalnova',seed,time,light,width,height);
      if(width===240&&seed===.37&&time===7)images[`metalnova-${light}`]=canvas.toDataURL();
      let changed=0;
      for(let i=0;i<a.length;i+=4) {
        if(a[i+3]!==b[i+3])alphaUnchanged=false;
        if(b[i+3]!==m[i+3])metalAlphaMatches=false;
        const rgbChanged=a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2];
        if(rgbChanged){changed++;if(a[i+3]>180)coreUnchanged=false;}
        if(m[i+3]>200){metalRed+=m[i];metalBlue+=m[i+2];}
      }
      changedEdgePixels+=changed;totalPixels+=a.length/4;cases.push({width,height,seed,time,light,changed});
    }
    const error=gl.getError();gl.deleteBuffer(buffer);gl.deleteProgram(before);gl.deleteProgram(after);gl.deleteShader(vertex);gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {unchanged,alphaUnchanged,coreUnchanged,metalAlphaMatches,changedEdgePixels,totalPixels,metalRed,metalBlue,error,cases,images};
  }, {previousShader});
  for(const [name,image] of Object.entries(result.images))fs.writeFileSync(`nova-review/${name}.png`,Buffer.from(image.split(',')[1],'base64'));
  delete result.images;
  fs.writeFileSync('nova-review/metalnova-report.json',JSON.stringify(result,null,2));
  assert.equal(result.error,0);assert(result.unchanged,'Spectral, Metalbloom and Tidal Weave must remain pixel-identical');
  assert(result.alphaUnchanged,'rainbow edges must not alter Nova alpha or placement');
  assert(result.coreUnchanged,'Nova interiors must remain unchanged');
  assert(result.metalAlphaMatches,'MetalNova must share Nova alpha and silhouette exactly');
  assert(result.changedEdgePixels>100,'the prismatic edge must visibly render');
  assert(result.changedEdgePixels/result.totalPixels<.12,'prism must remain a narrow edge, not a recoloured body');
  assert(result.metalBlue>result.metalRed,'MetalNova must be cool mercury, not orange fire');

  // Render the actual OrbPage component and its actual CSS. Only expensive page
  // neighbours are replaced; the real control, state and appearance persistence run.
  const harness = await build({
    stdin: { resolveDir: process.cwd(), loader:'jsx', contents: `import React from 'react';import {createRoot} from 'react-dom/client';import OrbPage from './src/components/OrbPage';window.appearanceNavigation={getToolState:()=>({palette:'metalnova'}),saveToolState:(key,value)=>window.savedAppearance={key,value}};const root=createRoot(document.getElementById('root'));window.unmountOrb=()=>root.unmount();root.render(<OrbPage/>);` },
    bundle:true,write:false,outdir:'nova-review/control',format:'iife',loader:{'.js':'jsx'},define:{'process.env.NODE_ENV':'"production"'},
    plugins:[{name:'local-orb-neighbours',setup(b){
      b.onResolve({filter:/^\.\/(NavMenu|OrbSection|ImmersiveRouteNavigationBridge|LoadingOverlay)$/},a=>a.importer.endsWith('/OrbPage.js')?{path:a.path,namespace:'orb-neighbour'}:undefined);
      b.onResolve({filter:/AppNavigationContext$/},()=>({path:'navigation',namespace:'orb-neighbour'}));
      b.onLoad({filter:/.*/,namespace:'orb-neighbour'},a=>({resolveDir:process.cwd(),loader:'jsx',contents:a.path==='navigation'?`export const useAppNavigation=()=>window.appearanceNavigation;`:a.path==='./OrbSection'?`import React from 'react';import {useMetabloomPalette} from './src/contexts/MetabloomPaletteContext';export default function Section({onConversationStateChange}){const p=useMetabloomPalette();return <div id="experience" data-palette={p}><button onClick={()=>onConversationStateChange(true)}>Begin conversation</button></div>;}`:`export default function Stub(){return null;}`}));
    }}],
  });
  const css=harness.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('\n');
  const js=harness.outputFiles.find(f=>f.path.endsWith('.js')).text;
  const layouts=[];
  for(const width of [320,390,768,1440]) for(const theme of ['light','dark']) {
    const control=await browser.newPage({viewport:{width,height:844}});
    const errors=[];control.on('pageerror',e=>errors.push(String(e)));
    await control.setContent('<!doctype html><html><head><style>:root{--aetheris-font-mono:monospace;--aetheris-radius-pill:999px;--aetheris-glass-panel:#eee;--aetheris-ink-2:#222;--orb-finish-gutter:20px;}body{margin:0}</style></head><body><div id="root"></div></body></html>');
    await control.addStyleTag({content:css});await control.addScriptTag({content:js});
    await control.waitForSelector('.orb-page__finish-option[data-palette="metalnova"][aria-pressed="true"]');
    await control.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    const group=control.getByRole('group',{name:'Metabloom material finish'});
    assert.equal(await group.getByRole('button').count(),4);
    await control.evaluate(()=>window.originalExperience=document.getElementById('experience'));
    await control.getByRole('button',{name:'Begin conversation'}).click();
    for(const [name,palette] of [['Use Nova fire for Metabloom','nova'],['Use liquid metal for Metabloom','metalbloom'],['Use spectral fluid for Metabloom','spectral'],['Use MetalNova liquid-metal fire for Metabloom','metalnova']]) {
      const option=group.getByRole('button',{name,exact:true});await option.click();
      assert.equal(await option.getAttribute('aria-pressed'),'true');
      assert.equal(await control.locator('#experience').getAttribute('data-palette'),palette);
      assert.equal(await group.getByRole('button',{pressed:true}).count(),1);
    }
    const layout=await control.evaluate(()=>{
      const group=document.querySelector('.orb-page__finish-selector'),rect=group.getBoundingClientRect();
      return {left:rect.left,right:rect.right,overflow:group.scrollWidth-group.clientWidth,sameExperience:originalExperience===document.getElementById('experience'),options:[...group.querySelectorAll('button')].map(el=>({label:el.textContent.trim(),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,overflow:el.scrollWidth-el.clientWidth}))};
    });
    assert(layout.left>=0&&layout.right<=width+1,'control must stay in the viewport');assert(layout.overflow<=1);
    assert(layout.options.every(o=>o.height>=43.9&&o.width>=43.9&&o.overflow<=1),'labels must fit inside accessible touch targets');
    assert(layout.sameExperience,'finish changes cannot replace the conversation');assert.deepEqual(errors,[]);
    if(width===320)await group.screenshot({path:`nova-review/selector-320-${theme}.png`});
    await control.evaluate(()=>unmountOrb());
    assert.deepEqual(await control.evaluate(()=>savedAppearance),{key:'orbAppearance',value:{palette:'metalnova'}});
    layouts.push({width,theme,...layout});await control.close();
  }
  fs.writeFileSync('nova-review/selector-report.json',JSON.stringify(layouts,null,2));
  console.log(JSON.stringify({result:'PASS',shaderCases:result.cases.length,unchangedOtherFinishes:true,exactNovaAlpha:true,identicalMetalNovaMotion:true,prismaticEdgePixels:result.changedEdgePixels,selectorCases:layouts.length}));
} finally {await browser?.close();}
