import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.BROWSER_PACKAGES, 'package.json'));
const { chromium } = require('playwright');
const out = process.env.POPCAN_VERIFY_OUTPUT;
fs.mkdirSync(out, { recursive: true });
const origin = process.env.POPCAN_VERIFY_ORIGIN || 'https://popular-consulting.com';
if (!['https://popular-consulting.com','http://127.0.0.1:4173'].includes(origin)) throw new Error('Unexpected origin');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [], steps = [];
page.on('pageerror', e => errors.push(String(e)));
await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
await page.addInitScript(() => {
  window.__pcEvents = [];
  const record = e => {
    if (window.__pcEvents.length > 25000) return;
    const d = document.querySelector('#popcan-canvas')?.dataset;
    window.__pcEvents.push({ type: e.type, target: e.target?.id || e.target?.className || e.target?.nodeName,
      x:e.clientX, y:e.clientY, buttons:e.buttons, button:e.button, pointer:e.pointerId, time:e.timeStamp,
      count:d?.objectCount, tool:d?.tool, focus:document.activeElement?.id, visible:document.visibilityState });
  };
  for (const type of ['pointerdown','pointerup','pointermove','pointercancel','gotpointercapture','lostpointercapture','click','dblclick','wheel','focusin','focusout','visibilitychange']) document.addEventListener(type, record, true);
  window.addEventListener('blur',record); window.addEventListener('resize',record);
});
const info = () => page.evaluate(() => {
  const s=document.querySelector('#popcan-canvas'), c=document.querySelector('.pc-paint');
  if(!c) return {location:location.href, text:document.body.innerText.slice(0,500)};
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let alpha=0,hash=2166136261; for(let i=0;i<data.length;i++) { if(i%4===3) alpha+=data[i]; hash=Math.imul(hash^data[i],16777619); }
  return {count:+s.dataset.objectCount,tool:s.dataset.tool,alpha,hash:hash>>>0,size:[c.width,c.height],
    rect:c.getBoundingClientRect().toJSON(),view:{...s.dataset},status:document.querySelector('.pc-status')?.innerText,
    paintVisibility:c.style.visibility,active:document.activeElement?.id};
});
const click = async name => { await page.getByRole('button',{name,exact:true}).click(); };
async function capture(name) { await page.screenshot({path:path.join(out,name+'.png')}); }
async function stroke(name, points, delay=18) {
  const before=await info();
  await page.mouse.move(...points[0]); await page.mouse.down();
  for(let i=1;i<points.length;i++){ await page.mouse.move(...points[i],{steps:3}); if(delay)await page.waitForTimeout(delay); }
  const during=await info();
  if(name.endsWith('1') || name.endsWith('2')) await capture(name+'-held');
  await page.mouse.up(); await page.waitForTimeout(180);
  const after=await info();
  steps.push({name,before,during,after});
  if(before.hash===after.hash || name.endsWith('1') || name.endsWith('2')) await capture(name+'-released');
  fs.writeFileSync(path.join(out,'steps.json'),JSON.stringify({errors,steps},null,2));
  console.log(name,'objects',before.count,'->',after.count,'alpha',before.alpha,'->',after.alpha,after.status);
}
try {
  await page.goto(origin+'/popcan',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Export PNG',exact:true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Export PNG"]').disabled);
  await page.waitForTimeout(2500);
  await capture('00-initial');
  // No reset, no forced safe mode, no programmatic control clicks, no fake events.
  for(let i=0;i<10;i++) {let y=220+i*43;await stroke('brush-'+(i+1),[[170,y],[330,y-20],[500,y+15],[640,y]]);}
  await click('Rectangle (R)');
  for(let i=0;i<6;i++){let x=200+i*140;await stroke('rectangle-'+(i+1),[[x,700],[x+105,820]]);}
  await click('Ellipse (O)');
  for(let i=0;i<6;i++){let x=680+(i%3)*165,y=230+Math.floor(i/3)*165;await stroke('ellipse-'+(i+1),[[x,y],[x+115,y+115]]);}
  await capture('01-multiple-tools');
  await click('Eraser (E)');
  for(let i=0;i<6;i++) {let y=220+i*43;await stroke('erase-'+(i+1),[[210,y],[330,y-20],[510,y+15],[600,y]]);}
  await capture('02-erased');
  await click('Brush (B)');
  for(let i=0;i<8;i++) await stroke('repeat-'+(i+1),[[820,590],[830,620],[870,650],[900,680],[930,700]],i%2?0:35);
  await capture('03-repeated');
  // Draw toward page edges so output bounds change, then draw within those bounds.
  for(let i=0;i<8;i++){let y=300+i*50;await stroke('growth-'+(i+1),[[100,y],[400,y+10],[800,y-10],[1180,y]]);}
  await capture('04-growth');
  // A normal larger drag at minimum zoom and later erasure.
  for(let i=0;i<12;i++)await click('Zoom out');
  await stroke('zoomed-1',[[180,500],[250,540],[700,450],[1040,570]]);
  await stroke('zoomed-2',[[180,550],[300,500],[700,520],[1040,620]]);
  await click('Eraser (E)'); await stroke('zoom-erase-1',[[240,530],[600,500],[1000,590]]);
  await capture('05-zoomed');
  await page.waitForTimeout(1000);
} finally {
  fs.writeFileSync(path.join(out,'events.json'),JSON.stringify(await page.evaluate(()=>window.__pcEvents || [])));
  fs.writeFileSync(path.join(out,'steps.json'),JSON.stringify({errors,steps},null,2));
  await context.tracing.stop({path:path.join(out,'browser-trace.zip')});
  await browser.close();
}
