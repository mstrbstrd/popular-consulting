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
    for (let i = 0; i < 150; i++) { if (await evaluate(`Boolean(${expression})`)) return; await sleep(100); }
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
  // The hit surface is always the viewport. Paint remains in document pixels.
  const camera = () => evaluate(`(() => {const d=document.querySelector('#popcan-canvas').dataset;return {x:+d.viewX,y:+d.viewY,scale:+d.scale,originX:+d.originX,originY:+d.originY}})()`);
  const dimensions = () => evaluate(`({width:${painted}.width,height:${painted}.height})`);
  const worldPixel = async (x, y) => { const v=await camera(); return pixel(Math.floor(x-v.originX), Math.floor(y-v.originY)); };
  const alphaCount = (x, y, w, h) => evaluate(`(() => {const d=document.querySelector('#popcan-canvas').dataset;const a=${painted}.getContext('2d').getImageData(${x}-+d.originX,${y}-+d.originY,${w},${h}).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>0)n++;return n})()`);
  const screenStroke = async (x, y, ex, ey, button='left') => {
    const buttons=button==='middle'?4:1;
    await call('Input.dispatchMouseEvent', { type:'mouseMoved', x,y });
    await call('Input.dispatchMouseEvent', { type:'mousePressed', x,y,button,buttons,clickCount:1 });
    for(let i=1;i<=8;i++) await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:x+(ex-x)*i/8,y:y+(ey-y)*i/8,buttons });
    await call('Input.dispatchMouseEvent', { type:'mouseReleased', x:ex,y:ey,button,buttons:0,clickCount:1 });
    await sleep(80);
  };
  const stroke = async (x,y,ex,ey) => {const v=await camera(); await screenStroke(v.x+x*v.scale,v.y+y*v.scale,v.x+ex*v.scale,v.y+ey*v.scale)};
  const fillInput = (label, value) => evaluate(`(() => {const el=document.querySelector('[aria-label=${JSON.stringify(label)}]');const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const coverage = () => evaluate(`(() => {const r=document.querySelector('#popcan-canvas').getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight&&[[5,innerHeight/2],[innerWidth-5,innerHeight/2],[innerWidth/2,innerHeight-5]].every(([x,y])=>document.elementFromPoint(x,y)?.id==='popcan-canvas')})()`);
  assert.ok(await coverage(), 'Every exposed page edge must accept gestures');
  if (await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display!=='none'")) await click('Close brush settings');
  await stroke(300,300,900,500);
  const original = await digest(), oldPixel = await worldPixel(600,400);
  assert.ok(oldPixel[3]>200, 'Mouse must deposit actual pigment');
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal((await worldPixel(600,400))[3],0);
  await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(),original);
  const initialCamera=await camera(), beforeSize=await dimensions();
  const anchor={x:720,y:500};
  const worldAt=(v,a)=>({x:(a.x-v.x)/v.scale,y:(a.y-v.y)/v.scale});
  const centre=worldAt(initialCamera,anchor);
  await click('Zoom out'); await sleep(100);
  const zoomed=await camera(), centred=worldAt(zoomed,anchor);
  assert.ok(zoomed.scale<initialCamera.scale && zoomed.scale<1, 'Zoom out must shrink existing marks');
  assert.ok(Math.abs(centre.x-centred.x)<.001 && Math.abs(centre.y-centred.y)<.001, 'Button zoom preserves centre');
  assert.deepEqual(await dimensions(),beforeSize); assert.equal(await digest(),original);
  const mouseAnchor={x:640,y:460}, beforeWheel=worldAt(await camera(),mouseAnchor);
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',...mouseAnchor,deltaY:-250,deltaX:0}); await sleep(150);
  const afterWheel=worldAt(await camera(),mouseAnchor);
  assert.ok(Math.abs(beforeWheel.x-afterWheel.x)<.01 && Math.abs(beforeWheel.y-afterWheel.y)<.01,'Wheel zoom is pointer anchored');
  assert.equal(await digest(),original);
  await click('Reset canvas view'); await sleep(80);
  await click('Move canvas (H)'); await sleep(50);
  const beforePan=await camera(); await screenStroke(640,480,940,620);
  const afterPan=await camera(); assert.ok(Math.abs(afterPan.x-beforePan.x-300)<1 && Math.abs(afterPan.y-beforePan.y-140)<1, 'Hand can pan at the original zoom');
  assert.equal(await digest(),original);
  // Space drag temporarily navigates without replacing the selected brush.
  await click('Brush (B)'); await evaluate("document.querySelector('#popcan-canvas').focus()");
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  const beforeSpace=await camera(); await screenStroke(620,470,700,470);
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  assert.ok((await camera()).x>beforeSpace.x+70); assert.equal(await digest(),original);
  assert.equal(await evaluate("document.querySelector('#popcan-canvas').dataset.tool"),'brush');
  results.push('mouse drawing, reversible history, non-destructive zoom, pointer-anchored wheel, Hand and Space-drag');
  // Add a mark in genuinely new document space, not on a decorative margin.
  await click('Zoom out'); await click('Zoom out'); await sleep(100);
  await stroke(-250,-160,-80,-80);
  const expanded=await dimensions(), expandedCamera=await camera();
  assert.ok(expanded.width>1200 && expanded.height>800 && expandedCamera.originX<0 && expandedCamera.originY<0,'Drawing must grow left/top');
  assert.ok((await worldPixel(-165,-120))[3]>0);
  assert.deepEqual(await worldPixel(600,400),oldPixel,'Growth must not resample old pixels');
  const grown=await digest(), grownCamera=await camera();
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),original); assert.equal((await camera()).originX,0);
  await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(),grown);
  assert.equal((await camera()).x,grownCamera.x, 'History must not jump the camera');
  // Cancelling an expansion restores dimensions and origin as well as pixels.
  const cp=await camera(), cx=cp.x-550*cp.scale,cy=cp.y-160*cp.scale;
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'left',buttons:1,clickCount:1});
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'left',buttons:0,clickCount:1});
  assert.equal(await digest(),grown); assert.deepEqual(await dimensions(),expanded);
  await click('Reset canvas view'); await sleep(100);
  await click('Text (T)'); await stroke(160,600,160,600);
  await until(`document.querySelector('textarea[aria-label="Text to add"]')`);
  await fillInput('Text to add','Popular Canvas\nZoom. Pan. Create.');
  await fillInput('Text font','mono'); await fillInput('Text size','42'); await fillInput('Text colour','#f37eb6');
  await evaluate("document.querySelector('.pc-dialog input[type=checkbox]').click()");
  await screenshot('text-dialog');
  await evaluate("document.querySelector('.pc-dialog button[type=submit]').click()");
  await until(`!document.querySelector('.pc-dialog')`);
  assert.ok(await alphaCount(160,600,480,115)>500,'Text must be actual canvas pixels');
  const withText=await digest(); assert.notEqual(withText,grown);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),grown,'Text insertion is one undo step');
  await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(),withText);
  // Blank/cancelled text does not create a history entry.
  await stroke(160,600,160,600); await until(`document.querySelector('.pc-dialog')`);
  assert.equal(await evaluate("document.querySelector('.pc-dialog button[type=submit]').disabled"),true);
  await click('Close dialog'); assert.equal(await digest(),withText);
  await until(`document.querySelector('.pc-status').textContent.includes('Saved on this device')`);
  const savedCamera=await camera();
  await call('Page.reload'); await until(ready); await sleep(150);
  assert.equal(await digest(),withText,'Expanded draft including text reloads exactly');
  assert.equal((await camera()).originX,savedCamera.originX); assert.equal((await camera()).originY,savedCamera.originY);
  results.push('growth beyond old bounds, pixel/origin preservation, atomic growth cancellation, multiline text, undo/redo and draft reload');
  if (await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display==='none'")) await click('Brush settings');
  await click('Warm paper canvas'); await sleep(80);
  assert.equal(await digest(),withText,'Paper does not mutate ink');
  assert.ok(await navigationContrast(),'Light navigation contrast');
  await click('Close brush settings'); await screenshot('desktop-light');
  await click('Toggle dark mode'); await sleep(200); assert.ok(await navigationContrast(),'Dark navigation contrast'); await screenshot('desktop-dark');
  // Export uses the expanded document, independent of camera scale and pan.
  const downloads=path.join(output,'downloads'); fs.mkdirSync(downloads,{recursive:true});
  await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await click('Export PNG');
  for(let i=0;i<100&&!fs.readdirSync(downloads).some(n=>n.endsWith('.png'));i++)await sleep(100);
  const pngName=fs.readdirSync(downloads).find(n=>n.endsWith('.png'));assert.ok(pngName,'A PNG was actually downloaded');
  const png=fs.readFileSync(path.join(downloads,pngName)), size=await dimensions();
  assert.equal(png.readUInt32BE(16),size.width);assert.equal(png.readUInt32BE(20),size.height);
  for (const width of [320,390,768,1024]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500});await sleep(100);
    assert.ok(await coverage(),`Hit surface covers ${width}`);assert.equal(await digest(),withText);
    assert.ok(await evaluate(`document.documentElement.scrollWidth===innerWidth`),'No page overflow');
  }
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await click('Reset canvas view');await click('Brush (B)');await sleep(100);
  // A second finger cancels the first finger's transient mark, then navigates.
  const pinchBefore=await camera();
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:0,x:130,y:430},{id:1,x:250,y:430}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:0,x:110,y:450},{id:1,x:290,y:450}]});
  await sleep(100);
  const pinchAfter=await camera();assert.ok(pinchAfter.scale>pinchBefore.scale*1.4,'Pinch must zoom canvas');
  const fixedWorld=worldAt(pinchBefore,{x:190,y:430}), movedWorld=worldAt(pinchAfter,{x:200,y:450});
  assert.ok(Math.abs(fixedWorld.x-movedWorld.x)<1&&Math.abs(fixedWorld.y-movedWorld.y)<1,'Pinch and two-finger pan share a stable anchor');
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:0,x:110,y:450}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:0,x:130,y:470}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await digest(),withText,'Pinch and its trailing finger never paint');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:450}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:460}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.notEqual(await digest(),withText,'One finger still draws');
  await click('Undo (Ctrl or ⌘ Z)');assert.equal(await digest(),withText);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:420}]});
  await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await sleep(120);
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await digest(),withText,'Rotation cancels an unfinished mark');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('Reset canvas view');await sleep(150);
  const fitEvidence = await evaluate(`(() => {const r=document.querySelector('.pc-artboard').getBoundingClientRect();return {rect:r.toJSON(),width:innerWidth,height:innerHeight,view:{...document.querySelector('#popcan-canvas').dataset}}})()`);
  fs.writeFileSync(path.join(output,'mobile-fit.json'),JSON.stringify(fitEvidence,null,2));
  assert.ok(fitEvidence.rect.left>=0 && fitEvidence.rect.right<=fitEvidence.width && fitEvidence.rect.top>=0 && fitEvidence.rect.bottom<=fitEvidence.height,'Fit after rotation must bring the entire document into view');
  await screenshot('mobile-canvas');
  await click('Text (T)');await screenStroke(150,450,150,450);await until(`document.querySelector('.pc-dialog')`);
  await fillInput('Text to add','Hello from mobile');await screenshot('mobile-text');await click('Close dialog');
  assert.equal(await digest(),withText);
  results.push('full-document PNG export, responsive layout, pinch zoom, two-finger pan, single-finger drawing, rotation cancellation and mobile text');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({success:true,origin,results,errors},null,2));
  console.log(JSON.stringify({success:true,origin,results}));
} catch (error) {
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, origin, results, errors, error: error.message }, null, 2));
  throw error;
} finally {
  socket?.close(); child?.kill(); server?.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Browser handles may still be releasing. */ } }
}
