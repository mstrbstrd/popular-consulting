import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { findBrowser, runBrowserCapture } from './dark-evidence-browser.mjs';

// Compile and draw the actual production GLSL. Software GPU validation is not
// a physical-device performance benchmark. No app policy changes are shipped.
const literal = (file, name) => {
  const source = fs.readFileSync(path.resolve(file), 'utf8');
  const match = source.match(new RegExp(`export const ${name} = \x60([\\s\\S]*?)\x60;`));
  assert(match, `Missing shader ${name}`);
  return match[1];
};
const vertex = literal('src/components/CreatorOSFieldShader.js', 'CREATOROS_FIELD_VERTEX_SHADER');
let fragment = literal('src/components/CreatorOSFieldShader.js', 'CREATOROS_FIELD_FRAGMENT_SHADER');
for (const [name, file] of [['METABLOOM_NOVA_SHADER', 'MetabloomNovaShader.js'],
  ['CHIRAL_WEAVE_SHADER', 'ChiralWeaveShader.js'], ['NAVIER_STOKES_SHADER', 'NavierStokesShader.js'], ['NAVIER_CORE_SHADER', 'navierStokesField.js']]) {
  fragment = fragment.replace(`\${${name}}`, literal(`src/components/${file}`, name));
}
assert(!fragment.includes('${'));
const start = fragment.indexOf('vec4 sampleScene(int mode, vec2 uv, float time) {');
const end = fragment.indexOf('\n\nvoid main() {', start);
assert(start > 0 && end > start);
fragment = fragment.slice(0, start)
  + 'vec4 sampleScene(int mode, vec2 uv, float time) { return sceneNavierStokes(uv, time); }'
  + fragment.slice(end);
const fieldJS = fs.readFileSync('src/components/navierStokesField.js', 'utf8').replaceAll('export ', '');
const output = path.resolve('navier-stokes-evidence');
fs.mkdirSync(output, { recursive: true });
const fixture = (light) => `<!doctype html><html><head><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${light ? '#fff8f7' : '#080809'}}
canvas{width:100%;height:100%;display:block;image-rendering:pixelated}pre{display:none}
</style></head><body><canvas></canvas><pre id="navier-report">RUNNING</pre><script>
${fieldJS}
const result={failures:[],light:${light}};
const check=(ok,message)=>{if(!ok)result.failures.push(message);};
try {
const canvas=document.querySelector('canvas');canvas.width=Math.ceil(innerWidth/2);canvas.height=Math.ceil(innerHeight/2);
const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});
if(!gl)throw Error('WebGL2 unavailable');
const compile=(kind,source)=>{const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
const program=gl.createProgram(),v=compile(gl.VERTEX_SHADER,${JSON.stringify(vertex)}),f=compile(gl.FRAGMENT_SHADER,${JSON.stringify(fragment)});
gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const a=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);gl.viewport(0,0,canvas.width,canvas.height);
const draw=(progress,time=40,energy=0,pointer=[.5,.5],age=8)=>{
const scalar=(name,value)=>gl.uniform1f(gl.getUniformLocation(program,name),value),vector=(name,...values)=>gl.uniform2f(gl.getUniformLocation(program,name),...values);
const cores=writeNavierCores(new Float32Array(16),time,.37,innerWidth<500?3:4);
gl.uniform4fv(gl.getUniformLocation(program,'u_navierCores[0]'),cores);
gl.uniform1i(gl.getUniformLocation(program,'u_navierCoreCount'),innerWidth<500?3:4);
scalar('u_navierAspect',canvas.width/canvas.height);
vector('u_res',canvas.width,canvas.height);vector('u_pointer',...pointer);vector('u_pulseOrigin',.5,.5);
for(const [key,value]of Object.entries({u_navierProgress:progress,u_time:time,u_light:${light ? 1 : 0},u_intro:1,u_energy:energy,u_seed:.37,u_pulseAge:age,u_modeMix:0}))scalar(key,value);
gl.uniform1i(gl.getUniformLocation(program,'u_modeA'),9);gl.uniform1i(gl.getUniformLocation(program,'u_modeB'),9);
gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();check(gl.getError()===gl.NO_ERROR,'WebGL error');
const data=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
const difference=(a,b)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length;
const cover=a=>{let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>30)n++;return n/(a.length/4);};
const early=draw(0),middle=draw(.55),late=draw(1);
result.dimensions=[canvas.width,canvas.height];result.coverage=[cover(early),cover(middle),cover(late)];
result.concentrationDifference=difference(early,late);result.repeatDifference=difference(middle,draw(.55));
result.timeDifference=difference(middle,draw(.55,43));result.pointerDifference=difference(middle,draw(.55,40,1,[.8,.6]));
// Sample the outward-moving pulse before it leaves the compact portrait core.
// Retain the visibility threshold and check both palettes at every sample.
result.pulseSamples=[.08,.2,.45,1].map(age=>difference(middle,draw(.55,40,0,[.5,.5],age)));
result.pulseDifference=Math.max(...result.pulseSamples);
check(result.coverage.every(x=>x>.85),'Fluid no longer occupies the full frame');
check(navierCoreRadius(1)<navierCoreRadius(0)*.001,'Core does not contract');
check(result.concentrationDifference>.05,'Concentration has no visible effect');check(result.repeatDifference===0,'Inspection is nondeterministic');
check(result.timeDifference>.5,'Clock has no visible effect');check(result.pointerDifference>.05,'Pointer does not bend');check(result.pulseDifference>.05,'Pulse has no effect');
for(const time of [0,.1,27.99,28,56,100000])draw(-1,time);
for(const time of [27.99,28,28.01,56,112,100000])check(cover(draw(-1,time))>.85,'Fluid faded at former replay boundary');
const final=draw(.55);let invalid=0;for(let i=0;i<final.length;i+=4)if(Math.max(final[i],final[i+1],final[i+2])>final[i+3]+1)invalid++;
check(invalid===0,'Output is not premultiplied');result.productionCompiled=true;
gl.deleteBuffer(buffer);gl.deleteProgram(program);
}catch(error){result.failures.push(error.message);}
document.getElementById('navier-report').textContent=JSON.stringify(result);
</script></body></html>`;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (!['/', '/scene'].includes(url.pathname)) { response.writeHead(404); response.end(); return; }
  const light = url.searchParams.get('light') === '1';
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  if (url.pathname === '/scene') { response.end(fixture(light)); return; }
  const mobile = url.searchParams.get('width') === '390';
  response.end(`<!doctype html><html><body style="margin:0;overflow:hidden">
    <pre id="navier-report" style="display:none">RUNNING</pre><iframe title="Navier Stokes shader fixture"
    style="display:block;border:0;width:${mobile ? 390 : 1440}px;height:${mobile ? 844 : 900}px"
    src="/scene?light=${light ? 1 : 0}" onload="document.getElementById('navier-report').textContent=this.contentDocument.getElementById('navier-report').textContent"></iframe></body></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const browserPath = findBrowser(); assert(browserPath, 'Chromium is required');
  const reports = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const light of [0, 1]) {
      const screenshotPath = path.join(output, `navier-${viewport.width}-${light ? 'light' : 'dark'}.png`);
      const dom = await runBrowserCapture({ browserPath, url: `http://127.0.0.1:${server.address().port}/?light=${light}&width=${viewport.width}`,
        screenshotPath, profilePrefix: 'navier-', viewport, allowSoftware: true, virtualTimeBudgetMs: 2000 });
      const match = dom.match(/<pre id="navier-report"[^>]*>([^<]+)<\/pre>/); assert(match && match[1] !== 'RUNNING');
      const report = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
      reports.push(report); fs.rmSync(screenshotPath.replace(/\.png$/, '.html'), { force: true });
    }
  }
  fs.writeFileSync(path.join(output, 'shader-report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  assert(reports.every(report => report.failures.length === 0), 'Navier Stokes GPU regression');
} finally { server.close(); }
