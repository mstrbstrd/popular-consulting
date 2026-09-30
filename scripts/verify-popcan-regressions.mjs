// Node 22+; Chrome/Edge must be installed. Tests the real built route and storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { findBrowser, createBuildServer } from './dark-evidence-browser.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = path.resolve(process.env.POPCAN_VERIFY_OUTPUT || 'popcan-regressions');
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
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popcan-regression-browser-'));
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
  const assets = () => evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('popcan-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts'),q=tx.objectStore('drafts').get('current');q.onsuccess=async()=>{try{const d=q.result;resolve({version:d.version,width:d.width,height:d.height,originX:d.originX,originY:d.originY,objects:await Promise.all(d.objects.map(async o=>({id:o.id,kind:o.kind,x:o.x,y:o.y,width:o.width,height:o.height,pixelSize:o.pixelSize||1,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await o.blob.arrayBuffer()))).join(',')})))});}catch(e){reject(e)}};tx.oncomplete=()=>db.close()};r.onerror=()=>reject(r.error)})`);
  const newCanvas = async () => {
    await click('New canvas'); await until(`document.querySelector('.pc-dialog')`);
    await evaluate("document.querySelector('.pc-dialog button[type=submit]').click()");
    await until(`!document.querySelector('.pc-dialog')`); await sleep(100);
    assert.equal(await count(),0,'A fresh canvas has no objects');
    assert.ok(await evaluate(`(() => {const c=${painted},p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<p.length;i+=4)if(p[i])return false;return true})()`),'A fresh canvas must contain no stale pixels');
  };
  const textAt = async (value,x,y) => {
    await click('Text (T)'); await stroke(x,y,x,y); await until(`document.querySelector('.pc-dialog')`);
    await fillInput('Text to add',value); await fillInput('Text size','42'); await fillInput('Text colour','#44dddd');
    await evaluate("document.querySelector('.pc-dialog button[type=submit]').click()");
    await until(`!document.querySelector('.pc-dialog')`); await sleep(100);
  };
  // Use native wheel events, not synthetic capture-loss injection. A trackpad
  // can emit momentum or zero-delta wheel events while a mouse button is held.
  // Neither the camera nor committed pixels may change until that press ends.
  await evaluate("window.__pcWheels=[];document.querySelector('#popcan-canvas').addEventListener('wheel',e=>window.__pcWheels.push({trusted:e.isTrusted,x:e.deltaX,y:e.deltaY}))");
  const wheelCases = [
    { deltaX: 0, deltaY: 0 }, { deltaX: 0, deltaY: 1 },
    { deltaX: 2, deltaY: 0 }, { deltaX: 0, deltaY: 2, modifiers: 8 },
  ];
  const wheelGesture = async (tool, wheel, x=460, y=430, ex=590, ey=470) => {
    const beforeView=await camera(), beforePixels=await digest();
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:(x+ex)/2,y:(y+ey)/2,button:'left',buttons:1});
    await sleep(30);
    await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:(x+ex)/2,y:(y+ey)/2,buttons:1,...wheel});
    await sleep(60);
    assert.equal(await evaluate(`${painted}.style.visibility`),'hidden',`Scroll input must not cancel an active ${tool}`);
    assert.deepEqual(await camera(),beforeView,'A held pointer owns the camera, including during Shift-scroll');
    assert.equal(await digest(),beforePixels,'Wheel input cannot commit or change document pixels mid-gesture');
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:ex,y:ey,button:'left',buttons:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:ex,y:ey,button:'left',buttons:0,clickCount:1});
    await sleep(80);
  };
  for (const material of ['Sand','Ink']) {
    if(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display==='none'")) await click('Brush settings');
    await evaluate(`[...document.querySelectorAll('.pc-segment button')].find(b=>b.textContent===${JSON.stringify(material)}).click()`);
    await click('Close brush settings');
    for (const tool of ['Brush (B)','Rectangle (R)','Ellipse (O)']) {
      await click(tool);
      for (const wheel of wheelCases) {
        await newCanvas(); const blank=await digest();
        await wheelGesture(tool,wheel);
        assert.equal(await count(),1,`${material} ${tool}: interrupted mark must commit exactly once`);
        const committed=await digest(); assert.notEqual(committed,blank,'The committed mark contains real pixels');
        await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await count(),0); assert.equal(await digest(),blank);
        await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(),committed);
      }
    }
    await newCanvas(); await click('Brush (B)'); await screenStroke(450,430,610,470);
    const paintedPixels=await digest(); await click('Eraser (E)');
    for (const wheel of wheelCases) {
      await wheelGesture('eraser',wheel,490,440,550,455);
      const erasedPixels=await digest();
      assert.notEqual(erasedPixels,paintedPixels,'Erasing must remove actual pixels despite wheel input');
      await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),paintedPixels);
      await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await digest(),erasedPixels);
      await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await digest(),paintedPixels);
    }
  }
  assert.equal(await evaluate('window.__pcWheels.length'),32);
  assert.ok(await evaluate('window.__pcWheels.every(e=>e.trusted)'),'Wheel events must be browser-generated input');
  await wheelGesture('eraser',wheelCases[1],490,440,550,455);
  const savedErase=await digest(); await saved();
  await evaluate("document.documentElement.dataset.pcReloadProbe='pending'");
  await call('Page.reload'); await until(`!document.documentElement.hasAttribute('data-pc-reload-probe') && (${ready})`); await sleep(150);
  assert.equal(await digest(),savedErase,'Erased pixels must stay erased after saving and reloading');
  if(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display!=='none'")) await click('Close brush settings');
  // The guard must not disable wheel navigation once the stroke has finished.
  const idleView=await camera();
  await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:700,y:550,deltaX:0,deltaY:-70}); await sleep(100);
  assert.ok((await camera()).scale>idleView.scale,'Wheel zoom resumes after pointer-up');
  results.push('24 Sand/Ink marks and 9 erasures survive native zero-delta, momentum, horizontal and Shift-wheel input; one-step undo/redo, persisted erasure and idle zoom');

  // Exercise the unchanged tool repeatedly, including queued capture bookkeeping
  // from the preceding press. Synthetic loss is injected; the drags are native.
  await settings('#cc4477','18');
  await evaluate("document.querySelector('#popcan-canvas').addEventListener('pointerdown',e=>{window.__pcPointerId=e.pointerId})");
  const interruptedStroke = async (x,y,ex,ey,release=false) => {
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:(x+ex)/2,y:(y+ey)/2,button:'left',buttons:1});
    if(release) await evaluate("document.querySelector('#popcan-canvas').releasePointerCapture(window.__pcPointerId)");
    else await evaluate("document.querySelector('#popcan-canvas').dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:window.__pcPointerId,buttons:0,bubbles:true}))");
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:ex,y:ey,button:'left',buttons:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:ex,y:ey,button:'left',buttons:0,clickCount:1});
    await sleep(80);
  };
  for(const tool of ['Brush (B)','Rectangle (R)','Ellipse (O)']) {
    await newCanvas(); await click(tool);
    for(let i=0;i<8;i++) {
      const before=await count();
      await stroke(150+i*110,260,200+i*110,320);
      assert.equal(await count(),before+1,`${tool}: consecutive gesture ${i+1} must remain`);
    }
    for(let i=0;i<4;i++) {
      const before=await count(), v=await camera();
      await interruptedStroke(v.x+(220+i*150)*v.scale,v.y+420*v.scale,v.x+(270+i*150)*v.scale,v.y+480*v.scale);
      assert.equal(await count(),before+1,`${tool}: late capture loss must not cancel a newer press`);
    }
    const before=await count(), pixels=await digest(), v=await camera();
    await interruptedStroke(v.x+220*v.scale,v.y+550*v.scale,v.x+340*v.scale,v.y+610*v.scale,true);
    assert.equal(await count(),before,'Genuine capture loss cancels an unfinished gesture');
    assert.equal(await digest(),pixels,'Cancellation restores all pixels');
    await click('Undo (Ctrl or ⌘ Z)'); assert.equal(await count(),before-1);
    await click('Redo (Ctrl or ⌘ Shift Z)'); assert.equal(await count(),before);
  }
  results.push('24 uninterrupted native draws, 12 late capture-loss cases, genuine cancellation and one-step undo/redo');

  // A normal large brush previously stopped accepting input around 40 objects:
  // every mark was a separate raw bitmap and the 20 MiB live-object guard was
  // reached long before the advertised 512-item ceiling. Keep drawing through
  // repeated bounded compactions and persist the resulting grouped layer.
  await newCanvas();
  if(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display==='none'")) await click('Brush settings');
  await evaluate("[...document.querySelectorAll('.pc-segment button')].find(b=>b.textContent==='Sand').click()");
  await fillInput('Brush size','160'); await click('Close brush settings'); await click('Brush (B)');
  for(let i=0;i<25&&(await camera()).scale>0.1;i++) await click('Zoom out');
  let compactions=0;
  for(let i=0;i<80;i++) {
    const before=await digest(), previousCompactions=compactions;
    const x=150+(i%10)*105, y=210+Math.floor(i/10)*85;
    await screenStroke(x,y,x+52+(i%3)*8,y+(i%2?14:-14));
    assert.notEqual(await digest(),before,`Large brush mark ${i+1} must change pixels`);
    assert.doesNotMatch(await evaluate("document.querySelector('.pc-status').textContent"),/Object limit reached/);
    compactions=await evaluate("+document.querySelector('#popcan-canvas').dataset.compactionCount");
    if(compactions>previousCompactions) assert.match(await evaluate("document.querySelector('.pc-status').textContent"),/older items grouped/);
  }
  assert.ok(compactions>=2,'The stress fixture must cross the bitmap budget more than once');
  await click('Fit all artwork'); await sleep(150);
  const compactedPixels=await digest(), compactedCount=await count(); await saved();
  const compactedAssets=await assets();
  assert.equal(compactedAssets.objects.length,compactedCount,'Every grouped or recent item must reach IndexedDB');
  await call('Page.reload'); await until(ready); await sleep(200);
  await click('Fit all artwork'); await sleep(150);
  assert.equal(await digest(),compactedPixels,'Compacted artwork must restore exactly');
  assert.equal(await count(),compactedCount,'Grouped and recent items must persist');
  assert.deepEqual(await assets(),compactedAssets,'Compacted object metadata and PNG bytes must persist');
  await screenshot('continued-after-compaction');
  results.push('80 large minimum-zoom brush marks continue through repeated visible compaction and exact draft reload');

  // Keep the following independent rendering checks on a small document so
  // their layer-count assertions are not coupled to the capacity fixture.
  await newCanvas(); await click('Brush (B)'); await screenStroke(520,440,640,480);
  const background = () => evaluate("getComputedStyle(document.querySelector('#popcan-canvas')).backgroundColor");
  const pixels=await digest();
  if(await evaluate("document.documentElement.dataset.theme==='dark'")) await click('Toggle dark mode');
  assert.equal(await background(),'rgb(255, 248, 247)','Automatic paper follows light mode');
  await screenshot('desktop-light');
  await click('Toggle dark mode'); assert.equal(await background(),'rgb(17, 17, 22)');
  await screenshot('desktop-dark'); assert.equal(await digest(),pixels,'Theme changes never recolour artwork');
  await click('Brush settings'); await click('White canvas'); await click('Close brush settings');
  await click('Toggle dark mode'); assert.equal(await background(),'rgb(255, 255, 255)','An explicitly chosen paper stays fixed');
  await click('Brush settings'); await click('Match theme canvas'); await click('Close brush settings');
  assert.equal(await background(),'rgb(255, 248, 247)');
  results.push('automatic light/dark paper, fixed paper overrides, unchanged pigment and history');

  // PNG hashes of individual objects verify that empty-space expansion and view
  // changes never resample previous objects, even when the display is bounded.
  await saved(); const originalAssets=(await assets()).objects;
  for(let i=0;i<25&&(await camera()).scale>0.1;i++) await click('Zoom out');
  assert.equal((await camera()).scale,0.1);
  for(const [tool,x] of [['Brush (B)',180],['Rectangle (R)',580],['Ellipse (O)',980]]) {
    await click(tool);const before=await count();await screenStroke(x,550,x+140,650);
    assert.equal(await count(),before+1,`${tool} still draws at minimum zoom outside old bitmap bounds`);
  }
  await click('Move canvas (H)');const beforePan=await camera();await screenStroke(620,470,990,620);
  assert.ok((await camera()).x>beforePan.x+300);
  await click('Brush (B)');const beforePanDraw=await count();await screenStroke(400,700,700,730);
  assert.equal(await count(),beforePanDraw+1,'New drawing space remains usable after panning at minimum zoom');
  assert.ok(await evaluate(`${painted}.width<=4096&&${painted}.height<=4096&&${painted}.width*${painted}.height<=4194304`),'Display allocation remains bounded');
  await saved();const wide=await assets();assert.equal(wide.version,3);assert.ok(wide.width>4096);
  assert.deepEqual(wide.objects.slice(0,originalAssets.length),originalAssets,'Previous object positions and PNG bytes survive sparse growth');
  await screenshot('minimum-zoom');
  const wideCount=await count();await call('Page.reload');await until(ready);await sleep(200);
  assert.equal(await count(),wideCount);assert.deepEqual((await assets()).objects,wide.objects,'Wide scenes reload without flattening objects');
  if(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display!=='none'"))await click('Close brush settings');
  // A broad mark stores its own resolution. Selection still moves logical world coordinates.
  await click('Select & move (V)');await key('PageDown','PageDown');await sleep(70);
  assert.ok(await selection());await key('ArrowRight','ArrowRight');await sleep(70);
  await saved();const nudged=await assets();assert.equal(nudged.objects[0].x,wide.objects[0].x+1);
  assert.equal(nudged.objects[0].hash,wide.objects[0].hash);
  await click('Undo (Ctrl or ⌘ Z)');await saved();assert.deepEqual((await assets()).objects,wide.objects);
  const downloads=path.join(output,'downloads');fs.mkdirSync(downloads,{recursive:true});
  await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await click('Export PNG');
  for(let i=0;i<100&&!fs.readdirSync(downloads).some(n=>n.endsWith('.png'));i++)await sleep(100);
  const pngName=fs.readdirSync(downloads).find(n=>n.endsWith('.png'));assert.ok(pngName);
  const png=fs.readFileSync(path.join(downloads,pngName)),w=png.readUInt32BE(16),h=png.readUInt32BE(20);
  assert.ok(w<=4096&&h<=4096&&w*h<=4194304,'Large PNG export must stay within the allocation budget');
  results.push('minimum-zoom drawing for all three tools, distant space, pan, bounded allocation/export, exact old assets, layered reload and nudging');

  // Former versions saved the implicit Midnight default. Migrate that default
  // to automatic paper without damaging the saved objects.
  await newCanvas();await settings('#cc4477','18');await click('Brush (B)');await stroke(300,300,400,330);await saved();
  const legacy=await digest();
  await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('popcan-local',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),q=store.get('current');q.onsuccess=()=>store.put({...q.result,version:2,paper:'#111116'},'current');tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})`);
  await call('Page.reload');await until(ready);await sleep(150);
  assert.equal(await background(),'rgb(255, 248, 247)');assert.equal(await digest(),legacy);
  if(await evaluate("getComputedStyle(document.querySelector('.pc-inspector')).display!=='none'"))await click('Close brush settings');
  results.push('version-2 default paper migration with preserved original pixels');

  await newCanvas();await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await sleep(150);
  for(let i=0;i<25&&(await camera()).scale>0.1;i++)await click('Zoom out');
  for(const tool of ['Brush (B)','Rectangle (R)','Ellipse (O)']) {
    await click(tool);
    for(let i=0;i<3;i++) {
      const before=await count();
      await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:110+i*60,y:440}]});
      await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:145+i*60,y:480}]});
      await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(100);
      assert.equal(await count(),before+1,`${tool}: consecutive touch mark at minimum zoom`);
    }
  }
  await screenshot('mobile-minimum-zoom');
  results.push('nine consecutive mobile touch drawings at minimum zoom');
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
