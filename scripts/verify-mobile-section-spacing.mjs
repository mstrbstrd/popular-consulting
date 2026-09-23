// Real production-layout checks. Local fictional sessions only; no Auth0 calls.
// Requires agent-browser on PATH (or AGENT_BROWSER_BIN), not a runtime dependency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createBuildServer } from './auth-invoice-test-server.mjs';

const execute = promisify(execFile);
const output = path.resolve('mobile-section-spacing-evidence');
fs.mkdirSync(output, { recursive: true });
const server = createBuildServer({ buildRoot: path.resolve('build'), getSession: () => ({ authenticated: false }) });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const session = `mobile-spacing-${process.pid}`;
const browser = async (...args) => {
  const { stdout } = await execute(process.env.AGENT_BROWSER_BIN || 'agent-browser', ['--session', session, '--json', ...args], {
    timeout: 45000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: process.env.VISUAL_CAPTURE_BROWSER || '/usr/bin/google-chrome' },
  });
  const result = JSON.parse(stdout);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
};
const evaluate = async expression => (await browser('eval', expression)).result;
const wait = expression => evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve(true)}else if(++n>160){clearInterval(timer);reject(new Error('Section did not settle'))}},50)})`);
const reports = [];
try {
  await browser('open', `${origin}/login?graphics=css`);
  await browser('wait', '#login .auth-card');
  fs.writeFileSync(path.join(output, 'initial-snapshot.json'), JSON.stringify(await browser('snapshot', '-i'), null, 2));
  for (const [width, height] of [[320, 640], [390, 844], [430, 932], [768, 1024], [844, 390], [1440, 900]]) {
    await browser('set', 'viewport', String(width), String(height));
    for (const theme of ['light', 'dark']) {
      const report = { width, height, theme, sections: [], failures: [] };
      try {
        await evaluate(`localStorage.setItem('popcon-theme', ${JSON.stringify(theme)})`);
        await browser('open', `${origin}/login?graphics=css`);
        await wait('document.querySelector("#login .auth-primary")');
        await evaluate('document.fonts.ready');
        for (const index of [0, 1, 2, 3, 4]) {
          await evaluate(`new Promise(resolve => {
            const dot = document.querySelectorAll('.section-dot')[${index}];
            if (dot.classList.contains('active')) { resolve(true); return; }
            window.addEventListener('sectionChangeEnd', () => resolve(true), { once: true });
            dot.click();
          })`);
          await wait(`document.querySelector('.section-container.active')?.dataset.section === '${index}'`);
          await evaluate('new Promise(resolve => setTimeout(resolve, 500))');
          const geometry = await evaluate(`(() => {
            const dots = [...document.querySelectorAll('.section-dot')];
            const rect = e => { const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; };
            const visible = r => r.right>0 && r.left<innerWidth && r.bottom>0 && r.top<innerHeight;
            const cards = [...document.querySelectorAll('.section-container.active .bio-head, .section-container.active .service-card, .section-container.active .contact-form, .section-container.active .auth-card')].map(rect).filter(visible);
            const dotRects = dots.map(rect);
            const overlaps = cards.some(c=>dotRects.some(d=>c.left<d.right && c.right>d.left && c.top<d.bottom && c.bottom>d.top));
            const controls = [...document.querySelectorAll('.section-container.active input, .section-container.active textarea, .section-container.active button, .section-container.active a[href], .section-container.active summary')];
            const intercepted = controls.filter(e=> {
              const r=rect(e);if(!visible(r) || r.width<1 || r.height<1)return false;
              const x=Math.min(innerWidth-1,r.right-8), y=Math.max(0,Math.min(innerHeight-1,(r.top+r.bottom)/2));
              return document.elementFromPoint(x,y)?.closest('.section-dots');
            }).map(e=>e.textContent.trim() || e.name || e.tagName);
            const card=document.querySelector('.section-container.active .auth-card');
            const style=card?getComputedStyle(document.querySelector('#login .auth-content')):null;
            return {dots:dotRects,overlaps,intercepted,card:card?rect(card):null,padding:style?[style.paddingLeft,style.paddingRight]:null,overflow:document.documentElement.scrollWidth>innerWidth+1};
          })()`);
          report.sections.push({ index, ...geometry });
          assert.equal(geometry.overflow, false, `Section ${index} overflows horizontally`);
          if (width <= 768) {
            assert.equal(geometry.dots.length, 5);
            assert.ok(geometry.dots.every(d => Math.abs(width-d.right-2)<1 && Math.abs(d.width-8)<1), `Section ${index}: mobile dots are not at the edge`);
            assert.equal(geometry.overlaps, false, `Section ${index}: dots overlap a card`);
            assert.deepEqual(geometry.intercepted, [], `Section ${index}: dots intercept a control`);
            for (let i=1;i<geometry.dots.length;i++) assert.ok(geometry.dots[i].top-geometry.dots[i-1].top>=43.9, 'Tap targets overlap vertically');
            if (geometry.card) {
              assert.ok(Math.abs((geometry.card.left+geometry.card.right)/2-width/2)<=1, 'Login is not centered');
              assert.equal(geometry.padding[0], geometry.padding[1], 'Login gutters differ');
            }
          } else {
            assert.ok(geometry.dots[0].width>=11.9, 'Desktop dots were resized');
          }
          if (width===390 || (index===4 && (width===320 || width===1440))) await browser('screenshot', path.join(output, `${width}-${theme}-section-${index}.png`));
        }
        // Overflowing help must not shift the card when a scrollbar appears.
        if (width<=768) {
          await browser('open', `${origin}/login?graphics=css&error=passkey_required`);
          await wait('document.querySelector(".auth-help summary")');
          await browser('click', '.auth-help summary');
          const centered = await evaluate(`(()=>{const r=document.querySelector('#login .auth-card').getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<=1})()`);
          assert.ok(centered, 'Expanded help shifts Login off-center');
          // The dots must remain usable, including keyboard focus.
          await evaluate(`document.querySelectorAll('.section-dot')[3].focus()`);
          await browser('press', 'Enter');
          await wait('document.querySelector(".section-container.active")?.dataset.section === "3"');
        }
      } catch (error) {
        report.failures.push(error.message);
        await browser('screenshot', path.join(output, `${width}-${theme}-failure.png`)).catch(()=>{});
      }
      reports.push(report);
      console.log(JSON.stringify({ width, height, theme, sections: report.sections.length, failures: report.failures }));
    }
  }
  const errors = await browser('errors');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ reports, errors }, null, 2));
  assert.ok(reports.every(r=>r.failures.length===0), 'Mobile section spacing regression');
} finally {
  await browser('close').catch(()=>{});
  server.close();
}
