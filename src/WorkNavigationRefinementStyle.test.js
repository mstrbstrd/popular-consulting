import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("work navigation refinement", () => {
  const css = readRepositoryFile("src/work-navigation-refinement.css");
  const cssWithoutComments = stripCssComments(css);
  const indexSource = readRepositoryFile("src/index.js");

  test("loads after the work responsive invariants", () => {
    const responsiveImport = indexSource.indexOf(
      "import './work-responsive.css';",
    );
    const refinementImport = indexSource.indexOf(
      "import './work-navigation-refinement.css';",
    );

    expect(responsiveImport).toBeGreaterThanOrEqual(0);
    expect(refinementImport).toBeGreaterThan(responsiveImport);
  });

  test("reuses the index navigation design primitives", () => {
    expect(css).toContain("var(--aetheris-glass-surface)");
    expect(css).toContain("var(--aetheris-glass-blur-chrome)");
    expect(css).toContain("var(--aetheris-font-mono)");
    expect(css).toContain("var(--aetheris-spectral-v)");
    expect(css).toContain("var(--aetheris-focus-halo)");
  });

  test("matches the compact overlay and close-icon behavior", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("min-height: 100dvh;");
    expect(css).toContain("font-size: clamp(2.2rem, 8vw, 3.6rem);");
    expect(css).toContain(":has(.work-page__menu)");
    expect(css).toContain("overflow: hidden !important;");
    expect(css).toContain("translateY(6.5px) rotate(45deg)");
    expect(css).toContain("translateY(-6.5px) rotate(-45deg)");
  });

  test("does not take ownership of work visuals or content layout", () => {
    [
      ".work-page__ambient",
      ".work-page__backdrop",
      ".work-page__hero",
      ".work-project",
      ".work-capability",
      "canvas",
    ].forEach((selector) =>
      expect(cssWithoutComments).not.toContain(selector),
    );
  });
});
