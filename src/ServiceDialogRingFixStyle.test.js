import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("expanded service dialog ring fix", () => {
  const css = readRepositoryFile("src/service-dialog-ring-fix.css");
  const cssWithoutComments = stripCssComments(css);
  const aetherisCss = readRepositoryFile("src/aetheris-site.css");
  const indexSource = readRepositoryFile("src/index.js");
  const servicesSource = readRepositoryFile("src/components/ServicesSection.js");

  test("loads immediately after the shared Aetheris layer", () => {
    const aetherisImport = indexSource.indexOf(
      "import './aetheris-site.css';",
    );
    const fixImport = indexSource.indexOf(
      "import './service-dialog-ring-fix.css';",
    );

    expect(aetherisImport).toBeGreaterThanOrEqual(0);
    expect(fixImport).toBeGreaterThan(aetherisImport);
  });

  test("targets the transformed sibling after the static glass layer", () => {
    const staticLayer = servicesSource.indexOf('aria-hidden="true"');
    const transformedLayer = servicesSource.indexOf(
      "ref={surfaceRef}",
      staticLayer,
    );

    expect(staticLayer).toBeGreaterThanOrEqual(0);
    expect(transformedLayer).toBeGreaterThan(staticLayer);
    expect(aetherisCss).toContain(
      "html body [data-a11y-dialog] > .MuiBox-root::after",
    );
    expect(cssWithoutComments).toMatch(
      /\[data-a11y-dialog\]\s*>\s*\.MuiBox-root\[aria-hidden="true"\]\s*\+\s*\.MuiBox-root::after\s*\{[^}]*content:\s*none\s*!important;/,
    );
  });

  test("removes only the duplicate ring", () => {
    [
      "border:",
      "background:",
      "backdrop-filter:",
      "box-shadow:",
      "::before",
      ".service-card",
      ".bio-card",
      ".fixed-background",
      "canvas",
    ].forEach((forbiddenRule) =>
      expect(cssWithoutComments).not.toContain(forbiddenRule),
    );

    expect(cssWithoutComments).not.toMatch(
      /\.MuiBox-root\[aria-hidden="true"\]::after/,
    );
  });
});
