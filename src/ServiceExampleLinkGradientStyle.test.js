import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("service example link gradient styling", () => {
  const css = readRepositoryFile("src/service-example-link-gradient.css");
  const cssWithoutComments = stripCssComments(css);
  const indexSource = readRepositoryFile("src/index.js");
  const servicesSource = readRepositoryFile("src/components/ServicesSection.js");

  test("loads after the service dialog layer correction", () => {
    const layerFixImport = indexSource.indexOf(
      "import './service-dialog-layer-fix.css';",
    );
    const exampleLinkImport = indexSource.indexOf(
      "import './service-example-link-gradient.css';",
    );

    expect(layerFixImport).toBeGreaterThanOrEqual(0);
    expect(exampleLinkImport).toBeGreaterThan(layerFixImport);
  });

  test("scopes the treatment to external links in expanded service dialogs", () => {
    expect(servicesSource).toContain('target="_blank"');
    expect(servicesSource).toContain('aria-hidden="true"');
    expect(cssWithoutComments).toContain(
      '[data-a11y-dialog]:has(> .MuiBox-root[aria-hidden="true"])',
    );
    expect(cssWithoutComments).toContain('a[target="_blank"]');
  });

  test("keeps the fill clear while preserving spectral border text and icon", () => {
    expect(cssWithoutComments).toContain("border: 1px solid transparent !important;");
    expect(cssWithoutComments).toContain("background-color: transparent !important;");
    expect(cssWithoutComments).toContain(
      "background-image: var(--aetheris-spectral-h) !important;",
    );
    expect(cssWithoutComments).toContain("background-clip: text !important;");
    expect(cssWithoutComments).toContain(
      "-webkit-background-clip: text !important;",
    );
    expect(cssWithoutComments).not.toContain("var(--aetheris-glass-panel)");
    expect(cssWithoutComments).not.toContain("var(--aetheris-glass-panel-raised)");

    expect(cssWithoutComments).toContain('a[target="_blank"]::before');
    expect(cssWithoutComments).toContain("padding: 1px;");
    expect(cssWithoutComments).toContain("mask-composite: exclude;");
    expect(cssWithoutComments).toContain("var(--aetheris-spectral)");

    expect(cssWithoutComments).toContain('a[target="_blank"] > svg');
    expect(cssWithoutComments).toContain("display: none !important;");
    expect(cssWithoutComments).toContain('a[target="_blank"]::after');
    expect(cssWithoutComments).toContain("-webkit-mask:");
    expect(cssWithoutComments).toContain("mask:");
  });

  test("keeps the icon gradient static on hover", () => {
    expect(cssWithoutComments).toContain('a[target="_blank"]:hover::before');
    expect(cssWithoutComments).not.toContain('a[target="_blank"]:hover::after');
  });

  test("preserves focus forced-colors and reduced-motion behavior", () => {
    expect(cssWithoutComments).toContain(":focus-visible");
    expect(cssWithoutComments).toContain("var(--aetheris-focus-halo)");
    expect(cssWithoutComments).toContain("@media (forced-colors: active)");
    expect(cssWithoutComments).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("does not restyle compact cards or authored scenes", () => {
    [
      ".service-card",
      ".bio-card",
      ".fixed-background",
      "canvas",
    ].forEach((selector) => expect(cssWithoutComments).not.toContain(selector));
  });
});
