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
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
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
    throw new Error(`Assertion timed out: ${expression}`);
  };
  const click = (label) => evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
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
  assert.match(await evaluate('document.title'), /Popular Canvas/);
  const stroke = async (x1, y1, x2, y2) => {
    const r = await evaluate(`(() => {const r=document.querySelector('#popcan-canvas').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const x = r.x + x1 / 1200 * r.w, y = r.y + y1 / 800 * r.h;
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (x2 - x1) / 1200 * r.w * i / 10, y: y + (y2 - y1) / 800 * r.h * i / 10, buttons: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x + x2 / 1200 * r.w, y: r.y + y2 / 800 * r.h, button: 'left', buttons: 0, clickCount: 1 });
  };
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
  await click('Toggle dark mode'); await sleep(350); await screenshot('desktop-dark');
  for (const width of [320, 390, 768, 800, 1024]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 500 });
    await sleep(150);
    assert.ok(await evaluate(`(() => {const r=document.querySelector('[aria-label="Export PNG"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth===innerWidth})()`), `Overflow at ${width}`);
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await click('Brush (B)'); await sleep(150);
  const r = await evaluate(`document.querySelector('#popcan-canvas').getBoundingClientRect().toJSON()`);
  await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width * .2, y: r.y + r.height * .25 }] });
  await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: r.x + r.width * .7, y: r.y + r.height * .25 }] });
  await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await pixel(500, 200))[3] > 0);
  await screenshot('mobile-drawing');
  await click('Brush settings'); await sleep(150);
  assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display"), 'none');
  await screenshot('mobile-settings');
  results.push('touch drawing, narrow viewports and mobile settings');
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
