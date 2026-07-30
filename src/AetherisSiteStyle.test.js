import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("shared Aetheris site styling", () => {
  const css = readRepositoryFile("src/aetheris-site.css");
  const normalizedCss = css.toLowerCase();
  const indexSource = readRepositoryFile("src/index.js");
  const indexHtml = readRepositoryFile("public/index.html");
  const routeGenerator = readRepositoryFile("scripts/generate-route-html.mjs");
  const themeContext = readRepositoryFile("src/contexts/ThemeContext.js");
  const parallaxSource = readRepositoryFile(
    "src/components/ParallaxBackground.js",
  );
  const standaloneSource = readRepositoryFile(
    "src/components/StandaloneExperiencePage.js",
  );

  test("loads the shared layer after the legacy global stylesheet", () => {
    const legacyImport = indexSource.indexOf("import './index.css';");
    const aetherisImport = indexSource.indexOf(
      "import './aetheris-site.css';",
    );

    expect(legacyImport).toBeGreaterThanOrEqual(0);
    expect(aetherisImport).toBeGreaterThan(legacyImport);
  });

  test("defines the complete spectral, glass, type, and focus contract", () => {
    [
      "--aetheris-spectral:",
      "--aetheris-spectral-h:",
      "--aetheris-spectral-v:",
      "--aetheris-spectral-border-soft:",
      "--aetheris-glass-specular:",
      "--aetheris-focus-halo:",
      '"Hanken Grotesk"',
      '"JetBrains Mono"',
    ].forEach((invariant) => expect(css).toContain(invariant));
  });

  test("covers shared interface chrome and content surfaces", () => {
    [
      ".nav-pill",
      ".section-dot",
      ".bio-card",
      ".service-card",
      ".contact-form",
      ".standalone-experience__header",
      ".orb-pill",
      "#popcorn-game",
      "[data-a11y-card-trigger]",
      "[data-a11y-dialog]",
    ].forEach((selector) => expect(css).toContain(selector));
  });

  test("does not reintroduce the standalone legacy purple treatment", () => {
    [
      "#6344f5",
      "#9c55ff",
      "rgba(99, 68, 245",
      "rgb(173, 118, 215)",
      "#b989dd",
    ].forEach((legacyValue) =>
      expect(normalizedCss).not.toContain(legacyValue),
    );

    expect(normalizedCss).not.toMatch(/background-clip:\s*text/);
  });

  test("never overrides the authored scene or low-capability visuals", () => {
    expect(parallaxSource).toContain(
      "<DitherBackground activeSection={activeSection} isDark={isDark} />",
    );
    expect(standaloneSource).toContain("<DitherBackground");

    [
      ".fixed-background",
      ".glass-gradient",
      ".standalone-experience__background",
      ".standalone-experience__fallback",
      ".standalone-experience__glass",
      '#orb > div[style*="55vw"]',
      "--bg-page:",
      "--experience-page-bg:",
    ].forEach((forbiddenSelector) =>
      expect(css).not.toContain(forbiddenSelector),
    );

    expect(css).not.toMatch(/\bcanvas\s*(?:,|\{)/);
    expect(css).not.toMatch(/(^|})\s*body\s*\{[^}]*background\s*:/m);
  });

  test("keeps accessibility and theme parity structural", () => {
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("mask-composite: exclude");
    expect(themeContext).toContain("'#080809' : '#fff8f7'");
  });

  test("loads the Technical-Humanist pair on generated shared routes", () => {
    [indexHtml, routeGenerator].forEach((source) => {
      expect(source).toContain("Hanken+Grotesk");
      expect(source).toContain("JetBrains+Mono");
    });

    expect(routeGenerator).toContain(
      "const ENGINEERING_FONTS_HREF = IMMERSIVE_FONTS_HREF;",
    );
    expect(routeGenerator).toContain("const WORK_FONTS_HREF =");
  });
});
