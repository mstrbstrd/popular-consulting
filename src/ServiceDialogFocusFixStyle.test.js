import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("expanded service dialog focus fix", () => {
  const css = readRepositoryFile("src/service-dialog-focus-fix.css");
  const cssWithoutComments = stripCssComments(css);
  const indexSource = readRepositoryFile("src/index.js");
  const bridgeSource = readRepositoryFile(
    "src/components/InteractionAccessibilityBridge.js",
  );

  test("loads immediately after the shared Aetheris layer", () => {
    const aetherisImport = indexSource.indexOf(
      "import './aetheris-site.css';",
    );
    const focusFixImport = indexSource.indexOf(
      "import './service-dialog-focus-fix.css';",
    );

    expect(aetherisImport).toBeGreaterThanOrEqual(0);
    expect(focusFixImport).toBeGreaterThan(aetherisImport);
    expect(indexSource).not.toContain("service-dialog-ring-fix.css");
  });

  test("neutralizes only the structural dialog wrapper focus paint", () => {
    expect(bridgeSource).toContain("focusWithoutScroll(dialog);");
    expect(bridgeSource).toContain(
      "focusCloseWhenReady(dialog, closeControl);",
    );
    expect(cssWithoutComments).toContain(
      '[data-a11y-dialog][role="dialog"]:focus',
    );
    expect(cssWithoutComments).toContain(
      '[data-a11y-dialog][role="dialog"]:focus-visible',
    );
    expect(cssWithoutComments).toContain("outline: none !important;");
    expect(cssWithoutComments).toContain("outline-offset: 0 !important;");
    expect(cssWithoutComments).toContain("box-shadow: none !important;");
  });

  test("does not alter the card surface or authored scene", () => {
    [
      ".MuiBox-root",
      ".service-card",
      ".bio-card",
      "::before",
      "::after",
      "border:",
      "background:",
      "backdrop-filter:",
      ".fixed-background",
      "canvas",
    ].forEach((forbiddenRule) =>
      expect(cssWithoutComments).not.toContain(forbiddenRule),
    );
  });
});
