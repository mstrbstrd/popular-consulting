import {
  initVisualRuntimeShellPolicy,
  readVisualRuntimeShellRequest,
  resolveVisualRuntimeShellPolicy,
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

  test("remains off unless the probe is explicitly requested", () => {
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

  test("does not compete with CSS policy or reference capture", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime-shell=probe",
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
        search: "?visual-runtime-shell=probe",
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

  test("activates one shell and suppresses reference WebGL only in the probe", () => {
    expect(
      resolveVisualRuntimeShellPolicy({
        search: "?visual-runtime-shell=probe",
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
