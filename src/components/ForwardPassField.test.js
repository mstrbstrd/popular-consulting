const fs = require("fs");
const path = require("path");
const {
  CREATOROS_FIELD_FRAGMENT_SHADER,
} = require("./CreatorOSFieldShader");

describe("Forward Pass field", () => {
  const start = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sceneForwardPass",
  );
  const end = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sampleScene",
    start,
  );
  const scene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(start, end);

  test("maps the decoder-only transformer stages into one continuous field", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(scene).toContain("float causalLookback");
    expect(scene).toContain("float attentionMix");
    expect(scene).toContain("float hiddenExpansion");
    expect(scene).toContain("float swigluGate");
    expect(scene).toContain("float projectionFunnel");
    expect(scene).toContain("float residualBypass");
    expect(scene).toContain("float promptFront");
  });

  test("keeps the new field inside the existing renderer and performance budget", () => {
    const canvas = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.js"),
      "utf8",
    );
    const page = fs.readFileSync(
      path.join(__dirname, "DitherCanvasPage.js"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(__dirname, "CreatorOSFieldCanvas.css"),
      "utf8",
    );

    expect(canvas).toContain("const MODE_COUNT = 8");
    expect(page).toContain('id: "forward-pass"');
    expect(page).toContain("mode: 7");
    expect(css).toContain(".creatoros-field-mode-7");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "if (u_modeA != u_modeB && u_modeMix > 0.001)",
    );
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain(
      "return sceneForwardPass(uv, time)",
    );
  });
});
