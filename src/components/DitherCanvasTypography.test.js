import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const css = readRepositoryFile("public/dither-typography.css");
const routeGenerator = readRepositoryFile("scripts/generate-route-html.mjs");
const pageSource = readRepositoryFile("src/components/DitherCanvasPage.js");
const studiesSource = pageSource.slice(
  pageSource.indexOf("const STUDIES = ["),
  pageSource.indexOf("const ORIGINAL_SECOND_SURFACE"),
);
const studyIds = Array.from(studiesSource.matchAll(/\bid: "([^"]+)"/g),
  (match) => match[1]);
const profiles = Array.from(css.matchAll(
  /\.dither-canvas-page\.dither-study-([\w-]+)\s*\{([^}]+)\}/g,
));

describe("Dither field-lab typography", () => {
  test("covers every real study exactly once, without a generic catch-all theme", () => {
    expect(studyIds.length).toBeGreaterThan(0);
    expect(profiles.map((match) => match[1]).sort()).toEqual([...studyIds].sort());
    expect(new Set(profiles.map((match) => match[1])).size).toBe(studyIds.length);
  });

  test.each(profiles.map((match) => [match[1], match[2]]))("gives %s its own bounded desktop and mobile scales", (_id, block) => {
    expect(block).toMatch(/--study-title-size:\s*clamp\([\d.]+rem,\s*[\d.]+vw,\s*[\d.]+rem\)/);
    expect(block).toMatch(/--study-title-mobile:\s*clamp\([\d.]+rem,\s*[\d.]+vw,\s*[\d.]+rem\)/);
    expect(block).toMatch(/--study-title-weight:\s*\d+/);
    expect(block).toMatch(/--study-title-tracking:/);
    expect(block).toMatch(/--study-title-leading:/);
  });

  test("all studies have distinct scales at both responsive tiers", () => {
    for (const token of ["size", "mobile"]) {
      const scales = profiles.map((match) =>
        match[2].match(new RegExp(`--study-title-${token}:\\s*([^;]+)`))[1]);
      expect(new Set(scales).size).toBe(studyIds.length);
    }
  });

  test("preserves renderer, palette, motion, and control ownership", () => {
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/@(?:keyframes|import|font-face)\b/);
    expect(declarations).not.toMatch(/(?:^|[;{])\s*(?:animation(?:-[\w-]+)?|transition(?:-[\w-]+)?|transform|filter|backdrop-filter|background(?:-[\w-]+)?|color|position|z-index|pointer-events|touch-action|display|visibility)\s*:/);
    expect(declarations).not.toMatch(/!important|overflow\s*:\s*hidden/);
    expect(declarations).not.toMatch(/\.rupture-nav|\.dither-study-option|\.morphogen-paint-toolbar|\.dither-study-scene/);
    const selectors = declarations.match(/[^{}]+(?=\{)/g) || [];
    selectors.filter((selector) => !selector.trim().startsWith("@media"))
      .forEach((selector) => expect(selector.trim()).toMatch(/^\.dither-canvas-page(?:[\s.]|$)/));
  });

  test("keeps text readable on font failure, zoom, and short screens", () => {
    expect(css).toContain('"Cormorant Garamond", Georgia, serif');
    expect(css).toContain('"Fraunces", Georgia, serif');
    expect(css).toContain('"JetBrains Mono", monospace');
    expect(css).toContain("max-width: min(100%, var(--study-title-width))");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("text-wrap: balance");
    expect(css).toContain("font-size: var(--study-title-mobile,");
    expect(css).toContain("@media (max-height: 500px)");
  });
});

describe("Generated field-lab asset isolation", () => {
  let fixtureRoot;
  const routes = Object.keys(JSON.parse(readRepositoryFile("src/content/routeMetadata.json")));
  const readRoute = (directory = "") =>
    fs.readFileSync(path.join(fixtureRoot, "build", directory, "index.html"), "utf8");

  beforeAll(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dither-typography-"));
    for (const directory of ["scripts", "src/content", "build"]) {
      fs.mkdirSync(path.join(fixtureRoot, directory), { recursive: true });
    }
    fs.writeFileSync(path.join(fixtureRoot, "scripts/generate-route-html.mjs"), routeGenerator);
    const metadata = Object.fromEntries(routes.map((key) => [key, {
      title: `${key} title`,
      description: `${key} description`,
      robots: key === "ditherCanvas" ? "noindex, nofollow" : "index, follow",
      canonical: `https://example.test/${key}`,
      socialTitle: `${key} social title`,
      socialDescription: `${key} social description`,
      noscript: `${key} accessible fallback`,
    }]));
    fs.writeFileSync(path.join(fixtureRoot, "src/content/routeMetadata.json"), JSON.stringify(metadata));
    const shellFonts = routeGenerator.match(/const IMMERSIVE_FONTS_HREF\s*=\s*"([^"]+)"/)[1];
    const html = `<!doctype html><html><head><title>Fixture</title>
      <meta name="description" content="Fixture" />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href="https://example.test/" />
      <meta property="og:url" content="https://example.test/" />
      <meta property="og:title" content="Fixture" />
      <meta property="og:description" content="Fixture" />
      <meta name="twitter:title" content="Fixture" />
      <meta name="twitter:description" content="Fixture" />
      <link rel="stylesheet" href="${shellFonts}" />
      <link rel="stylesheet" href="/static/css/main.fixture.css" />
      </head><body><noscript>Fixture</noscript><div id="root"></div></body></html>`;
    fs.writeFileSync(path.join(fixtureRoot, "build/index.html"), html);
    execFileSync(process.execPath, [path.join(fixtureRoot, "scripts/generate-route-html.mjs")], {
      cwd: fixtureRoot,
      timeout: 10000,
      stdio: "pipe",
    });
  });

  afterAll(() => {
    if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  });

  test("loads display fonts and cache-busted typography once, after base CSS", () => {
    const html = readRoute("dither-canvas");
    expect(html.match(/dither-typography\.css/g)).toHaveLength(1);
    expect(html.match(/family=Cormorant\+Garamond/g)).toHaveLength(1);
    expect(html).toContain("/dither-typography.css?v=20260915a");
    expect(html).toContain("&amp;display=swap");
    expect(html).toContain("family=Poppins");
    expect(html).toContain('content="noindex, nofollow"');
    expect(html.indexOf("dither-typography.css")).toBeGreaterThan(html.indexOf("main.fixture.css"));
  });

  test.each(["", "engineering", "work", "orb", "game", "invoice-generator"])("does not load lab assets on /%s", (directory) => {
    const html = readRoute(directory);
    expect(html).not.toContain("dither-typography.css");
    expect(html).not.toContain("Cormorant+Garamond");
    expect(html).not.toContain("family=Fraunces");
    expect(html).not.toContain("family=Syne");
    expect(html).not.toContain("family=Space+Grotesk");
  });
});
