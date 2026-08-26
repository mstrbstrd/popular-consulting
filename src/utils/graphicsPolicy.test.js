import {
  GRAPHICS_MODES,
  GRAPHICS_MODE_SESSION_KEY,
  WEBGL_DISABLED_SESSION_KEY,
  disableWebGLForSession,
  isVisualRuntimeShellProbeRequest,
  normalizeGraphicsMode,
  resolveGraphicsPolicy,
  resolveReferenceWebGLAttempt,
} from "./graphicsPolicy";

describe("graphics runtime policy", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test("normalizes only supported graphics modes", () => {
    expect(normalizeGraphicsMode(" CSS ")).toBe(GRAPHICS_MODES.CSS);
    expect(normalizeGraphicsMode("webgl")).toBe(GRAPHICS_MODES.WEBGL);
    expect(normalizeGraphicsMode("AUTO")).toBe(GRAPHICS_MODES.AUTO);
    expect(normalizeGraphicsMode("unsafe")).toBeNull();
  });

  test("attempts governed WebGL on Windows in automatic mode", () => {
    expect(
      resolveGraphicsPolicy({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.AUTO,
      source: "windows-auto",
      isWindows: true,
    });
  });

  test("an explicit CSS or WebGL query remains authoritative on Windows", () => {
    expect(
      resolveGraphicsPolicy({
        search: "?graphics=webgl",
        webglDisabled: true,
        userAgent: "Mozilla/5.0 (Windows NT 11.0; Win64; x64)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.WEBGL,
      source: "query",
      isWindows: true,
    });

    expect(
      resolveGraphicsPolicy({
        search: "?graphics=css",
        userAgent: "Mozilla/5.0 (Windows NT 11.0; Win64; x64)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.CSS,
      source: "query",
      isWindows: true,
    });
  });

  test("a recorded runtime failure overrides automatic and stored modes", () => {
    expect(
      resolveGraphicsPolicy({
        sessionMode: GRAPHICS_MODES.WEBGL,
        webglDisabled: true,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.CSS,
      source: "runtime-failure",
      isWindows: false,
    });
  });

  test("graphics=auto ignores a persisted override on every platform", () => {
    expect(
      resolveGraphicsPolicy({
        search: "?graphics=auto",
        sessionMode: GRAPHICS_MODES.CSS,
        userAgent: "Mozilla/5.0 (Windows NT 11.0; Win64; x64)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.AUTO,
      source: "query-auto",
      isWindows: true,
    });
  });

  test("recognizes the optimized production query and explicit probe", () => {
    expect(
      isVisualRuntimeShellProbeRequest(
        "?visual-runtime=optimized&visual-runtime-shell=probe",
        "/",
      ),
    ).toBe(true);
    expect(
      isVisualRuntimeShellProbeRequest(
        "?visual-runtime=optimized",
        "/engineering",
      ),
    ).toBe(true);
    expect(
      isVisualRuntimeShellProbeRequest(
        "?visual-runtime=reference&visual-runtime-shell=probe",
        "/engineering",
      ),
    ).toBe(false);
    expect(
      isVisualRuntimeShellProbeRequest(
        "?visual-runtime=optimized&visual-runtime-shell=off",
        "/",
      ),
    ).toBe(false);
    expect(
      isVisualRuntimeShellProbeRequest(
        "?visual-runtime=optimized",
        "/work",
      ),
    ).toBe(false);
  });

  test("suppresses reference WebGL only when the shell actually wins", () => {
    expect(
      resolveReferenceWebGLAttempt({
        webglAllowed: true,
        shellProbeRequested: true,
        captureActive: false,
      }),
    ).toBe(false);
    expect(
      resolveReferenceWebGLAttempt({
        webglAllowed: true,
        shellProbeRequested: true,
        captureActive: true,
      }),
    ).toBe(true);
    expect(
      resolveReferenceWebGLAttempt({
        webglAllowed: false,
        shellProbeRequested: true,
        captureActive: true,
      }),
    ).toBe(false);
  });

  test("explicit runtime containment can still persist a CSS-only session", () => {
    disableWebGLForSession("context-lost");

    expect(window.sessionStorage.getItem(WEBGL_DISABLED_SESSION_KEY)).toBe("1");
    expect(window.sessionStorage.getItem(GRAPHICS_MODE_SESSION_KEY)).toBe(
      GRAPHICS_MODES.CSS,
    );
  });
});
