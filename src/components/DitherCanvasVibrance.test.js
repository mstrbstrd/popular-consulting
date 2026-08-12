const fs = require("fs");
const path = require("path");

describe("DitherCanvasVibrance", () => {
  test("boosts both themes through the existing glass pass", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "DitherCanvasVibrance.css"),
      "utf8",
    );
    const page = fs.readFileSync(
      path.join(__dirname, "DitherCanvasPage.js"),
      "utf8",
    );

    expect(page).toContain('import "./DitherCanvasVibrance.css";');
    expect(css).toContain(
      "--dither-glass-filter: blur(0.2rem) saturate(138%) contrast(106%);",
    );
    expect(css).toContain(
      "--dither-glass-filter: blur(0.2rem) saturate(152%) contrast(110%) brightness(104%);",
    );
    expect(css).toContain("backdrop-filter: var(--dither-glass-filter);");
    expect(css).toContain("-webkit-backdrop-filter: var(--dither-glass-filter);");
  });

  test("does not add another animated canvas pass", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "DitherCanvasVibrance.css"),
      "utf8",
    );

    expect(css).not.toContain(".rupture-canvas {");
    expect(css).not.toContain(".spectral-dither-canvas {");
    expect(css).not.toContain("@keyframes");
    expect(css).not.toContain("mix-blend-mode");
  });
});
