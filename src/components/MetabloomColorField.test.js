const fs = require("fs");
const path = require("path");

describe("Metabloom color field", () => {
  const shader = fs.readFileSync(
    path.join(__dirname, "CreatorOSFieldShader.js"),
    "utf8",
  );
  const sceneStart = shader.indexOf("vec4 sceneMetabloom");
  const sceneEnd = shader.indexOf("vec4 sceneTidalWeave");
  const metabloom = shader.slice(sceneStart, sceneEnd);

  test("uses a branch-free organic hue field", () => {
    expect(sceneStart).toBeGreaterThanOrEqual(0);
    expect(sceneEnd).toBeGreaterThan(sceneStart);
    expect(metabloom).not.toContain("atan(p.y, p.x)");
    expect(metabloom).toContain("float colorFlow = fbm(");
    expect(metabloom).toContain("float secondaryFlow = fbm(");
    expect(metabloom).toContain("p.x * 0.080");
    expect(metabloom).toContain("p.y * 0.135");
  });

  test("feathers body colours through the continuous flow", () => {
    expect(metabloom).toContain("vec3 flowTint = spectral(baseHue)");
    expect(metabloom).toContain(
      "float flowDominance = 0.76 + membrane * 0.10",
    );
    expect(metabloom).toContain(
      "tint = mix(tint, flowTint, sat(flowDominance))",
    );
  });
});
