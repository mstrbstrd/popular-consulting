import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("stage-four optimized dark architecture", () => {
  const passSource = read("src/utils/visualRuntimeDarkPass.js");
  const shaderSource = read("src/utils/visualRuntimeDarkShaders.js");
  const stateSource = read("src/utils/visualRuntimeDarkState.js");
  const policySource = read("src/utils/visualRuntimeDarkPolicy.js");
  const runtimePolicySource = read("src/utils/visualRuntimePolicy.js");
  const hostSource = read("src/components/VisualRuntimeShellHost.js");
  const referenceShaderSource = read(
    "src/components/blackHoleShader.js",
  );

  test("keeps the complete optimized runtime unavailable during comparison", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_DARK_AVAILABLE = true",
    );
    expect(policySource).toContain(
      'VISUAL_RUNTIME_DARK_PIPELINE_ID = "dark"',
    );
  });

  test("retains the canonical 200-step RK4 transport equations", () => {
    expect(referenceShaderSource).toContain("#define NUM_STEPS 200");
    expect(referenceShaderSource).toContain("void rk4Step");
    expect(shaderSource).toContain("#define NUM_STEPS 200");
    expect(shaderSource).toContain("void rk4Step");
    expect(shaderSource).toContain("#define STEP_SIZE 0.08");
  });

  test("traces once in transport and shades from transport data", () => {
    const materialStart = shaderSource.indexOf(
      "VISUAL_RUNTIME_DARK_MATERIAL_SHADER",
    );
    expect(shaderSource).toContain("pack12x2(octEncode(normalize(vel)))");
    expect(shaderSource).toContain("TransportSample sampleTransport");
    expect(shaderSource).toContain("texelFetch(u_transport, coord, 0)");
    expect(shaderSource.slice(materialStart)).not.toContain("rk4Step");
    expect(shaderSource.slice(materialStart)).not.toContain("NUM_STEPS");
  });

  test("uses one transport draw and one material draw", () => {
    expect(passSource.match(/gl\.drawArrays\(/g)).toHaveLength(2);
    expect(passSource).toContain("gl.RGBA32F");
    expect(passSource).toContain("EXT_color_buffer_float");
    expect(passSource).toContain("FRONT_TARGET_KEY");
    expect(passSource).toContain("BACK_TARGET_KEY");
    expect(passSource).toContain("resolveVisualRuntimeDarkTiles");
    expect(passSource).not.toContain("BLACK_HOLE_FRAGMENT_SHADER");
  });

  test("encodes the order-of-magnitude transport invariant", () => {
    expect(stateSource).toContain("outputScale: 0.35");
    expect(stateSource).toContain("transportScale: 0.5");
    expect(stateSource).toContain("tileColumns: 4");
    expect(stateSource).toContain("tileRows: 4");
    expect(stateSource).toContain("referenceRayIntegrations = outputPixels * 3");
    expect(stateSource).toContain(
      "optimizedRayIntegrations = transportPixels",
    );
  });

  test("mounts only through the existing one-context shell", () => {
    expect(hostSource).toContain("visualRuntimeDarkPolicy.active");
    expect(hostSource).toContain("runtime.registerPass(darkPass)");
    expect(hostSource.match(/<canvas/g)).toHaveLength(1);
  });
});
