import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { findBrowser, runBrowserCapture } from "./dark-evidence-browser.mjs";

// Compile the actual authored shader, not a JS reimplementation. Software GPU
// evidence establishes correctness, not physical-device frame-rate guarantees.
const literal = (file, name) => {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const match = source.match(new RegExp(`export const ${name} = \x60([\\s\\S]*?)\x60;`));
  assert(match, `Missing shader literal ${name}`);
  return match[1];
};
const shaderFile = "src/components/CreatorOSFieldShader.js";
const vertex = literal(shaderFile, "CREATOROS_FIELD_VERTEX_SHADER");
let fragment = literal(shaderFile, "CREATOROS_FIELD_FRAGMENT_SHADER");
for (const [name, file] of [
  ["METABLOOM_NOVA_SHADER", "MetabloomNovaShader.js"],
  ["CHIRAL_WEAVE_SHADER", "ChiralWeaveShader.js"],
  ["NAVIER_STOKES_SHADER", "NavierStokesShader.js"],
  ["NAVIER_CORE_SHADER", "navierStokesField.js"],
]) {
  fragment = fragment.replace(`\${${name}}`, literal(`src/components/${file}`, name));
}
assert(!fragment.includes("${"), "Unresolved shader interpolation");
const start = fragment.indexOf("vec4 sampleScene(int mode, vec2 uv, float time) {");
const end = fragment.indexOf("\n\nvoid main() {", start);
assert(start > 0 && end > start);
fragment = fragment.slice(0, start)
  + "vec4 sampleScene(int mode, vec2 uv, float time) { return sceneChiralWeave(uv, time); }"
  + fragment.slice(end);
// Screen-fixed Bayer cells intentionally do not mirror. Test the geometric
// involution before quantization, then capture the production Bayer compositor.
const raw = fragment.slice(0, fragment.indexOf("\n\nvoid main() {", start))
  + "\nvoid main() { vec4 c=sceneChiralWeave(v_uv,u_time); fragColor=vec4(c.rgb*c.a,c.a); }";
const output = path.resolve("chiral-weave-evidence");
fs.mkdirSync(output, { recursive: true });
const fixture = (light, dna) => `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${light ? "#fff8f7" : "#080809"}}
canvas{width:100%;height:100%;display:block;image-rendering:pixelated}pre{display:none}
</style></head><body><canvas></canvas><pre id="chiral-report">RUNNING</pre><script>
const result={failures:[],renderer:'WebGL2',light:${light},structure:${dna}};
const check=(ok,message)=>{if(!ok)result.failures.push(message);};
try {
const canvas=document.querySelector('canvas');canvas.width=Math.ceil(innerWidth/2);canvas.height=Math.ceil(innerHeight/2);
const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});
if(!gl)throw Error('WebGL2 unavailable');
const compile=(kind,source)=>{const shader=gl.createShader(kind);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;};
const make=(source)=>{const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,${JSON.stringify(vertex)}),f=compile(gl.FRAGMENT_SHADER,source);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
const draw=(program,h,time=40,energy=0,pointer=[.5,.5],age=8,structure=${dna ? 1 : 0})=>{
gl.useProgram(program);const a=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);gl.viewport(0,0,canvas.width,canvas.height);
const f=(name,value)=>gl.uniform1f(gl.getUniformLocation(program,name),value),v=(name,...values)=>gl.uniform2f(gl.getUniformLocation(program,name),...values);
v('u_res',canvas.width,canvas.height);v('u_pointer',...pointer);v('u_pulseOrigin',.5,.5);
for(const [key,value]of Object.entries({u_time:time,u_light:${light ? 1 : 0},u_intro:1,u_energy:energy,u_seed:.37,u_pulseAge:age,u_chiralHandedness:h,u_chiralStructure:structure,u_modeMix:0}))f(key,value);
gl.uniform1i(gl.getUniformLocation(program,'u_modeA'),8);gl.uniform1i(gl.getUniformLocation(program,'u_modeB'),8);gl.drawArrays(gl.TRIANGLES,0,3);gl.finish();check(gl.getError()===gl.NO_ERROR,'WebGL draw error');
const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
const p=make(${JSON.stringify(raw)}),original=draw(p,1),mirror=draw(p,-1),restored=draw(p,1);
const difference=(a,b)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0)/a.length;
let reflectedError=0,opaque=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
const i=(y*canvas.width+x)*4,j=(y*canvas.width+canvas.width-1-x)*4;
for(let c=0;c<4;c++)reflectedError+=Math.abs(original[i+c]-mirror[j+c]);if(original[i+3]>100)opaque++;}
result.dimensions=[canvas.width,canvas.height];result.reflectedError=reflectedError/original.length;result.coverage=opaque/(canvas.width*canvas.height);
result.restoredDifference=difference(original,restored);result.orientationDifference=difference(original,mirror);
result.timeDifference=difference(original,draw(p,1,43));result.pointerDifference=difference(original,draw(p,1,40,1,[.72,.6]));result.pulseDifference=difference(original,draw(p,1,40,0,[.5,.5],1));
check(result.reflectedError<0.1,'Reflection is not a spatial mirror');check(result.restoredDifference===0,'Double reflection changes the scene');
check(result.orientationDifference>1,'Opposite orientations became interchangeable');check(result.timeDifference>1,'Clock stopped');
check(result.pointerDifference>0.1,'Pointer does not bend the field');check(result.pulseDifference>0.1,'Pulse does not disturb the field');check(result.coverage>.08&&result.coverage<.75,'Field coverage collapsed or lost negative space');
result.structureDifference=difference(draw(p,1,40,0,[.5,.5],8,0),draw(p,1,40,0,[.5,.5],8,1));
check(result.structureDifference>1,'DNA is indistinguishable from Classic');
// Synchronous software-GPU samples include readback. Diagnostic only, not FPS.
const timings=[[],[]];for(let sample=0;sample<8;sample++)for(const structure of [0,1]){
const begin=performance.now();draw(p,1,40+sample*.03,0,[.5,.5],8,structure);
if(sample>1)timings[structure].push(performance.now()-begin);}
result.medianDrawMs=timings.map(values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)]);
gl.deleteProgram(p);const production=make(${JSON.stringify(fragment)});draw(production,1);result.productionCompiled=true;
} catch(error){result.failures.push(error.message);}
document.getElementById('chiral-report').textContent=JSON.stringify(result);
</script></body></html>`;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (!["/", "/scene"].includes(url.pathname)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  const light = url.searchParams.get("light") === "1";
  const dna = url.searchParams.get("dna") === "1";
  if (url.pathname === "/scene") { response.end(fixture(light, dna)); return; }
  // Headless Chromium can impose a minimum outer window size. An exact iframe
  // viewport avoids mislabelling a 500px render as a 390px mobile check.
  const mobile = url.searchParams.get("width") === "390";
  response.end(`<!doctype html><html><body style="margin:0;overflow:hidden;background:${light ? "#fff8f7" : "#080809"}">
  <pre id="chiral-report" style="display:none">RUNNING</pre>
  <iframe title="Chiral geometry fixture" style="display:block;border:0;width:${mobile ? 390 : 1440}px;height:${mobile ? 844 : 900}px"
  src="/scene?light=${light ? 1 : 0}&dna=${dna ? 1 : 0}" onload="document.getElementById('chiral-report').textContent=this.contentDocument.getElementById('chiral-report').textContent"></iframe>
  </body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const browserPath = findBrowser();
  assert(browserPath, "A Chromium browser is required");
  const reports = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const [light, dna] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const screenshotPath = path.join(output, `chiral-${dna ? "dna-" : ""}${viewport.width}-${light ? "light" : "dark"}.png`);
      const dom = await runBrowserCapture({ browserPath, url: `http://127.0.0.1:${server.address().port}/?light=${light}&width=${viewport.width}&dna=${dna}`,
        screenshotPath, profilePrefix: "chiral-weave-", viewport, allowSoftware: true, virtualTimeBudgetMs: 2000 });
      const match = dom.match(/<pre id="chiral-report"[^>]*>([^<]+)<\/pre>/);
      assert(match && match[1] !== "RUNNING", "Shader verification did not finish");
      const report = JSON.parse(match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
      assert.deepEqual(report.dimensions, [Math.ceil(viewport.width / 2), Math.ceil(viewport.height / 2)], "Incorrect shader viewport");
      reports.push(report);
      fs.rmSync(screenshotPath.replace(/\.png$/, ".html"), { force: true });
    }
  }
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
  assert(reports.every(report => report.failures.length === 0), "Chiral Weave GPU regression");
} finally { server.close(); }
