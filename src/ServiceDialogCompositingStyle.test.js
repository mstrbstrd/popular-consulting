import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("expanded service dialog compositing", () => {
  const css = readRepositoryFile("src/service-dialog-compositing.css");
  const cssWithoutComments = stripCssComments(css);
  const aetherisCss = readRepositoryFile("src/aetheris-site.css");
  const indexSource = readRepositoryFile("src/index.js");
  const servicesSource = readRepositoryFile("src/components/ServicesSection.js");

  test("loads immediately after the shared Aetheris layer", () => {
    const aetherisImport = indexSource.indexOf(
      "import './aetheris-site.css';",
    );
    const compositingImport = indexSource.indexOf(
      "import './service-dialog-compositing.css';",
    );

    expect(aetherisImport).toBeGreaterThanOrEqual(0);
    expect(compositingImport).toBeGreaterThan(aetherisImport);
  });

  test("recognizes the static glass and transformed content layers", () => {
    const glassLayer = servicesSource.indexOf('aria-hidden="true"');
    const transformedSurface = servicesSource.indexOf(
      "ref={surfaceRef}",
      glassLayer,
    );

    expect(glassLayer).toBeGreaterThanOrEqual(0);
    expect(transformedSurface).toBeGreaterThan(glassLayer);
    expect(aetherisCss).toContain(
      "html body [data-a11y-dialog] > .MuiBox-root",
    );
    expect(cssWithoutComments).toContain(
      '[data-a11y-dialog]:has(> .MuiBox-root[aria-hidden="true"])',
    );
  });

  test("keeps border paint on the static layer only", () => {
    expect(cssWithoutComments).toContain(
      '> .MuiBox-root[aria-hidden="true"]',
    );
    expect(cssWithoutComments).toContain(
      "border: 1px solid transparent !important;",
    );
    expect(cssWithoutComments).toContain(
      '> .MuiBox-root:not([aria-hidden="true"])',
    );
    expect(cssWithoutComments).toContain("border: 0 !important;");
    expect(cssWithoutComments).toContain("background: transparent !important;");
    expect(cssWithoutComments).toContain("backdrop-filter: none !important;");
    expect(cssWithoutComments).toContain(
      "-webkit-backdrop-filter: none !important;",
    );
    expect(cssWithoutComments).toContain("box-shadow: none !important;");
    expect(cssWithoutComments).toContain("content: none !important;");
  });

  test("does not alter compact cards or authored scenes", () => {
    [
      ".service-card",
      ".bio-card",
      ".fixed-background",
      "canvas",
    ].forEach((selector) =>
      expect(cssWithoutComments).not.toContain(selector),
    );
  });
});
