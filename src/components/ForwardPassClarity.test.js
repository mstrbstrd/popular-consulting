const {
  CREATOROS_FIELD_FRAGMENT_SHADER,
} = require("./CreatorOSFieldShader");

describe("Forward Pass visual hierarchy", () => {
  const start = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sceneForwardPass",
  );
  const end = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sampleScene",
    start,
  );
  const scene = CREATOROS_FIELD_FRAGMENT_SHADER.slice(start, end);

  test("exposes one coherent left-to-right computation front", () => {
    expect(scene).toContain("float passPhase");
    expect(scene).toContain("float passX");
    expect(scene).toContain("float passFront");
    expect(scene).toContain("float passWake");
    expect(scene).toContain("float tokenCarrier");
  });

  test("separates context, gating, activation, and residual merge", () => {
    [
      "float inputRail",
      "float attentionRail",
      "float gateRail",
      "float mergeRail",
      "float stageActivation",
      "float contextWave",
      "float valueBranch",
      "float gateBranch",
      "float gateSplit",
      "float mergeFlash",
    ].forEach((marker) => expect(scene).toContain(marker));
  });

  test("preserves the existing renderer and material contract", () => {
    expect(scene).toContain("vec2 responsiveUv = pointerFlow");
    expect(scene).toContain("float causalLookback");
    expect(scene).toContain("float swigluGate");
    expect(scene).toContain("float residualBypass");
    expect(scene).toContain("float promptFront");
    expect(scene).toContain(
      "fluidMaterial(field, tint, 0.30, 0.24, 0.88)",
    );
  });
});
