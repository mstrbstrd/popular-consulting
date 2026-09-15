import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { findBrowser, runBrowserCapture } from "./dark-evidence-browser.mjs";

// Isolated DOM/CSS regression, not a GPU performance or live-shader test.
// Download the actual production font faces; fallback fonts must not masquerade
// as a passing Syne regression. No new browser dependency or production code.
const read = (file) => fs.readFileSync(path.resolve(file), "utf8");
const pageSource = read("src/components/DitherCanvasPage.js");
const generator = read("scripts/generate-route-html.mjs");
const source = pageSource.slice(pageSource.indexOf("const STUDIES = ["), pageSource.indexOf("const ORIGINAL_SECOND_SURFACE"));
const studies = [...source.matchAll(/\{\s*id: "([\w-]+)",([\s\S]*?)\n\s*\},/g)].map((match) => ({
  id: match[1],
  ...Object.fromEntries(["title", "number", "description", "instruction"].map((key) => {
    const value = match[2].match(new RegExp(`${key}:\\s*"([^"\\n]+)"`));
    assert(value, `Missing ${key} for ${match[1]}`);
    return [key, value[1]];
  })),
}));
assert.equal(studies.length, 12);
const marker = "/* Field-lab readability refinements.";
const vibrance = read("src/components/DitherCanvasVibrance.css");
assert(vibrance.includes(marker));
const refinements = vibrance.slice(vibrance.indexOf(marker));
const styles = [read("src/index.css"), ...[...pageSource.matchAll(/import "\.\/([^"\n]+\.css)";/g)].map((match) => {
  const css = read(`src/components/${match[1]}`);
  return css.includes(marker) ? css.slice(0, css.indexOf(marker)) : css;
}), read("public/dither-typography.css")].join("\n");

const fontCache = new Map();
let fontStyles = "";
for (const token of ["IMMERSIVE_FONTS_HREF", "DITHER_FONTS_HREF"]) {
  const href = generator.match(new RegExp(`const ${token}\\s*=\\s*"([^"]+)"`))[1];
  assert.equal(new URL(href).hostname, "fonts.googleapis.com");
  const response = await fetch(href, {
    headers: { "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36" },
    signal: AbortSignal.timeout(30000),
  });
  assert(response.ok, `Font stylesheet failed: ${response.status}`);
  const css = await response.text();
  const latin = css.match(/\/\* latin \*\/\s*@font-face\s*\{[^}]+\}/g);
  assert(latin?.length, `Latin font subset missing from ${token}`);
  for (let face of latin) {
    for (const match of face.matchAll(/url\((https:[^)]+)\)/g)) {
      const url = match[1];
      assert.equal(new URL(url).hostname, "fonts.gstatic.com");
      if (!fontCache.has(url)) {
        assert(fontCache.size < 30, "Unexpected font download count");
        const fontResponse = await fetch(url, { signal: AbortSignal.timeout(30000) });
        assert(fontResponse.ok, `Font download failed: ${fontResponse.status}`);
        const bytes = Buffer.from(await fontResponse.arrayBuffer());
        assert(bytes.length > 0 && bytes.length < 500000, "Unexpected font size");
        fontCache.set(url, `data:font/woff2;base64,${bytes.toString("base64")}`);
      }
      face = face.replace(url, fontCache.get(url));
    }
    fontStyles += face;
  }
}

const viewports = [[320,568], [360,640], [390,844], [430,932], [600,900], [601,375], [700,900], [701,760], [768,1024], [820,1180], [844,390], [1024,500], [1080,760], [1081,760], [1280,800], [1440,900], [1920,1080]];
const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>${fontStyles}\n${styles}</style><style id="refinements">${refinements}</style><style>html{font-size:10px}body{margin:0}.dither-fixed-stage{background:linear-gradient(120deg,#080809,#8b7659,#0aa3ad,#ff56d6,#fff8f7)}</style></head><body><main class="dither-canvas-page dither-study-metabloom" data-theme-mode="light"><div class="dither-fixed-stage"><section class="rupture-copy dither-copy is-idle"><p class="rupture-eyebrow"></p><h1 id="rupture-title"></h1><p class="rupture-description"></p><p class="rupture-instruction"></p></section></div></main></body></html>`;
const html = `<!doctype html><html><body><pre id="readability-report">RUNNING</pre><iframe id="fixture" style="border:0;width:1440px;height:900px"></iframe><script>
(async () => {
  const result = { cases: 0, metabloomCases: 0, minimumContrast: 100, failures: [], fontFiles: ${fontCache.size} };
  const check = (condition, message) => { if (!condition) result.failures.push(message); };
  try {
    const frame = document.getElementById('fixture');
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.srcdoc = ${JSON.stringify(fixture).replaceAll("<", "\\u003c")};
    await loaded;
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    const main = doc.querySelector('main');
    const title = doc.querySelector('h1');
    const copy = doc.querySelector('.rupture-copy');
    const description = doc.querySelector('.rupture-description');
    const eyebrow = doc.querySelector('.rupture-eyebrow');
    const instruction = doc.querySelector('.rupture-instruction');
    const sheet = doc.getElementById('refinements').sheet;
    const studies = ${JSON.stringify(studies).replaceAll("<", "\\u003c")};
    const setStudy = (study, mode) => {
      main.className = 'dither-canvas-page dither-study-' + study.id;
      main.dataset.themeMode = mode;
      doc.documentElement.dataset.theme = mode;
      title.textContent = study.title;
      eyebrow.textContent = 'Spectral Display · Study ' + study.number;
      description.textContent = study.description;
      instruction.textContent = study.instruction;
    };
    for (const study of studies) {
      setStudy(study, 'light');
      for (const element of [title, description, eyebrow, instruction]) {
        const style = win.getComputedStyle(element);
        const faces = await doc.fonts.load(style.fontStyle + ' ' + style.fontWeight + ' 48px ' + style.fontFamily, element.textContent);
        if (!faces.length) throw new Error('Actual webfont missing: ' + style.fontFamily);
      }
    }
    const syne = await doc.fonts.load('800 48px Syne', 'metabloom');
    check(syne.some(face => face.family.replaceAll('"', '') === 'Syne' && face.status === 'loaded'), 'Syne 800 was not loaded');
    const range = doc.createRange();
    const measure = () => {
      range.selectNodeContents(title);
      return { lines: range.getClientRects().length, text: range.getBoundingClientRect(), box: title.getBoundingClientRect() };
    };
    setStudy(studies.find(study => study.id === 'metabloom'), 'light');
    sheet.disabled = true;
    const before = measure();
    result.originalMetabloom = { lines: before.lines, textWidth: before.text.width, columnWidth: before.box.width };
    sheet.disabled = false;
    const rgb = color => (color.match(/[\\d.]+/g) || []).map(Number);
    const luminance = color => color.slice(0,3).map(value => {
      value /= 255;
      return value <= 0.04045 ? value/12.92 : ((value+0.055)/1.055)**2.4;
    }).reduce((sum,value,index) => sum + value*[0.2126,0.7152,0.0722][index],0);
    for (const [width,height] of ${JSON.stringify(viewports)}) {
      frame.style.width = width + 'px';
      frame.style.height = height + 'px';
      for (const root of [8.8,10,20]) {
        doc.documentElement.style.fontSize = root + 'px';
        for (const mode of ['light','dark']) for (const study of studies) {
          setStudy(study,mode);
          const label = [study.id,mode,width,height,root].join('/');
          sheet.disabled = true;
          const previous = win.getComputedStyle(title);
          const baselineTitle = [previous.fontFamily, previous.fontSize, previous.fontWeight, previous.letterSpacing].join('|');
          const baselineCopy = [description,eyebrow,instruction].map(element => {
            const style = win.getComputedStyle(element);
            return [style.color,style.fontWeight].join('|');
          });
          sheet.disabled = false;
          if (study.id === 'metabloom') {
            const measured = measure();
            check(measured.lines === 1, label + ': title split');
            check(measured.text.right <= measured.box.right + 1, label + ': title overflow');
            check(measured.box.right <= width + 1, label + ': outside viewport');
            check(title.scrollWidth <= title.clientWidth + 1, label + ': scroll overflow');
            result.metabloomCases++;
          } else {
            const style = win.getComputedStyle(title);
            check([style.fontFamily,style.fontSize,style.fontWeight,style.letterSpacing].join('|') === baselineTitle, label + ': unrelated heading changed');
          }
          [description,eyebrow,instruction].forEach((element,index) => {
            const style = win.getComputedStyle(element);
            const surface = win.getComputedStyle(copy,'::before');
            if (mode === 'light') {
              const wash = rgb(surface.backgroundColor);
              const foreground = rgb(style.color);
              const darkest = wash.slice(0,3).map(channel => channel*(wash[3] ?? 1));
              const contrast = (luminance(darkest)+0.05)/(luminance(foreground)+0.05);
              result.minimumContrast = Math.min(result.minimumContrast,contrast);
              check(contrast >= 4.5 && (foreground[3] ?? 1) === 1, label + ': insufficient copy contrast');
              check(surface.pointerEvents === 'none', label + ': wash intercepts input');
            } else {
              check([style.color,style.fontWeight].join('|') === baselineCopy[index], label + ': dark copy changed');
              check(surface.content === 'none' || surface.content === 'normal', label + ': light wash leaked into dark mode');
            }
          });
          result.cases++;
        }
      }
    }
    // Leave a representative real-font frame for the screenshot artifact.
    frame.style.width='1440px'; frame.style.height='900px'; doc.documentElement.style.fontSize='10px';
    setStudy(studies.find(study => study.id === 'metabloom'),'light');
    const after=measure(); result.fixedMetabloom={lines:after.lines,textWidth:after.text.width,columnWidth:after.box.width};
  } catch (error) { result.failures.push(error.message); }
  document.getElementById('readability-report').textContent=JSON.stringify(result);
})();
</script></body></html>`;

const output = path.resolve("dither-readability-evidence");
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  if (request.url !== "/") { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  response.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const browserPath = findBrowser();
  assert(browserPath, "A Chromium browser is required");
  const dom = await runBrowserCapture({
    browserPath,
    url: `http://127.0.0.1:${server.address().port}/`,
    screenshotPath: path.join(output, "metabloom-light.png"),
    profilePrefix: "dither-readability-",
    viewport: { width: 1500, height: 1100 },
    allowSoftware: false,
    virtualTimeBudgetMs: 60000,
    commandTimeoutMs: 180000,
  });
  const match = dom.match(/<pre id="readability-report">([^<]+)<\/pre>/);
  assert(match && match[1] !== "RUNNING", "Browser did not finish the readability checks");
  const result = JSON.parse(match[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.equal(result.failures.length, 0, "Dither readability regression");
  assert.equal(result.cases, viewports.length * 3 * 2 * studies.length);
} finally {
  server.close();
  // The helper's DOM contains temporary embedded font data. Keep only the
  // screenshot and numerical report as evidence, never distribute font files.
  fs.rmSync(path.join(output, "metabloom-light.html"), { force: true });
}
