import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createBuildServer, findBrowser } from './dark-evidence-browser.mjs';

// Only fictional local page state. No production writes or private browser data.
const baseline = process.env.ABOUT_EXPECT_MISSING === '1';
const output = path.resolve(baseline ? 'about-before-evidence' : 'about-evidence');
fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build') });
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'about-navigation-'));
const executable = findBrowser();
assert(executable, 'Chromium or Edge is required for the About regression.');
const browser = spawn(executable, [
  '--headless=new', '--remote-debugging-pipe', '--no-first-run', '--disable-sync',
  '--disable-extensions', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let serial = 0;
let buffer = '';
const decoder = new StringDecoder('utf8');
const pending = new Map();
const rejectPending = (error) => {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
};
browser.on('error', rejectPending);
browser.on('exit', () => rejectPending(new Error('About review browser exited.')));
browser.stderr.on('data', () => {});
browser.stdio[4].on('data', (chunk) => {
  buffer += decoder.write(chunk);
  let boundary;
  while ((boundary = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 1);
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 30000);
  pending.set(id, { resolve, reject, timer });
  browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
});
const matrix = baseline ? [[390,844,'light','/',false,'css']] : [
  ...[ [390,844], [360,740], [768,1024], [1440,1000] ].flatMap(([w,h]) =>
    ['light','dark'].map(mode => [w,h,mode,'/',false,'css'])),
  [390,844,'light','/',true,'css'],
  [390,844,'light','/engineering',false,'css'],
  [390,844,'light','/',false,'auto'],
  [390,844,'dark','/',false,'auto'],
];
const reports = [];
try {
  for (const [width,height,mode,route,reduced,graphics] of matrix) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}) => send(method, params, sessionId);
    const evaluate = async (expression) => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const pause = (ms) => evaluate(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
    const until = (expression) => evaluate(`new Promise((resolve,reject) => {
      let tries=0; const timer=setInterval(() => { if (${expression}) { clearInterval(timer); resolve(true); }
      else if (++tries>200) { clearInterval(timer); reject(new Error(${JSON.stringify('Timed out: '+expression)})); } },50);
    })`);
    const mobile = width <= 768;
    const report = { width,height,mode,route,reduced,graphics, checks:0, failures:[], visits:[] };
    const check = (value, message) => { report.checks++; if (!value) report.failures.push(message); };
    const tap = async (selector) => {
      const point = await evaluate(`(() => {
        const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error('Missing '+${JSON.stringify(selector)});
        const r=el.getBoundingClientRect(), x=r.x+r.width/2, y=r.y+r.height/2;
        if (!r.width || !r.height || !el.contains(document.elementFromPoint(x,y))) throw new Error('Covered '+${JSON.stringify(selector)});
        return {x,y}; })()`);
      if (mobile) {
        await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
        await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      } else {
        await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
        await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
      }
      await pause(80);
    };
    const navigate = async (label, index) => {
      if(mobile) {
        await tap('.nav-burger');
        await until("document.querySelector('.nav-overlay--open') && getComputedStyle(document.querySelector('.nav-overlay')).opacity === '1'");
      }
      const selector = mobile ? '.nav-overlay--open button.nav-overlay-link' : '.nav-links button.nav-link';
      await evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).forEach(el => {
        if(el.textContent.trim()===${JSON.stringify(label)}) el.setAttribute('data-about-test-target','true');
      })`);
      await tap('[data-about-test-target="true"]');
      await evaluate("document.querySelectorAll('[data-about-test-target]').forEach(el=>el.removeAttribute('data-about-test-target'))");
      await until(`location.hash==='#section-${index}' && document.querySelector('.section-container.active')?.dataset.section==='${index}'`);
      await pause(700);
    };
    const snapshot = () => evaluate(`(() => {
      const section=document.querySelector('#bio');
      const visual=section?.querySelector('.business-systems-visual');
      const host=visual?.parentElement, r=visual?.getBoundingClientRect();
      const motion=visual?.querySelector('.business-systems-visual__node-logo-image');
      const style=motion && getComputedStyle(motion);
      return {hasBio:!!section, visuals:document.querySelectorAll('.business-systems-visual').length,
        active:visual?.classList.contains('business-systems-visual--active'), nodes:visual?.querySelectorAll('[data-system-node]').length,
        inHost:!!host?.isConnected, width:r?.width, height:r?.height, hostWidth:host?.clientWidth,
        opacity:visual && getComputedStyle(visual.parentElement.parentElement).opacity,
        photos:section?.querySelectorAll('img').length, motion:style?.animationPlayState, animation:style?.animationName,
        h2:section?.querySelector('h2')?.getAttribute('aria-label')}; })()`);
    const name = `${width}-${height}-${mode}-${route==='/'?'business':'engineering'}-${reduced?'reduced':graphics}`;
    const capture = async (suffix) => {
      const { data } = await call('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
      fs.writeFileSync(path.join(output,`${name}-${suffix}.png`),Buffer.from(data,'base64'));
    };
    try {
      await call('Page.enable');
      await call('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('popcon-theme',${JSON.stringify(mode)});`});
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      await call('Emulation.setTouchEmulationEnabled',{enabled:mobile});
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
      await call('Page.navigate',{url:`${origin}${route}?graphics=${graphics}`});
      await until("document.querySelector('.scroll-indicator')");
      await pause(650);
      await tap('.scroll-indicator');
      await until("location.hash==='#section-1'");
      await pause(750);
      const first=await snapshot(); report.visits.push(first);
      check(first.hasBio && (route==='/engineering' ? first.photos===1 && first.visuals===0 : first.visuals===1 && first.nodes===4),'Initial About visual missing');
      await capture('first');
      for(let cycle=0;cycle<(baseline?1:2);cycle++) {
        await navigate('Contact',3);
        check(await evaluate("!document.querySelector('#bio')"),'About did not exercise the unmount path');
        await navigate(route==='/engineering'?'Approach':'About',1);
        const state=await snapshot(); report.visits.push(state);
        if(baseline) {
          check(state.hasBio && state.visuals===0,'Expected detached-host bug was not reproduced');
        } else if(route==='/engineering') {
          check(state.hasBio && state.photos===1 && state.visuals===0,'Engineering portrait changed');
        } else {
          check(state.visuals===1 && state.nodes===4 && state.inHost,'Remounted About lost its animation');
          check(state.photos===0,'Business portrait returned instead of systems map');
          check(state.width>150 && state.height>150 && state.width<=state.hostWidth+1 && Number(state.opacity)>.98,'Animation geometry or reveal failed');
          check(reduced ? state.animation==='none' : state.active && state.motion==='running','Motion state incorrect');
        }
      }
      await capture('return');
      if(!baseline && route==='/') {
        await navigate('Services',2);
        check(await evaluate("!document.querySelector('.business-systems-visual--active')"),'Off-section animation kept running');
        await navigate('About',1);
        check((await snapshot()).visuals===1,'Neighbor return created a duplicate/missing animation');
        // A fresh route load follows the same deep link used by the invoice NavMenu.
        await call('Page.navigate',{url:`${origin}/?graphics=${graphics}#section-1`});
        await until("document.querySelector('.section-container.active')?.dataset.section==='1'");
        await pause(1800);
        check((await snapshot()).visuals===1,'Direct About link lost its animation');
      }
    } catch(error) { report.failures.push(error.message); await capture('failure').catch(()=>{}); }
    reports.push(report);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
    console.log(JSON.stringify(report));
    await send('Target.closeTarget',{targetId});
  }
  assert(reports.every(report=>report.failures.length===0),'About navigation regression');
} finally {
  await send('Browser.close').catch(()=>{});
  if(browser.exitCode===null) browser.kill();
  rejectPending(new Error('Review completed'));
  server.close();
  await new Promise(resolve=>setTimeout(resolve,500));
  await fs.promises.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
