import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("stage-three optimized light architecture", () => {
  const passSource = read("src/utils/visualRuntimeLightPass.js");
  const shaderSource = read("src/utils/visualRuntimeLightShaders.js");
  const stateSource = read("src/utils/visualRuntimeLightState.js");
  const policySource = read("src/utils/visualRuntimeLightPolicy.js");
  const runtimePolicySource = read("src/utils/visualRuntimePolicy.js");
  const hostSource = read("src/components/VisualRuntimeShellHost.js");

  test("keeps the complete optimized runtime unavailable during comparison", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_LIGHT_AVAILABLE = true",
    );
    expect(policySource).toContain(
      'VISUAL_RUNTIME_LIGHT_PIPELINE_ID = "light"',
    );
  });

  test("evaluates the procedural field once per glyph cell", () => {
    expect(shaderSource).toContain(
      "fragColor=vec4(current,right,up,previous)",
    );
    expect(shaderSource).toContain(
      "vec2 cellCenter=(cellID+.5)/fieldSize",
    );
    expect(shaderSource).toContain(
      "vec4 samples=texelFetch(u_field,fieldCoord,0)",
    );
    expect(shaderSource).toContain("sceneRipples");
    const compositeStart = shaderSource.indexOf(
      "VISUAL_RUNTIME_LIGHT_COMPOSITE_SHADER",
    );
    expect(shaderSource.slice(compositeStart)).not.toContain(
      "float sceneRipples",
    );
  });

  test("uses one field draw and one presentation draw", () => {
    expect(passSource.match(/gl\.drawArrays\(/g)).toHaveLength(2);
    expect(passSource).toContain("gl.RGBA32F");
    expect(passSource).toContain("gl.NEAREST");
    expect(passSource).toContain("EXT_color_buffer_float");
    expect(passSource).not.toContain("DitherBackground");
  });

  test("retains the authored state constants rather than time-normalizing them", () => {
    expect(stateSource).toContain("parameterLerp: 0.025");
    expect(stateSource).toContain("shapeBlendStep: 0.011");
    expect(stateSource).toContain("revealDurationMs: 2500");
    expect(stateSource).toContain("Math.min(");
    expect(stateSource).toContain("1 / 15");
  });

  test("mounts only through the existing one-context shell", () => {
    expect(hostSource).toContain("visualRuntimeLightPolicy.active");
    expect(hostSource).toContain("runtime.registerPass(lightPass)");
    expect(hostSource).toContain("shaderRuntimeProfile.maxPixels");
    expect(hostSource.match(/<canvas/g)).toHaveLength(1);
  });
});
