// Node 22+; Chrome/Edge must be installed. Tests the real built route and storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { findBrowser, createBuildServer } from './dark-evidence-browser.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve(process.env.POPCAN_VERIFY_OUTPUT || 'popcan-functional');
fs.mkdirSync(output, { recursive: true });
const remote = process.env.POPCAN_VERIFY_ORIGIN;
if (remote && !['https://popular-consulting.com', 'https://popcon.dev'].includes(remote)) throw new Error('Unexpected verification origin');
const server = remote ? null : createBuildServer({ buildRoot: path.resolve('build') });
if (server) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = remote || `http://127.0.0.1:${server.address().port}`;
let child, socket, profile;
const results = [], errors = [];
try {
  const browser = findBrowser();
  assert.ok(browser, 'Chrome or Edge is required');
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popcan-browser-'));
  child = spawn(browser, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...(process.getuid?.() === 0 || process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (chunk) => fs.appendFileSync(path.join(output, 'browser.log'), chunk));
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 300 && !fs.existsSync(portFile); i++) await sleep(100);
  assert.ok(fs.existsSync(portFile), 'Browser did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(tabs.find((tab) => tab.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    const item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id); clearTimeout(item.timer);
    if (data.error) item.reject(new Error(data.error.message)); else item.resolve(data.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await sleep(100); }
    fs.writeFileSync(path.join(output, 'failure.html'), await evaluate('document.documentElement.outerHTML'));
    await screenshot('failure');
    throw new Error(`Assertion timed out: ${expression}`);
  };
  const click = (label) => evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
  const navigationContrast = () => evaluate(`(() => {
  const bg=getComputedStyle(document.querySelector('.nav-pill')).backgroundColor.match(/[0-9.]+/g).map(Number);
  const fg=getComputedStyle(document.querySelector('.nav-link')).color.match(/[0-9.]+/g).map(Number);
  const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const a=luminance(bg),b=luminance(fg);
  return (bg.length===3||bg[3]===1)&&(Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5;
})()`);
  const painted = `document.querySelector('.pc-paint')`;
  const digest = () => evaluate(`${painted}.toDataURL()`);
  const pixel = (x, y) => evaluate(`Array.from(${painted}.getContext('2d').getImageData(${x},${y},1,1).data)`);
  const ready = `document.querySelector('[aria-label="Export PNG"]') && !document.querySelector('[aria-label="Export PNG"]').disabled`;
  const screenshot = async (name) => {
    const result = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `${origin}/popcan?graphics=css` });
  await until(ready);
  await sleep(150);
  assert.match(await evaluate('document.title'), /Popular Canvas/);
  const stroke = async (x1, y1, x2, y2) => {
    const r = await evaluate(`(() => {const r=document.querySelector('#popcan-canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const x = r.x + x1 / 1200 * r.w, y = r.y + y1 / 800 * r.h;
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (x2 - x1) / 1200 * r.w * i / 10, y: y + (y2 - y1) / 800 * r.h * i / 10, buttons: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x + x2 / 1200 * r.w, y: r.y + y2 / 800 * r.h, button: 'left', buttons: 0, clickCount: 1 });
  };
  const pageCoverage = () => evaluate(`(() => {
    const c=document.querySelector('#popcan-canvas'), r=c.getBoundingClientRect();
    const stage=document.querySelector('.pc-stage').getBoundingClientRect();
    const board=getComputedStyle(document.querySelector('.pc-artboard'));
    return Math.abs(stage.x)<1 && Math.abs(stage.y)<1 && Math.abs(stage.width-innerWidth)<1 && Math.abs(stage.height-innerHeight)<1
      && r.left<=1 && r.top<=1 && r.right>=innerWidth-1 && r.bottom>=innerHeight-1
      && Math.abs(r.width/c.width-r.height/c.height)<.002 && board.boxShadow==='none';
  })()`);
  assert.ok(await pageCoverage(), 'Canvas must cover the full page without a frame or distortion');
  assert.ok(await evaluate(`[[5,innerHeight/2],[innerWidth-5,innerHeight/2],[innerWidth/2,innerHeight-5]].every(([x,y]) => document.elementFromPoint(x,y)?.id==='popcan-canvas')`), 'Chrome wrappers must not swallow drawing input');
  await stroke(150, 200, 900, 600);
  const drawing = await digest();
  assert.ok((await pixel(525, 400))[3] > 200);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal((await pixel(525, 400))[3], 0);
  await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(), drawing);
  await click('Use Ember palette'); assert.equal(await digest(), drawing);
  await click('Warm paper canvas'); assert.equal(await digest(), drawing);
  results.push('real strokes, undo/redo, non-destructive palette and paper changes');
  await until(`document.querySelector('.pc-status').textContent.includes('Saved on this device')`);
  const draft = await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('popcan-local',1);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('drafts');const q=tx.objectStore('drafts').get('current');q.onsuccess=()=>resolve({width:q.result.width,height:q.result.height,size:q.result.blob.size,paper:q.result.paper});tx.oncomplete=()=>db.close()};r.onerror=()=>reject(r.error)})`);
  assert.equal(draft.width, 1200); assert.equal(draft.height, 800); assert.equal(draft.paper, '#fff8f7'); assert.ok(draft.size > 0);
  await evaluate('window.__popcanReloadMarker = true');
  await call('Page.reload'); await until(`typeof window.__popcanReloadMarker === 'undefined' && (${ready})`); assert.equal(await digest(), drawing);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Warm paper canvas\"]').getAttribute('aria-pressed')"), 'true');
  results.push('IndexedDB PNG draft and paper restore exactly after reload');
  await click('Eraser (E)'); await stroke(525, 350, 525, 450); assert.equal((await pixel(525, 400))[3], 0);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(), drawing);
  results.push('erase and undo preserve alpha');
  assert.ok(await navigationContrast(), 'Light navigation must stay readable on any paper');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.pc-statusbar')).backgroundColor"), 'rgba(0, 0, 0, 0)', 'Floating status gaps must stay transparent');
  await screenshot('desktop-light');
  const centre = () => evaluate(`(() => {const c=document.querySelector('#popcan-canvas'),r=c.getBoundingClientRect();return {x:(innerWidth/2-r.x)*c.width/r.width,y:(innerHeight/2-r.y)*c.height/r.height};})()`);
  const initialCentre = await centre();
  await click('Zoom in'); await sleep(150);
  assert.ok(await pageCoverage());
  const zoomCentre = await centre();
  assert.ok(Math.abs(zoomCentre.x-initialCentre.x)<2 && Math.abs(zoomCentre.y-initialCentre.y)<2, 'Zoom must keep the same document focal point');
  assert.equal(await digest(), drawing, 'Zoom must not change pixels');
  await click('Hand (H)');
  await until(`document.querySelector('[aria-label="Hand (H)"]').getAttribute('aria-pressed')==='true'`);
  await evaluate(`(() => {
    window.__pcPanEvents=[];
    for (const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','scroll']) {
      document.addEventListener(type, e => {
        if(window.__pcPanEvents.length>=60)return;
        const s=document.querySelector('.pc-stage');
        window.__pcPanEvents.push({type,target:e.target.id||e.target.className,x:e.clientX,y:e.clientY,id:e.pointerId,left:s.scrollLeft,top:s.scrollTop,tool:document.querySelector('.pc-artboard').dataset.tool});
      },{capture:true,passive:true});
    }
  })()`);
  await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:650, y:500 });
  await call('Input.dispatchMouseEvent', { type:'mousePressed', x:650, y:500, button:'left', buttons:1, clickCount:1 });
  await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:540, y:420, buttons:1 });
  await call('Input.dispatchMouseEvent', { type:'mouseReleased', x:540, y:420, button:'left', buttons:0, clickCount:1 });
  await sleep(100);
  const panEvidence = await evaluate(`(() => {const s=document.querySelector('.pc-stage');return {events:window.__pcPanEvents,left:s.scrollLeft,top:s.scrollTop,width:s.clientWidth,height:s.clientHeight,scrollWidth:s.scrollWidth,scrollHeight:s.scrollHeight,tool:document.querySelector('.pc-artboard').dataset.tool,hit:document.elementFromPoint(650,500)?.outerHTML.slice(0,250),rect:document.querySelector('#popcan-canvas').getBoundingClientRect().toJSON()};})()`);
  fs.writeFileSync(path.join(output,'pan.json'),JSON.stringify({before:zoomCentre,after:await centre(),...panEvidence},null,2));
  await screenshot('desktop-panned');
  assert.ok((await centre()).x > zoomCentre.x + 20, 'Hand must actually pan');
  assert.equal(await digest(), drawing);
  await click('Reset canvas view'); await sleep(150);
  const resetCentre = await centre();
  assert.ok(Math.abs(resetCentre.x-600)<2 && Math.abs(resetCentre.y-400)<2, 'Reset must centre the document');
  assert.ok(await evaluate(`document.querySelector('[aria-label="Zoom out"]').disabled`), 'Zooming out must never expose non-drawable margins');
  await click('Brush (B)');
  // A toolbar click must never paint through the floating control.
  const control = await evaluate(`document.querySelector('[aria-label="Use Tide palette"]').getBoundingClientRect().toJSON()`);
  await call('Input.dispatchMouseEvent', { type:'mousePressed', x:control.x+control.width/2, y:control.y+control.height/2, button:'left', buttons:1, clickCount:1 });
  await call('Input.dispatchMouseEvent', { type:'mouseReleased', x:control.x+control.width/2, y:control.y+control.height/2, button:'left', buttons:0, clickCount:1 });
  assert.equal(await digest(), drawing, 'Controls must never paint behind themselves');
  await click('Toggle dark mode'); await sleep(350); assert.ok(await navigationContrast(), 'Dark navigation must stay readable on light paper'); await screenshot('desktop-dark');
  results.push('full-page coverage, proportional zoom, pan, centred reset and isolated toolbar input');
  for (const width of [320, 390, 768, 800, 1024]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    await sleep(150);
    assert.ok(await pageCoverage(), `Canvas must fill viewport at ${width}`);
    assert.equal(await digest(), drawing, `Resize must preserve pixels at ${width}`);
    assert.ok(await evaluate(`(() => {const r=document.querySelector('[aria-label="Export PNG"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth===innerWidth})()`), `Overflow at ${width}`);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await click('Brush (B)'); await sleep(150);
  if (await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display !== 'none'")) await click('Close brush settings');
  // Screen coordinates matter now: the aspect-preserved document can extend
  // beyond the viewport, so document fractions may be outside the browser.
  const r = await evaluate(`document.querySelector('#popcan-canvas').getBoundingClientRect().toJSON()`);
  const touchX = 190, touchY = 410;
  const px = Math.floor((touchX-r.x)*1200/r.width), py = Math.floor((touchY-r.y)*800/r.height);
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: touchY }] });
  await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 280, y: touchY }] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await pixel(px, py))[3] > 0, 'Touch must paint where the finger lands');
  const mobileDrawing = await digest();
  // Exposed page margins are real canvas, not a decorative backdrop.
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 4, y: 520 }] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notEqual(await digest(), mobileDrawing, 'The far page edge must be drawable');
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(), mobileDrawing);
  // Changing orientation mid-gesture must cancel the transient mark.
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 480 }] });
  await call('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok(await pageCoverage()); assert.equal(await digest(), mobileDrawing, 'Rotation must not commit an unfinished gesture or erase the draft');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(200);
  await screenshot('mobile-drawing');
  await click('Brush settings'); await sleep(150);
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display"), 'none');
  await screenshot('mobile-settings');
  results.push('touch alignment, drawable page edges, narrow viewports, orientation cancellation and mobile settings');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: true, origin, results, errors }, null, 2));
  console.log(JSON.stringify({ success: true, origin, results }));
} catch (error) {
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, origin, results, errors, error: error.message }, null, 2));
  throw error;
} finally {
  socket?.close(); child?.kill(); server?.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Browser handles may still be releasing. */ } }
}
