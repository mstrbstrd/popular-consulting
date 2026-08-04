import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("expanded service dialog layer framing", () => {
  const css = readRepositoryFile("src/service-dialog-layer-fix.css");
  const cssWithoutComments = stripCssComments(css);
  const aetherisCss = readRepositoryFile("src/aetheris-site.css");
  const indexSource = readRepositoryFile("src/index.js");
  const servicesSource = readRepositoryFile("src/components/ServicesSection.js");

  test("loads immediately after the shared Aetheris layer", () => {
    const aetherisImport = indexSource.indexOf(
      "import './aetheris-site.css';",
    );
    const layerFixImport = indexSource.indexOf(
      "import './service-dialog-layer-fix.css';",
    );

    expect(aetherisImport).toBeGreaterThanOrEqual(0);
    expect(layerFixImport).toBeGreaterThan(aetherisImport);
    expect(indexSource).not.toContain("service-dialog-focus-fix.css");
    expect(indexSource).not.toContain("service-dialog-ring-fix.css");
  });

  test("recognizes the static glass layer before the tilted surface", () => {
    const staticLayer = servicesSource.indexOf('aria-hidden="true"');
    const interactiveLayer = servicesSource.indexOf(
      "ref={surfaceRef}",
      staticLayer,
    );

    expect(staticLayer).toBeGreaterThanOrEqual(0);
    expect(interactiveLayer).toBeGreaterThan(staticLayer);
    expect(aetherisCss).toContain(
      "html body [data-a11y-dialog] > .MuiBox-root",
    );
    expect(aetherisCss).toContain(
      "html body [data-a11y-dialog] > .MuiBox-root::after",
    );
  });

  test("removes duplicate edge paint from the static layer only", () => {
    expect(cssWithoutComments).toContain(
      '> .MuiBox-root[aria-hidden="true"]',
    );
    expect(cssWithoutComments).toContain("border: 0 !important;");
    expect(cssWithoutComments).toContain("box-shadow: none !important;");
    expect(cssWithoutComments).toContain(
      '> .MuiBox-root[aria-hidden="true"]::after',
    );
    expect(cssWithoutComments).toContain("content: none !important;");

    [
      "background:",
      "backdrop-filter:",
      "-webkit-backdrop-filter:",
      ".MuiBox-root:not(",
      "+ .MuiBox-root",
      ".service-card",
      ".bio-card",
      ".fixed-background",
      "canvas",
    ].forEach((forbiddenRule) =>
      expect(cssWithoutComments).not.toContain(forbiddenRule),
    );
  });
});
