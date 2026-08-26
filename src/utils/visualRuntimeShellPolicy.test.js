import {
  initVisualRuntimeShellPolicy,
  readVisualRuntimeShellRequest,
  resolveVisualRuntimeShellPolicy,
  VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES,
  VISUAL_RUNTIME_SHELL_MODES,
} from "./visualRuntimeShellPolicy";
import { VISUAL_RUNTIME_MODES } from "./visualRuntimePolicy";

const runtimePolicy = (requested) => ({
  requested,
  resolved: VISUAL_RUNTIME_MODES.REFERENCE,
  optimizedAvailable: false,
  fallbackReason:
    requested === VISUAL_RUNTIME_MODES.OPTIMIZED
      ? "optimized-runtime-unavailable"
      : null,
});

describe("visual runtime shell policy", () => {
  afterEach(() => {
    document.documentElement.removeAttribute(
      "data-visual-runtime-shell",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-reference-suppressed",
    );
    document.documentElement.removeAttribute(
      "data-visual-runtime-shell-disabled",
    );
  });

  test("keeps the low-level shell override off unless probe is requested", () => {
    expect(readVisualRuntimeShellRequest("")).toBe(
      VISUAL_RUNTIME_SHELL_MODES.OFF,
    );
    expect(
      readVisualRuntimeShellRequest(
        "?visual-runtime-shell=unknown",
      ),
    ).toBe(VISUAL_RUNTIME_SHELL_MODES.OFF);
    expect(
      readVisualRuntimeShellRequest("?visual-runtime-shell=probe"),
    ).toBe(VISUAL_RUNTIME_SHELL_MODES.PROBE);
  });

  test("requires the optimized request and an immersive route", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime-shell=probe",
        pathname: "/",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.REFERENCE,
        ),
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toMatchObject({
      active: false,
      suppressReferenceRenderers: false,
      disabledReason: "optimized-runtime-request-required",
    });

    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime-shell=probe",
        pathname: "/work",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.OPTIMIZED,
        ),
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toMatchObject({
      active: false,
      disabledReason: "immersive-route-required",
    });
  });

  test("activates the production trial from visual-runtime=optimized", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime=optimized",
        pathname: "/",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.OPTIMIZED,
        ),
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: VISUAL_RUNTIME_SHELL_MODES.OFF,
      explicitShellRequest: false,
      activationSource:
        VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.OPTIMIZED_QUERY,
      active: true,
      suppressReferenceRenderers: true,
      immersiveRoute: true,
      optimizedRequested: true,
      captureActive: false,
      disabledReason: null,
    });
  });

  test("an explicit shell override can keep the production trial off", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search:
          "?visual-runtime=optimized&visual-runtime-shell=off",
        pathname: "/",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.OPTIMIZED,
        ),
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toMatchObject({
      explicitShellRequest: true,
      activationSource: null,
      active: false,
      suppressReferenceRenderers: false,
      disabledReason: null,
    });
  });

  test("does not compete with CSS policy or reference capture", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime=optimized",
        pathname: "/",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.OPTIMIZED,
        ),
        captureState: { active: false },
        webglAllowed: false,
      }),
    ).toMatchObject({
      active: false,
      disabledReason: "graphics-policy-css",
    });

    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime=optimized",
        pathname: "/engineering",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.OPTIMIZED,
        ),
        captureState: { active: true },
        webglAllowed: true,
      }),
    ).toMatchObject({
      active: false,
      disabledReason: "reference-capture-exclusive",
    });
  });

  test("retains the explicit probe comparison path", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search:
          "?visual-runtime=optimized&visual-runtime-shell=probe",
        pathname: "/engineering/",
        runtimePolicy: runtimePolicy(
          VISUAL_RUNTIME_MODES.OPTIMIZED,
        ),
        captureState: { active: false },
        webglAllowed: true,
      }),
    ).toEqual({
      schemaVersion: 1,
      requested: VISUAL_RUNTIME_SHELL_MODES.PROBE,
      explicitShellRequest: true,
      activationSource:
        VISUAL_RUNTIME_SHELL_ACTIVATION_SOURCES.PROBE,
      active: true,
      suppressReferenceRenderers: true,
      immersiveRoute: true,
      optimizedRequested: true,
      captureActive: false,
      disabledReason: null,
    });
  });

  test("publishes the static boot policy without creating a canvas", () => {
    const before = document.querySelectorAll("canvas").length;
    const cleanup = initVisualRuntimeShellPolicy();

    expect(document.querySelectorAll("canvas")).toHaveLength(before);
    expect(document.documentElement).toHaveAttribute(
      "data-visual-runtime-shell",
    );
    cleanup();
  });
});
