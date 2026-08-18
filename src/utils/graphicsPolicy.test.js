import {
  GRAPHICS_MODES,
  GRAPHICS_MODE_SESSION_KEY,
  WEBGL_DISABLED_SESSION_KEY,
  disableWebGLForSession,
  normalizeGraphicsMode,
  resolveGraphicsPolicy,
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

  test("fails closed to CSS on Windows in automatic mode", () => {
    expect(
      resolveGraphicsPolicy({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.CSS,
      source: "windows-safe-default",
      isWindows: true,
    });
  });

  test("an explicit WebGL query is the only Windows opt-in", () => {
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

  test("graphics=auto ignores a persisted override", () => {
    expect(
      resolveGraphicsPolicy({
        search: "?graphics=auto",
        sessionMode: GRAPHICS_MODES.WEBGL,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      }),
    ).toEqual({
      mode: GRAPHICS_MODES.AUTO,
      source: "query-auto",
      isWindows: false,
    });
  });

  test("context loss persists a CSS-only session", () => {
    disableWebGLForSession("context-lost");

    expect(window.sessionStorage.getItem(WEBGL_DISABLED_SESSION_KEY)).toBe("1");
    expect(window.sessionStorage.getItem(GRAPHICS_MODE_SESSION_KEY)).toBe(
      GRAPHICS_MODES.CSS,
    );
  });
});
