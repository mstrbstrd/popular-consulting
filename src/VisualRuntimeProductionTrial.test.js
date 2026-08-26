import fs from "fs";
import path from "path";
import { buildVisualRuntimeReferenceFallbackUrl } from "./components/VisualRuntimeShellHost";
import {
  resolveVisualRuntimeShellPolicy,
  VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES,
} from "./utils/visualRuntimeShellPolicy";
import { VISUAL_RUNTIME_MODES } from "./utils/visualRuntimePolicy";

const read = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const optimizedRequest = {
  requested: VISUAL_RUNTIME_MODES.OPTIMIZED,
  resolved: VISUAL_RUNTIME_MODES.REFERENCE,
  optimizedAvailable: false,
  fallbackReason: "optimized-runtime-unavailable",
};

describe("explicit production optimized runtime trial", () => {
  const runtimePolicySource = read("src/utils/visualRuntimePolicy.js");
  const graphicsPolicySource = read("src/utils/graphicsPolicy.js");
  const hostSource = read("src/components/VisualRuntimeShellHost.js");

  test("activates only from the explicit optimized query on immersive routes", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime=optimized",
        pathname: "/",
        runtimePolicy: optimizedRequest,
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toMatchObject({
      active: true,
      suppressReferenceRenderers: true,
      activationSource:
        VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.OPTIMIZED_QUERY,
    });

    expect(
      resolveVisualRuntimeShellPolicy({
        search: "",
        pathname: "/",
        runtimePolicy: {
          ...optimizedRequest,
          requested: VISUAL_RUNTIME_MODES.AUTO,
        },
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toMatchObject({
      active: false,
      suppressReferenceRenderers: false,
    });
  });

  test("keeps the ordinary production URL on the reference runtime", () => {
    expect(runtimePolicySource).toContain(
      "OPTIMIZED_VISUAL_RUNTIME_AVAILABLE = false",
    );
    expect(graphicsPolicySource).toContain(
      "if (!params.has(VISUAL_RUNTIME_SHELL_QUERY_PARAM)) return true",
    );
    expect(hostSource).toContain(
      "VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.OPTIMIZED_QUERY",
    );
  });

  test("selects the matching theme pipeline and remounts when theme changes", () => {
    expect(hostSource).toContain(
      '(productionTrial && selectedTheme === "dark")',
    );
    expect(hostSource).toContain(
      '(productionTrial && selectedTheme === "light")',
    );
    expect(hostSource).toContain("key={selectedTheme}");
    expect(hostSource).toContain(
      'attributeFilter: ["data-theme"]',
    );
  });

  test("builds a one-way reference fallback URL", () => {
    const fallback = new URL(
      buildVisualRuntimeReferenceFallbackUrl(
        "https://popularconsulting.ca/engineering?visual-runtime=optimized&visual-runtime-shell=probe&visual-runtime-pipeline=dark&campaign=test#section-3",
      ),
    );

    expect(fallback.pathname).toBe("/engineering");
    expect(fallback.hash).toBe("#section-3");
    expect(fallback.searchParams.get("visual-runtime")).toBe(
      "reference",
    );
    expect(fallback.searchParams.get("campaign")).toBe("test");
    expect(fallback.searchParams.has("visual-runtime-shell")).toBe(
      false,
    );
    expect(fallback.searchParams.has("visual-runtime-pipeline")).toBe(
      false,
    );
  });

  test("retains a manual reference fallback controller", () => {
    expect(hostSource).toContain("fallbackToReference");
    expect(hostSource).toContain(
      "VISUAL_RUNTIME_SHELL_FAILURE_EVENT",
    );
    expect(hostSource).toContain("window.location.replace");
  });
});
