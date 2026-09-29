import fs from 'node:fs';
const source = fs.readFileSync('scripts/verify-popcan-selection.mjs','utf8');
const before = source.indexOf('  // Helpers inspect rendered pixels');
const after = source.indexOf('} catch (error) {',before);
if(before < 0 || after < 0) throw new Error('Unexpected test harness');
const checks = `
  await evaluate(\`(() => {
    window.__trace=[];
    const release=Element.prototype.releasePointerCapture;
    Element.prototype.releasePointerCapture=function(id){window.__trace.push({type:'release-call',id,stack:new Error().stack});return release.call(this,id)};
    for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture','gotpointercapture'])document.addEventListener(type,e=>window.__trace.push({type,target:e.target.id,buttons:e.buttons,id:e.pointerId,time:performance.now()}),true);
  })()\`);
  await settings();
  for(const tool of ['Brush (B)','Rectangle (R)','Ellipse (O)']) {
    await newCanvas(); await click(tool);
    for(let i=0;i<10;i++) {
      const before=await count();
      await stroke(200+(i%5)*130,200+Math.floor(i/5)*150,260+(i%5)*130,260+Math.floor(i/5)*150);
      results.push({tool,i,before,after:await count(),status:await evaluate("document.querySelector('.pc-status').textContent")});
      if(i%2) await sleep(450);
    }
  }
  await screenshot('consecutive');
  fs.writeFileSync(path.join(output,'trace.json'),JSON.stringify(await evaluate('window.__trace'),null,2));
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({success:results.every(r=>r.after===r.before+1),origin,results,errors},null,2));
  console.log(JSON.stringify({results,errors}));
`;
fs.writeFileSync('scripts/.popcan-regression-probe.mjs',source.slice(0,before)+checks+source.slice(after));
