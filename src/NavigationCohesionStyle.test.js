import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("cohesive site navigation styling", () => {
  const css = readRepositoryFile("src/navigation-cohesion.css");
  const indexSource = readRepositoryFile("src/index.js");

  test("loads after the shared Aetheris layer", () => {
    const sharedImport = indexSource.indexOf("import './aetheris-site.css';");
    const navigationImport = indexSource.indexOf(
      "import './navigation-cohesion.css';",
    );

    expect(sharedImport).toBeGreaterThanOrEqual(0);
    expect(navigationImport).toBeGreaterThan(sharedImport);
  });

  test("uses only the dot for active navigation state", () => {
    expect(css).toContain(".nav-link--active::before");
    expect(css).toContain("opacity: 0 !important;");
    expect(css).toContain(".nav-link--active:hover::before");
    expect(css).toContain("opacity: 1 !important;");
    expect(css).toContain(".nav-overlay-link--active::after");
    expect(css).toContain("background: var(--aetheris-spectral);");
  });

  test("integrates both theme controls into their navigation clusters", () => {
    expect(css).toContain(
      ".nav-theme-toggle:not(.nav-overlay-theme)",
    );
    expect(css).toContain("background: transparent !important;");
    expect(css).toContain(".work-page .work-page__theme");
    expect(css).toContain(".work-page__theme > span:last-child");
    expect(css).toContain("display: none;");
  });

  test("maps the work header onto the immersive floating pill", () => {
    expect(css).toContain(".work-page .work-page__header-shell");
    expect(css).toContain("width: max-content;");
    expect(css).toContain("border-radius: var(--radius-pill) !important;");
    expect(css).toContain("mask-composite: exclude;");
    expect(css).toContain(".work-page .work-page__nav > a::before");
  });

  test("does not style authored visual scenes", () => {
    [
      ".fixed-background",
      ".glass-gradient",
      ".standalone-experience__background",
      ".standalone-experience__fallback",
    ].forEach((selector) => expect(css).not.toContain(selector));

    expect(css).not.toMatch(/\bcanvas\s*(?:,|\{)/);
  });
});
