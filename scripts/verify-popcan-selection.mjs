// Node 22+; Chrome/Edge must be installed. Tests the real built route and storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { findBrowser, createBuildServer } from './dark-evidence-browser.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve(process.env.POPCAN_VERIFY_OUTPUT || 'popcan-selection');
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popcan-selection-browser-'));
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
  const click = async (label) => { await evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`); await sleep(40); };
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
    for(let i=1;i<=8;i++) await call('Input.dispatchMouseEvent', { type:'mouseMoved', x:x+(ex-x)*i/8,y:y+(ey-y)*i/8,button,buttons });
    await call('Input.dispatchMouseEvent', { type:'mouseReleased', x:ex,y:ey,button,buttons:0,clickCount:1 });
    await sleep(80);
  };
  const stroke = async (x,y,ex,ey) => {const v=await camera(); await screenStroke(v.x+x*v.scale,v.y+y*v.scale,v.x+ex*v.scale,v.y+ey*v.scale)};
  const fillInput = (label, value) => evaluate(`(() => {const el=document.querySelector('[aria-label=${JSON.stringify(label)}]');const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event(el.tagName==='SELECT'||el.type==='color'?'change':'input',{bubbles:true}));})()`);
  const coverage = () => evaluate(`(() => {const r=document.querySelector('#popcan-canvas').getBoundingClientRect();return r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight&&[[5,innerHeight/2],[innerWidth-5,innerHeight/2],[innerWidth/2,innerHeight-5]].every(([x,y])=>document.elementFromPoint(x,y)?.id==='popcan-canvas')})()`);
  const count = () => evaluate(`+document.querySelector('#popcan-canvas').dataset.objectCount`);
  const selection = () => evaluate(`document.querySelector('.pc-selection')?.dataset.selectionId || null`);
  const key = (key, code, modifiers=0) => call('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});
  const settings = async (color='#dd3344',size='24') => {
    if (await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display==='none'")) await click('Brush settings');
    await evaluate("[...document.querySelectorAll('.pc-segment button')].find(b=>b.textContent==='Ink').click()");
    await fillInput('Colour flow','solid'); await fillInput('Primary colour',color); await fillInput('Brush size',size);
    await click('Close brush settings'); await sleep(60);
  };
  const saved = () => until(`document.querySelector('.pc-status').textContent.includes('Saved on this device')`);
  const readLocal = () => evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('popcan-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts'),q=tx.objectStore('drafts').get('current');q.onsuccess=()=>resolve({version:q.result.version,objects:q.result.objects?.map(({blob,...item})=>item)});tx.oncomplete=()=>db.close();};r.onerror=()=>reject(r.error)})`);
  const newCanvas = async () => {
    await click('New canvas'); await until(`document.querySelector('.pc-dialog')`);
    await evaluate("document.querySelector('.pc-dialog button[type=submit]').click()");
    await until(`!document.querySelector('.pc-dialog')`); await sleep(100);
  };
  const textAt = async (value,x,y) => {
    await click('Text (T)'); await stroke(x,y,x,y); await until(`document.querySelector('.pc-dialog')`);
    await fillInput('Text to add',value); await fillInput('Text size','42'); await fillInput('Text colour','#44dddd');
    await evaluate("document.querySelector('.pc-dialog button[type=submit]').click()");
    await until(`!document.querySelector('.pc-dialog')`); await sleep(100);
  };
  // Helpers inspect rendered pixels and public DOM, never a production debug API.
  const firstPixel = (x,y,w,h) => evaluate(`(() => {const d=document.querySelector('#popcan-canvas').dataset;const c=${painted}.getContext('2d');const a=c.getImageData(${x}-+d.originX,${y}-+d.originY,${w},${h}).data;for(let i=3;i<a.length;i+=4)if(a[i]>200)return {x:${x}+((i-3)/4)%${w},y:${y}+Math.floor((i-3)/4/${w})};return null})()`);
  await evaluate(`(() => {
    window.__pcTrace=[];
    const release=Element.prototype.releasePointerCapture;
    Element.prototype.releasePointerCapture=function(id){window.__pcTrace.push({event:'release-call',id,stack:new Error().stack});return release.call(this,id)};
    const record=e=>{if(window.__pcTrace.length>=150)return;const d=document.querySelector('#popcan-canvas')?.dataset;window.__pcTrace.push({event:e.type,target:e.target.id||e.target.className,x:e.clientX,y:e.clientY,button:e.button,buttons:e.buttons,pointer:e.pointerId,tool:d?.tool,count:d?.objectCount,view:[d?.viewX,d?.viewY,d?.scale],time:performance.now(),focus:document.hasFocus(),visibility:document.visibilityState})};
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','visibilitychange','wheel'])document.addEventListener(type,record,true);
    window.addEventListener('blur',record);window.addEventListener('resize',record);
  })()`);
  assert.ok(await coverage());
  await settings(); await click('Brush (B)'); await stroke(200,200,400,200);
  const red=await worldPixel(300,200);
  await settings('#3355dd'); await stroke(300,150,300,250);
  const blue=await worldPixel(300,200), overlap=await digest();
  fs.writeFileSync(path.join(output,'overlap.json'),JSON.stringify({red,blue,count:await count(),camera:await camera(),input:await evaluate(`document.querySelector('input[type=color]').value`),preview:await evaluate(`document.querySelector('.pc-pigment-preview').style.background`),tool:await evaluate(`document.querySelector('#popcan-canvas').dataset.tool`),status:await evaluate(`document.querySelector('.pc-status').textContent`),events:await evaluate('window.__pcTrace')},null,2));
  await screenshot('overlap'); assert.notDeepEqual(red,blue); assert.equal(await count(),2);
  await click('Select & move (V)'); const beforeCamera=await camera();
  await stroke(300,200,500,320);
  const moved=await digest(), blueId=await selection();
  assert.deepEqual(await camera(),beforeCamera,'Object move must not pan the page');
  assert.deepEqual(await worldPixel(300,200),red,'Moving the top object reveals the underlying stroke');
  assert.deepEqual(await worldPixel(500,320),blue,'Moving cannot recolour the selected pigment');
  assert.equal(await count(),2); assert.ok(blueId);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),overlap,'A drag is exactly one undo step');
  await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(),moved);
  await stroke(100,650,100,650); assert.equal(await selection(),null); assert.equal(await digest(),moved);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),overlap,'An empty selection click creates no undo step');
  await click('Redo (Ctrl or ⌘ Shift Z)');
  results.push('independent strokes, alpha-aware topmost selection, overlap preservation, fixed camera and one-step history');

  await click('Zoom out'); await click('Move canvas (H)'); await screenStroke(600,470,650,500);
  await click('Select & move (V)'); await stroke(500,320,550,350);
  assert.deepEqual(await worldPixel(550,350),blue,'Hit testing uses world coordinates after zoom and pan');
  await saved(); const beforeCancel=await digest(), beforeRecords=await readLocal(), v=await camera();
  const from={x:v.x+550*v.scale,y:v.y+350*v.scale}, to={x:from.x+60,y:from.y+50};
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...to,button:'left',buttons:1}); await sleep(500);
  assert.notEqual(await digest(),beforeCancel); assert.deepEqual(await readLocal(),beforeRecords,'Drag previews must never replace the saved draft');
  await key('Escape','Escape'); await call('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1});
  assert.equal(await digest(),beforeCancel,'Escape restores pixels and position');
  await stroke(550,350,550,350); assert.equal(await selection(),blueId);
  await key('ArrowRight','ArrowRight',8); await sleep(80); // Shift in CDP is bit 8.
  assert.deepEqual(await worldPixel(560,350),blue);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),beforeCancel);
  await click('Delete selected item'); assert.equal(await count(),1); assert.equal((await worldPixel(550,350))[3],0);
  await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await count(),2); assert.equal(await digest(),beforeCancel);
  await key('PageDown','PageDown'); assert.ok(await selection(),'Items can be selected without a pointer');
  results.push('zoom/pan transforms, non-persisted previews, Escape cancellation, keyboard nudge/cycling, delete and undo');

  // Text enters Select on insertion. Clicking a glyph, not a surrounding bitmap,
  // moves only that object. A second independent text object remains unaffected.
  await click('Reset canvas view'); await textAt('Popular Canvas',200,500);
  assert.equal(await evaluate("document.querySelector('#popcan-canvas').dataset.tool"),'select');
  const textHit=await firstPixel(200,500,400,65), textId=await selection(); assert.ok(textHit);
  await stroke(textHit.x,textHit.y,textHit.x+160,textHit.y+80);
  assert.equal(await selection(),textId); const withText=await digest();
  await saved(); const recordData=await readLocal(); assert.equal(recordData.version,3); assert.equal(recordData.objects.length,3);
  await call('Page.reload'); await until(ready); await sleep(150);
  assert.equal(await digest(),withText,'Layered draft restores pixels exactly'); assert.equal(await count(),3);
  if (await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display!=='none'")) await click('Close brush settings');
  await click('Select & move (V)'); await stroke(textHit.x+160,textHit.y+80,textHit.x+180,textHit.y+80);
  assert.equal(await selection(),textId,'Individual items stay selectable after reload');
  assert.deepEqual(await worldPixel(300,200),red); assert.deepEqual(await worldPixel(550,350),blue);
  await screenshot('desktop-selection-light'); await click('Toggle dark mode'); await sleep(150); await screenshot('desktop-selection-dark');
  results.push('independent raster text, automatic selection and versioned local persistence across reload');

  // Eraser edits remain attached to each object; moving cannot reveal its erased
  // pixels or clear a different object at the drop location.
  await newCanvas(); await settings('#dd3344','60'); await click('Brush (B)'); await stroke(250,350,550,350);
  await settings('#dd3344','24'); await click('Eraser (E)'); await stroke(400,340,400,360);
  assert.equal((await worldPixel(400,350))[3],0); assert.equal(await count(),1);
  await click('Select & move (V)'); await stroke(300,350,300,470);
  assert.equal((await worldPixel(400,470))[3],0,'Erased hole moves with its object');
  assert.ok((await worldPixel(300,470))[3]>200); assert.equal((await worldPixel(300,350))[3],0);
  // Flood fill is an independent overlay, not a destructive flatten of the stack.
  await newCanvas(); await settings('#dd3344','12'); await click('Rectangle (R)'); await stroke(250,300,550,500);
  await settings('#3355dd','12'); await click('Fill (G)'); await stroke(350,400,350,400);
  assert.equal(await count(),2); await click('Select & move (V)'); await stroke(350,400,750,400);
  assert.equal((await worldPixel(350,400))[3],0); assert.ok((await worldPixel(250,400))[3]>200);
  assert.ok((await worldPixel(750,400))[3]>200);
  results.push('per-object erasure, preserved erased holes, movable fill and hollow-shape hit testing');

  // Import a local raster with transparent margins. Its visible pixels, not its
  // former empty bounds, form the independently draggable image object.
  await newCanvas();
  const imageData=await evaluate("(() => {const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='#55dd66';x.fillRect(80,30,40,40);return c.toDataURL().split(',')[1]})()");
  const imagePath=path.join(output,'selection-import.png');fs.writeFileSync(imagePath,Buffer.from(imageData,'base64'));
  const rootNode=await call('DOM.getDocument'); const fileNode=await call('DOM.querySelector',{nodeId:rootNode.root.nodeId,selector:'input[type=file]'});
  await call('DOM.setFileInputFiles',{nodeId:fileNode.nodeId,files:[imagePath]});await sleep(250);
  assert.equal(await count(),1); assert.equal(await evaluate("document.querySelector('#popcan-canvas').dataset.tool"),'select');
  const imagePixel=await worldPixel(600,400); assert.ok(imagePixel[3]>200);
  await stroke(600,400,800,550); assert.deepEqual(await worldPixel(800,550),imagePixel);assert.equal((await worldPixel(500,350))[3],0);
  await saved(); const imported=await digest();
  // A pre-object saved PNG cannot recover its historic strokes. Preserve it as
  // one movable layer, never discard it or pretend to reconstruct those objects.
  await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('popcan-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),q=store.get('current');q.onsuccess=()=>{const d=q.result;delete d.version;delete d.objects;store.put(d,'current')};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})`);
  await call('Page.reload');await until(ready);await sleep(100);
  assert.equal(await digest(),imported);assert.equal(await count(),1);
  if (await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display!=='none'")) await click('Close brush settings');
  await click('Select & move (V)');await stroke(800,550,750,500);assert.match(await evaluate("document.querySelector('.pc-selection-actions').textContent"),/Earlier artwork/);
  assert.deepEqual(await worldPixel(750,500),imagePixel);
  results.push('local image import, transparent margins and non-destructive legacy migration');

  await newCanvas();await settings('#3355dd','48');await click('Brush (B)');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await sleep(120);
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:140,y:420}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:420}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
  assert.equal(await count(),1);const mobileBefore=await digest(), mobileView=await camera();
  await click('Select & move (V)');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:420}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200,y:490}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
  assert.notEqual(await digest(),mobileBefore);assert.deepEqual(await camera(),mobileView);assert.equal(await count(),1);
  const mobileMoved=await digest();await screenshot('mobile-selection');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:0,x:200,y:490}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:0,x:210,y:500}]});
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:0,x:210,y:500},{id:1,x:290,y:500}]});
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:0,x:190,y:500},{id:1,x:310,y:500}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
  assert.equal(await digest(),mobileMoved,'Pinch cancels only the unfinished object drag');
  assert.ok((await camera()).scale>mobileView.scale);assert.ok(await coverage());
  await click('Undo (Ctrl or ⌘ Z)');assert.equal(await digest(),mobileBefore,'Navigation never adds an undo step');
  results.push('touch selection and movement, independent camera, pinch cancellation and mobile layout');
  assert.equal(errors.length,0,JSON.stringify(errors));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({success:true,origin,results,errors},null,2));
  console.log(JSON.stringify({success:true,origin,results}));
} catch (error) {
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ success: false, origin, results, errors, error: error.message, stack: error.stack }, null, 2));
  throw error;
} finally {
  socket?.close(); child?.kill(); server?.close();
  if (profile) { try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Browser handles may still be releasing. */ } }
}
