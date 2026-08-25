import fs from "fs";
import path from "path";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("stage-two visual runtime shell architecture", () => {
  const shellSource = read("src/utils/visualRuntimeShell.js");
  const schedulerSource = read(
    "src/utils/visualRuntimeScheduler.js",
  );
  const resizeSource = read(
    "src/utils/visualRuntimeResizeAuthority.js",
  );
  const poolSource = read(
    "src/utils/visualRuntimeRenderTargetPool.js",
  );
  const policySource = read("src/utils/visualRuntimePolicy.js");
  const shellPolicySource = read(
    "src/utils/visualRuntimeShellPolicy.js",
  );
  const graphicsPolicySource = read("src/utils/graphicsPolicy.js");
  const hostSource = read("src/components/VisualRuntimeShellHost.js");
  const indexSource = read("src/index.js");

  test("keeps the optimized renderer unavailable while the shell is empty", () => {
    expect(policySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
    expect(policySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_SHELL_AVAILABLE = true",
    );
    expect(shellPolicySource).toContain(
      "VISUAL_RUNTIME_SHELL_QUERY_PARAM",
    );
    expect(shellPolicySource).toContain('"visual-runtime-shell"');
    expect(shellPolicySource).toContain('PROBE: "probe"');
  });

  test("suppresses reference WebGL before mounting the explicit probe", () => {
    expect(graphicsPolicySource).toContain(
      "!visualRuntimeShellProbeRequested",
    );
    expect(shellPolicySource).toContain(
      "suppressReferenceRenderers: active",
    );
    expect(shellPolicySource).toContain(
      "optimized-runtime-request-required",
    );
    expect(shellPolicySource).toContain(
      "reference-capture-exclusive",
    );
  });

  test("centralizes the only shell canvas and WebGL context creation", () => {
    expect(hostSource.match(/<canvas/g)).toHaveLength(1);
    expect(shellSource.match(/\.getContext\("webgl2"/g)).toHaveLength(1);
    expect(schedulerSource).not.toContain("createElement(\"canvas\")");
    expect(resizeSource).not.toContain("createElement(\"canvas\")");
    expect(poolSource).not.toContain(".getContext(");
  });

  test("keeps scheduling and resizing under separate single authorities", () => {
    expect(schedulerSource).toContain("requestAnimationFrame");
    expect(resizeSource).not.toContain("requestAnimationFrame");
    expect(shellSource).not.toContain("requestAnimationFrame");
    expect(shellSource).toContain("createVisualRuntimeScheduler");
    expect(shellSource).toContain(
      "createVisualRuntimeResizeAuthority",
    );
    expect(shellSource).toContain("VisualRuntimeRenderTargetPool");
  });

  test("mounts one host beside the router after boot policies are fixed", () => {
    const runtimePolicyIndex = indexSource.indexOf(
      "initVisualRuntimePolicy();",
    );
    const shellPolicyIndex = indexSource.indexOf(
      "initVisualRuntimeShellPolicy();",
    );
    const governorIndex = indexSource.indexOf(
      "initGraphicsContextGovernor();",
    );
    const hostIndex = indexSource.indexOf("<VisualRuntimeShellHost />");

    expect(runtimePolicyIndex).toBeGreaterThan(-1);
    expect(shellPolicyIndex).toBeGreaterThan(runtimePolicyIndex);
    expect(governorIndex).toBeGreaterThan(shellPolicyIndex);
    expect(hostIndex).toBeGreaterThan(-1);
    expect(hostIndex).toBeLessThan(
      indexSource.indexOf("<React.StrictMode>"),
    );
  });
});
