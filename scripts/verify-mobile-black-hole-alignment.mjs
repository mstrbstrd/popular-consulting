// Built-app viewport alignment checks. Fictional local sessions, no live APIs.
// Run after npm ci and npm run build, with Playwright installed or on NODE_PATH.
// A taller backing surface models browser chrome, not physical iOS performance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createBuildServer } from './auth-invoice-test-server.mjs';
import { documentSecurityHeaders } from '../server/document-security.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
let signedIn = false;
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: () => signedIn
  ? { authenticated: true, user: { id: 'a'.repeat(64), role: 'admin', name: 'Fictional alignment account' }, csrfToken: 'b'.repeat(64), expiresAt: Date.now() + 3600000 }
  : { authenticated: false } });
const serve = server.listeners('request')[0]; server.removeAllListeners('request');
server.on('request', (req, res) => { Object.entries(documentSecurityHeaders()).forEach(([k,v]) => res.setHeader(k,v)); serve(req,res); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const evidence = 'alignment-review'; fs.mkdirSync(evidence,{recursive:true});
const measure = () => {
  const rect = element => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,cx:r.x+r.width/2,cy:r.y+r.height/2}; };
  const scene=document.querySelector('.fixed-background.immersive-background');
  const hero=document.querySelector('.intro-branding__hero');
  const canvas=document.querySelector('canvas[data-renderer-id="black-hole-background"]');
  const transform=new DOMMatrixReadOnly(getComputedStyle(scene).transform);
  return {scene:rect(scene),hero:rect(hero),canvas:canvas?rect(canvas):null,
    buffer:canvas?[canvas.width,canvas.height]:null,scale:[transform.a,transform.b,transform.c,transform.d],
    canvasCount:document.querySelectorAll('canvas[data-renderer-id="black-hole-background"]').length,
    viewport:[innerWidth,innerHeight]};
};
const toggleFix = (enabled) => {
  if (!window.alignmentStyle) {
    const rule=/@media \(max-width: 768px\)\s*\{\s*\[data-theme="dark"\] \.fixed-background\.immersive-background\s*\{[^}]+\}\s*\}/;
    window.alignmentStyle=[...document.querySelectorAll('style')].find(node=>rule.test(node.textContent));
    if(!window.alignmentStyle)throw Error('Missing scoped mobile alignment rule');
    window.alignmentOriginal=window.alignmentStyle.textContent;
    window.alignmentBaseline=window.alignmentOriginal.replace(rule,'');
  }
  window.alignmentStyle.textContent=enabled?window.alignmentOriginal:window.alignmentBaseline;
};
const nextPaint = page => page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const aligned = result => {
  assert(Math.abs(result.scene.cx-result.hero.cx)<1,'horizontal camera centre must match the logo');
  assert(Math.abs(result.scene.cy-result.hero.cy)<1,'vertical camera centre must match the logo');
  assert(result.scene.y<=1 && result.scene.bottom>=result.viewport[1]-1,'no viewport gap may be exposed');
  assert.deepEqual(result.scale,[1,0,0,1],'the backing surface may translate but never scale');
  if(result.canvas) {
    assert(Math.abs(result.canvas.cx-result.hero.cx)<1 && Math.abs(result.canvas.cy-result.hero.cy)<1,'the actual canvas must share the logo centre');
    assert.equal(result.canvasCount,1,'alignment must not add another renderer');
  }
};
let browser;
const reports=[];
try {
  browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for(const scenario of [
    {name:'mobile-index',width:390,theme:'dark',route:'/'},
    {name:'mobile-home',width:430,theme:'dark',route:'/home'},
    {name:'small-mobile',width:320,theme:'dark',route:'/'},
    {name:'mobile-breakpoint',width:768,theme:'dark',route:'/'},
    {name:'wide-breakpoint',width:769,theme:'dark',route:'/'},
    {name:'desktop',width:1440,theme:'dark',route:'/'},
    {name:'mobile-light',width:390,theme:'light',route:'/'},
  ]) {
    signedIn=scenario.route==='/home';
    const context=await browser.newContext({viewport:{width:scenario.width,height:720},reducedMotion:'reduce'});
    await context.addInitScript(({theme})=>{
      localStorage.setItem('popcon-theme',theme);
      Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});
      Object.defineProperty(navigator,'deviceMemory',{get:()=>8});
      for(const name of ['WebGLRenderingContext','WebGL2RenderingContext']) {
        const proto=window[name]?.prototype;if(!proto)continue;
        const get=proto.getParameter;
        proto.getParameter=function(p){return p===37446?'Verification adapter':get.call(this,p);};
      }
    },scenario);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(`${origin}${scenario.route}?graphics=webgl`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      const hero=document.querySelector('.intro-branding__hero');
      const outlet=document.querySelector('.app-outlet');
      return hero && hero.getAttribute('aria-hidden')==='false'
        && getComputedStyle(hero).visibility==='visible'
        && getComputedStyle(hero.firstElementChild).opacity==='1'
        && outlet?.dataset.phase==='idle' && getComputedStyle(outlet).opacity==='1';
    },null,{timeout:60000});
    if(scenario.theme==='dark')await page.waitForFunction(()=>Number(document.querySelector('canvas[data-renderer-id="black-hole-background"]')?.dataset.completedFrames)>0,null,{timeout:60000});
    await nextPaint(page);
    const initial=await page.evaluate(measure);
    const mobileDark=scenario.theme==='dark' && scenario.width<=768;
    if(mobileDark) {
      aligned(initial);
      // Model an address-bar-open viewport: the existing large viewport backing
      // surface is taller, but its render size must survive pure repositioning.
      await page.evaluate(()=>{
        const scene=document.querySelector('.immersive-background');
        scene.style.setProperty('height','880px','important');
        window.alignmentCanvas=document.querySelector('canvas[data-renderer-id="black-hole-background"]');
      });
      await page.waitForTimeout(100);
      await page.evaluate(toggleFix,false);await nextPaint(page);
      const before=await page.evaluate(measure);
      assert(Math.abs(before.scene.cy-before.hero.cy)>60,'the fixture must reproduce the old mobile offset');
      await page.screenshot({path:`${evidence}/${scenario.name}-before.png`});
      await page.evaluate(toggleFix,true);await nextPaint(page);
      const corrected=await page.evaluate(measure);
      aligned(corrected);
      assert.deepEqual(corrected.buffer,before.buffer,'centering must not reallocate the stable render target');
      assert.equal(corrected.scene.height,before.scene.height,'centering must not shrink the background');
      assert.deepEqual(corrected.hero,before.hero,'the logo itself must not move');
      assert(await page.evaluate(()=>alignmentCanvas===document.querySelector('canvas[data-renderer-id="black-hole-background"]')),'the existing renderer must survive alignment');
      await page.screenshot({path:`${evidence}/${scenario.name}-after.png`});
      const resized=[];
      for(const height of [620,780,720]) {
        await page.setViewportSize({width:scenario.width,height});await nextPaint(page);
        const result=await page.evaluate(measure);aligned(result);
        assert.equal(result.scene.height,880,'browser chrome must not change the backing height');
        resized.push(result);
      }
      reports.push({scenario,initial,before,corrected,resized});
    } else {
      const current=await page.screenshot();
      await page.evaluate(toggleFix,false);await nextPaint(page);
      const baseline=await page.evaluate(measure);
      const previous=await page.screenshot();
      assert.deepEqual(initial,baseline,'desktop and light-mode layout must remain unchanged');
      assert(current.equals(previous),'desktop and light-mode rendered pixels must remain unchanged');
      reports.push({scenario,initial,pixelIdentical:true});
    }
    assert.deepEqual(errors,[],'the alignment must not introduce page errors');
    fs.writeFileSync(`${evidence}/alignment-report.json`,JSON.stringify(reports,null,2));
    console.log(`PASS ${scenario.name}`);
    await context.close();
  }
  console.log(JSON.stringify({result:'PASS',profiles:reports.length,mobileCentred:true,unchangedDesktopAndLight:true,stableRenderSize:true}));
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
}
