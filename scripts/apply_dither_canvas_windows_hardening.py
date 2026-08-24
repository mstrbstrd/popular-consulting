from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path, old, new):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}\n{old[:240]}")
    write(path, content.replace(old, new, 1))


def replace_span(path, start, end, replacement):
    content = read(path)
    start_index = content.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: start marker not found: {start}")
    end_index = content.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{path}: end marker not found: {end}")
    write(path, content[:start_index] + replacement + content[end_index:])


def insert_before_last(path, marker, insertion):
    content = read(path)
    index = content.rfind(marker)
    if index < 0:
        raise RuntimeError(f"{path}: final marker not found: {marker}")
    write(path, content[:index] + insertion + content[index:])


# Shared runtime policy. The shader mathematics remain untouched. Only context
# selection, frame cadence, canvas allocation, and recovery ownership change.
write(
    "src/utils/ditherCanvasRuntime.js",
    '''import { isMobileTier } from "./deviceTier";
import { isWindowsPlatform, recordGraphicsEvent } from "./graphicsPolicy";

export const DITHER_CANVAS_RUNTIME_PROFILES = Object.freeze({
  mobile: Object.freeze({
    id: "mobile",
    maxPixels: 450_000,
    frameIntervalMs: 1000 / 24,
    powerPreference: "low-power",
  }),
  windows: Object.freeze({
    id: "windows",
    maxPixels: 600_000,
    frameIntervalMs: 1000 / 24,
    powerPreference: "high-performance",
  }),
  desktop: Object.freeze({
    id: "desktop",
    maxPixels: Number.POSITIVE_INFINITY,
    frameIntervalMs: 1000 / 30,
    powerPreference: "low-power",
  }),
});

export const resolveDitherCanvasRuntimeProfile = ({
  mobile = false,
  windows = false,
} = {}) => {
  if (mobile) return DITHER_CANVAS_RUNTIME_PROFILES.mobile;
  if (windows) return DITHER_CANVAS_RUNTIME_PROFILES.windows;
  return DITHER_CANVAS_RUNTIME_PROFILES.desktop;
};

export const ditherCanvasRuntimeProfile = resolveDitherCanvasRuntimeProfile({
  mobile: isMobileTier,
  windows: isWindowsPlatform,
});

export const getDitherCanvasFrameInterval = (
  preferredFrameIntervalMs,
  profile = ditherCanvasRuntimeProfile,
) => Math.max(
  Math.max(1, Number(preferredFrameIntervalMs) || 1),
  profile.frameIntervalMs,
);

export const getDitherCanvasSize = (
  cssWidth,
  cssHeight,
  preferredScale = 1,
  profile = ditherCanvasRuntimeProfile,
) => {
  const safeCssWidth = Math.max(1, Number(cssWidth) || 1);
  const safeCssHeight = Math.max(1, Number(cssHeight) || 1);
  const safePreferredScale = Math.max(0.1, Number(preferredScale) || 1);
  const preferredWidth = Math.max(
    1,
    Math.floor(safeCssWidth * safePreferredScale),
  );
  const preferredHeight = Math.max(
    1,
    Math.floor(safeCssHeight * safePreferredScale),
  );
  const preferredPixels = preferredWidth * preferredHeight;
  const maxPixels = Number(profile.maxPixels);
  const budgetScale =
    Number.isFinite(maxPixels) && preferredPixels > maxPixels
      ? Math.sqrt(maxPixels / preferredPixels)
      : 1;

  const width = Math.max(1, Math.floor(preferredWidth * budgetScale));
  const height = Math.max(1, Math.floor(preferredHeight * budgetScale));

  return {
    width,
    height,
    scale: Math.min(width / safeCssWidth, height / safeCssHeight),
    profileId: profile.id,
  };
};

export const createDitherCanvasContext = ({
  canvas,
  contextType,
  options = {},
  profile = ditherCanvasRuntimeProfile,
  rendererId = "dither-canvas",
}) => {
  const baseOptions = {
    ...options,
    powerPreference: options.powerPreference || profile.powerPreference,
  };

  let context = null;
  try {
    context = canvas.getContext(contextType, {
      ...baseOptions,
      failIfMajorPerformanceCaveat: true,
    });
  } catch (_) {
    context = null;
  }

  if (context) {
    recordGraphicsEvent("dither-canvas-context-created", {
      rendererId,
      profile: profile.id,
      contextType,
      caveat: "strict",
    });
    return context;
  }

  recordGraphicsEvent("dither-canvas-context-relaxed", {
    rendererId,
    profile: profile.id,
    contextType,
  });

  try {
    context = canvas.getContext(contextType, {
      ...baseOptions,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (_) {
    context = null;
  }

  recordGraphicsEvent(
    context
      ? "dither-canvas-context-created"
      : "dither-canvas-context-unavailable",
    {
      rendererId,
      profile: profile.id,
      contextType,
      caveat: "relaxed",
    },
  );
  return context;
};
''',
)

write(
    "src/utils/ditherCanvasRuntime.test.js",
    '''import {
  createDitherCanvasContext,
  DITHER_CANVAS_RUNTIME_PROFILES,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
  resolveDitherCanvasRuntimeProfile,
} from "./ditherCanvasRuntime";

jest.mock("./deviceTier", () => ({ isMobileTier: false }));
jest.mock("./graphicsPolicy", () => ({
  isWindowsPlatform: false,
  recordGraphicsEvent: jest.fn(),
}));

describe("Dither Field Lab runtime policy", () => {
  test("selects the bounded Windows profile without changing shader code", () => {
    expect(resolveDitherCanvasRuntimeProfile({ windows: true })).toBe(
      DITHER_CANVAS_RUNTIME_PROFILES.windows,
    );
    expect(DITHER_CANVAS_RUNTIME_PROFILES.windows).toMatchObject({
      maxPixels: 600_000,
      frameIntervalMs: 1000 / 24,
      powerPreference: "high-performance",
    });
  });

  test("bounds every Windows drawing buffer before allocation", () => {
    const size = getDitherCanvasSize(
      3840,
      2160,
      1,
      DITHER_CANVAS_RUNTIME_PROFILES.windows,
    );

    expect(size.width * size.height).toBeLessThanOrEqual(600_000);
    expect(size.profileId).toBe("windows");
  });

  test("preserves the authored desktop scale while enforcing Windows cadence", () => {
    expect(
      getDitherCanvasSize(
        1920,
        1080,
        0.5,
        DITHER_CANVAS_RUNTIME_PROFILES.desktop,
      ),
    ).toMatchObject({ width: 960, height: 540 });
    expect(
      getDitherCanvasFrameInterval(
        1000 / 30,
        DITHER_CANVAS_RUNTIME_PROFILES.windows,
      ),
    ).toBeCloseTo(1000 / 24);
  });

  test("retries a caveated adapter with the same renderer options", () => {
    const context = {};
    const canvas = {
      getContext: jest
        .fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(context),
    };

    expect(
      createDitherCanvasContext({
        canvas,
        contextType: "webgl2",
        rendererId: "test-field",
        profile: DITHER_CANVAS_RUNTIME_PROFILES.windows,
        options: { antialias: false },
      }),
    ).toBe(context);
    expect(canvas.getContext).toHaveBeenNthCalledWith(
      1,
      "webgl2",
      expect.objectContaining({
        antialias: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "high-performance",
      }),
    );
    expect(canvas.getContext).toHaveBeenNthCalledWith(
      2,
      "webgl2",
      expect.objectContaining({
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
      }),
    );
  });
});
''',
)

# Main Dither foreground ownership. This also corrects the missing foreground
# fix that was previously described but never landed on main.
replace_once(
    "src/components/ManagedDitherBackground.js",
    '      data-renderer-id={rendererId}\n      data-renderer-state={rendererState}',
    '      data-renderer-id={rendererId}\n      data-dither-layer-host="true"\n      data-renderer-state={rendererState}',
)
replace_once(
    "src/components/ManagedDitherBackground.js",
    '      style={{ position: "absolute", inset: 0 }}',
    '''      style={{
        position: "absolute",
        inset: 0,
        isolation: "isolate",
        pointerEvents: "none",
      }}''',
)
replace_once(
    "src/components/DitherBackground.js",
    '''    // Click on canvas while on orb section → pop if sphere hit, else ripple
    const handleCanvasClick = (e) => {
      if (targetIdxRef.current !== 4) return;
      const rect = canvas.getBoundingClientRect();
      const uvx = (e.clientX - rect.left) / rect.width;
      const uvy = (e.clientY - rect.top) / rect.height;
      const aspect = rect.width / rect.height;
      const dx = (uvx - 0.5) * aspect;
      const dy = uvy - 0.5;
      if (
        Math.sqrt(dx * dx + dy * dy) < 0.31 &&
        popStateRef.current === "idle"
      ) {
        window.__orbPop?.();
      }
    };
    canvas.addEventListener("click", handleCanvasClick);
''',
    '''    // Keep the visual click response without allowing a full-screen WebGL
    // surface to own hit testing above foreground navigation.
    const isInteractiveClickTarget = (target) =>
      target instanceof Element
      && Boolean(
        target.closest(
          "a, button, input, select, textarea, label, [role='button'], [role='link']",
        ),
      );
    const handleCanvasClick = (event) => {
      if (
        targetIdxRef.current !== 4
        || event.button > 0
        || isInteractiveClickTarget(event.target)
      ) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      if (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
      ) {
        return;
      }

      const uvx = (event.clientX - rect.left) / Math.max(rect.width, 1);
      const uvy = (event.clientY - rect.top) / Math.max(rect.height, 1);
      const aspect = rect.width / Math.max(rect.height, 1);
      const dx = (uvx - 0.5) * aspect;
      const dy = uvy - 0.5;
      if (
        Math.sqrt(dx * dx + dy * dy) < 0.31
        && popStateRef.current === "idle"
      ) {
        window.__orbPop?.();
      }
    };
    window.addEventListener("click", handleCanvasClick, { passive: true });
''',
)
replace_once(
    "src/components/DitherBackground.js",
    '      canvas.removeEventListener("click", handleCanvasClick);',
    '      window.removeEventListener("click", handleCanvasClick);',
)
replace_once(
    "src/components/DitherBackground.js",
    '''      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
      <canvas
        ref={popCanvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />''',
    '''      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-graphics-layer="decorative"
        tabIndex={-1}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      <canvas
        ref={popCanvasRef}
        aria-hidden="true"
        data-graphics-layer="decorative"
        tabIndex={-1}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />''',
)

write(
    "src/components/DitherForegroundLayerContract.test.js",
    '''import fs from "fs";
import path from "path";

describe("Dither foreground layer contract", () => {
  const ditherSource = fs.readFileSync(
    path.join(__dirname, "DitherBackground.js"),
    "utf8",
  );
  const managedSource = fs.readFileSync(
    path.join(__dirname, "ManagedDitherBackground.js"),
    "utf8",
  );

  test("decorative canvases cannot intercept foreground controls", () => {
    expect(ditherSource.match(/data-graphics-layer="decorative"/g)).toHaveLength(2);
    expect(ditherSource.match(/pointerEvents: "none"/g).length).toBeGreaterThanOrEqual(2);
    expect(ditherSource.match(/zIndex: -1/g)).toHaveLength(2);
    expect(managedSource).toContain('data-dither-layer-host="true"');
    expect(managedSource).toContain('isolation: "isolate"');
    expect(managedSource).toContain('pointerEvents: "none"');
  });

  test("visual clicks are observed passively and never owned by the canvas", () => {
    expect(ditherSource).toContain(
      'window.addEventListener("click", handleCanvasClick, { passive: true })',
    );
    expect(ditherSource).toContain(
      'window.removeEventListener("click", handleCanvasClick)',
    );
    expect(ditherSource).not.toContain(
      'canvas.addEventListener("click", handleCanvasClick)',
    );
    expect(ditherSource).toContain("isInteractiveClickTarget(event.target)");
    expect(ditherSource).toContain("event.clientX < rect.left");
    expect(ditherSource).toContain("event.clientY > rect.bottom");
  });
});
''',
)

# Lava Lamp runtime hardening.
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    'import React, { useEffect, useRef, useState } from "react";\n',
    '''import React, { useEffect, useRef, useState } from "react";
import {
  createDitherCanvasContext,
  ditherCanvasRuntimeProfile,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
} from "../utils/ditherCanvasRuntime";
''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    'const FRAME_INTERVAL_MS = 1000 / 30;',
    '''const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30;
const FRAME_INTERVAL_MS = getDitherCanvasFrameInterval(
  PREFERRED_FRAME_INTERVAL_MS,
);''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '''    const handleContextLost = (event) => {
      event.preventDefault();
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };''',
    '''    const handleContextLost = (event) => {
      event.preventDefault();
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '''      gl = canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "low-power",
      });''',
    '''      gl = createDitherCanvasContext({
        canvas,
        contextType: "webgl",
        rendererId: "dither-canvas-lava",
        options: {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
        },
      });''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '''    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width * RENDER_SCALE));
      const height = Math.max(1, Math.floor(bounds.height * RENDER_SCALE));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
        forceRender = true;
      }
    };''',
    '''    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const target = getDitherCanvasSize(
        bounds.width,
        bounds.height,
        RENDER_SCALE,
      );
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        gl.viewport(0, 0, target.width, target.height);
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRender = true;
      }
    };''',
)
replace_span(
    "src/components/CreatorOSLavaLampCanvas.js",
    "    const tick = (now) => {",
    "    updateSize();\n    if (typeof ResizeObserver !== \"undefined\") {",
    '''    function scheduleFrame() {
      if (
        rafId
        || !documentVisible
        || reducedMotion
      ) {
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    }

    function tick(now) {
      rafId = 0;
      if (!documentVisible) return;
      if (reducedMotion) {
        drawStatic();
        return;
      }
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        scheduleFrame();
        return;
      }

      const delta = lastFrameAt
        ? Math.min((now - lastFrameAt) / 1000, 0.1)
        : 0;
      lastFrameAt = now;
      applyRestart();

      if (pausedRef.current && !forceRender) return;
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(INTRO_DURATION_SECONDS, introElapsed + delta);
      }

      updateSize();
      const intro = Math.min(1, introElapsed / INTRO_DURATION_SECONDS);
      draw(localTime, intro);
      reportState(intro < 1 ? "warming" : "flowing");
      forceRender = false;
      if (!pausedRef.current) scheduleFrame();
    }

    const start = () => {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      applyRestart();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      scheduleFrame();
    };

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
        start();
      }
    };

    const handleMotionChange = () => {
      syncReducedMotion();
      start();
    };

    redrawRef.current = () => {
      forceRender = true;
      if (reducedMotion) drawStatic();
      else scheduleFrame();
    };

    const handleResize = () => {
      updateSize();
      redrawRef.current();
    };

''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '''      resizeObserver = new ResizeObserver(() => {
        updateSize();
        if (reducedMotion) drawStatic();
      });''',
    '''      resizeObserver = new ResizeObserver(handleResize);''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '    window.addEventListener("resize", updateSize);',
    '    window.addEventListener("resize", handleResize);',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '      window.removeEventListener("resize", updateSize);',
    '      window.removeEventListener("resize", handleResize);',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '''      className={`creatoros-lava-shell${fallback ? " is-fallback" : ""}`}
      aria-hidden="true"''',
    '''      className={`creatoros-lava-shell${fallback ? " is-fallback" : ""}`}
      data-context-recovery="local"
      data-renderer-id="dither-canvas-lava"
      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      aria-hidden="true"''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.js",
    '      <canvas ref={canvasRef} className="creatoros-lava-canvas" />',
    '''      <canvas
        ref={canvasRef}
        className="creatoros-lava-canvas"
        data-renderer-id="dither-canvas-lava"
        aria-hidden="true"
        tabIndex={-1}
      />''',
)

# Shared CreatorOS field runtime hardening.
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    'import React, { useEffect, useRef, useState } from "react";\n',
    '''import React, { useEffect, useRef, useState } from "react";
import {
  createDitherCanvasContext,
  ditherCanvasRuntimeProfile,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
} from "../utils/ditherCanvasRuntime";
''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    'const FRAME_INTERVAL_MS = 1000 / 30;',
    '''const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30;
const FRAME_INTERVAL_MS = getDitherCanvasFrameInterval(
  PREFERRED_FRAME_INTERVAL_MS,
);''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''    const handleContextLost = (event) => {
      event.preventDefault();
      window.cancelAnimationFrame(rafId);
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };''',
    '''    const handleContextLost = (event) => {
      event.preventDefault();
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      setFallback(true);
      onFieldStateChangeRef.current?.("fallback");
    };''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''      gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        failIfMajorPerformanceCaveat: true,
        powerPreference: "low-power",
      });''',
    '''      gl = createDitherCanvasContext({
        canvas,
        contextType: "webgl2",
        rendererId: "dither-canvas-field",
        options: {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
        },
      });''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''      displayProgram = createProgram(
        gl,
        CREATOROS_FIELD_FRAGMENT_SHADER,
        "CreatorOS original field",
      );
      paintDisplayProgram = createProgram(
        gl,
        CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
        "CreatorOS sand paint field",
      );
      reactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_FRAGMENT_SHADER,
        "CreatorOS original reaction diffusion",
      );
      paintReactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
        "CreatorOS sand paint reaction diffusion",
      );''',
    '''      const paintProgramsRequired =
        modeRef.current === REACTION_MODE
        && morphogenPaintRef.current >= 0.5;
      displayProgram = createProgram(
        gl,
        CREATOROS_FIELD_FRAGMENT_SHADER,
        "CreatorOS original field",
      );
      paintDisplayProgram = paintProgramsRequired
        ? createProgram(
            gl,
            CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
            "CreatorOS sand paint field",
          )
        : null;
      reactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_FRAGMENT_SHADER,
        "CreatorOS original reaction diffusion",
      );
      paintReactionProgram = paintProgramsRequired
        ? createProgram(
            gl,
            CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
            "CreatorOS sand paint reaction diffusion",
          )
        : null;''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''      configurePosition(gl, displayProgram, positionBuffer);
      configurePosition(gl, paintDisplayProgram, positionBuffer);
      configurePosition(gl, reactionProgram, positionBuffer);
      configurePosition(gl, paintReactionProgram, positionBuffer);''',
    '''      configurePosition(gl, displayProgram, positionBuffer);
      if (paintDisplayProgram) {
        configurePosition(gl, paintDisplayProgram, positionBuffer);
      }
      configurePosition(gl, reactionProgram, positionBuffer);
      if (paintReactionProgram) {
        configurePosition(gl, paintReactionProgram, positionBuffer);
      }''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''    const paintDisplayUniforms = collectUniforms(
      gl,
      paintDisplayProgram,
      [
        ...displayUniformNames,
        "u_morphogenPaintMix",
        "u_morphogenColorA",
        "u_morphogenColorB",
        "u_morphogenGradientMode",
        "u_morphogenBrushRadius",
        "u_morphogenBrushErase",
      ],
    );''',
    '''    const paintDisplayUniforms = paintDisplayProgram
      ? collectUniforms(
          gl,
          paintDisplayProgram,
          [
            ...displayUniformNames,
            "u_morphogenPaintMix",
            "u_morphogenColorA",
            "u_morphogenColorB",
            "u_morphogenGradientMode",
            "u_morphogenBrushRadius",
            "u_morphogenBrushErase",
          ],
        )
      : null;''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''    const paintReactionUniforms = collectUniforms(
      gl,
      paintReactionProgram,
      [
        ...reactionUniformNames,
        "u_paintMode",
        "u_brushActive",
        "u_brushErase",
        "u_brushRadius",
        "u_brushFrom",
        "u_brushTo",
      ],
    );''',
    '''    const paintReactionUniforms = paintReactionProgram
      ? collectUniforms(
          gl,
          paintReactionProgram,
          [
            ...reactionUniformNames,
            "u_paintMode",
            "u_brushActive",
            "u_brushErase",
            "u_brushRadius",
            "u_brushFrom",
            "u_brushTo",
          ],
        )
      : null;''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width * RENDER_SCALE));
      const height = Math.max(1, Math.floor(bounds.height * RENDER_SCALE));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        forceRender = true;
      }
    };''',
    '''    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      const target = getDitherCanvasSize(
        bounds.width,
        bounds.height,
        RENDER_SCALE,
      );
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRender = true;
      }
    };''',
)
replace_span(
    "src/components/CreatorOSFieldCanvas.js",
    "    const tick = (now) => {",
    "    updateSize();\n    if (typeof ResizeObserver !== \"undefined\") {",
    '''    function scheduleFrame() {
      if (
        rafId
        || !documentVisible
        || reducedMotion
      ) {
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    }

    function tick(now) {
      rafId = 0;
      if (!documentVisible) return;
      if (reducedMotion) {
        drawStatic();
        return;
      }
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        scheduleFrame();
        return;
      }

      const delta = lastFrameAt
        ? Math.min((now - lastFrameAt) / 1000, 0.1)
        : 0;
      lastFrameAt = now;
      applyRestart();

      const paintBrushPending =
        isMorphogenPaintActive()
        && (brush.down || brush.pending);
      if (pausedRef.current && !forceRender && !paintBrushPending) return;
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(
          INTRO_DURATION_SECONDS,
          introElapsed + delta,
        );
        simulate(delta, performance.now());
        advanceReaction();
      } else {
        currentMode = modeRef.current;
        incomingMode = currentMode;
        modeMix = 1;
        if (paintBrushPending) {
          drawReactionStep(0.62, true);
        }
      }

      updateSize();
      draw();
      forceRender = false;
      if (!pausedRef.current || brush.down || brush.pending) scheduleFrame();
    }

    const start = () => {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      applyRestart();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      scheduleFrame();
    };

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
        start();
      }
    };

    const handleMotionChange = () => {
      syncReducedMotion();
      start();
    };

    redrawRef.current = () => {
      forceRender = true;
      if (reducedMotion) drawStatic();
      else scheduleFrame();
    };

    const handleResize = () => {
      updateSize();
      redrawRef.current();
    };

''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''      resizeObserver = new ResizeObserver(() => {
        updateSize();
        if (reducedMotion) drawStatic();
      });''',
    '''      resizeObserver = new ResizeObserver(handleResize);''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '    window.addEventListener("resize", updateSize);',
    '    window.addEventListener("resize", handleResize);',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '      window.removeEventListener("resize", updateSize);',
    '      window.removeEventListener("resize", handleResize);',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '  }, [contextVersion]);',
    '  }, [contextVersion, mode, morphogenExperience]);',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '''      }`}
      aria-hidden="true"''',
    '''      }`}
      data-context-recovery="local"
      data-renderer-id="dither-canvas-field"
      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      aria-hidden="true"''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.js",
    '      <canvas ref={canvasRef} className="creatoros-field-canvas" />',
    '''      <canvas
        ref={canvasRef}
        className="creatoros-field-canvas"
        data-renderer-id="dither-canvas-field"
        aria-hidden="true"
        tabIndex={-1}
      />''',
)

# Second Surface receives the same local recovery, Windows allocation budget,
# frame cadence, and no-work-while-hidden/paused invariants.
replace_once(
    "src/components/RuptureCanvas.js",
    '''import { isMobileTier } from "../utils/deviceTier";
''',
    '''import { isMobileTier } from "../utils/deviceTier";
import {
  createDitherCanvasContext,
  ditherCanvasRuntimeProfile,
  getDitherCanvasFrameInterval,
  getDitherCanvasSize,
} from "../utils/ditherCanvasRuntime";
''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    'const TARGET_FRAME_MS = isMobileTier ? 42 : 32;',
    '''const PREFERRED_TARGET_FRAME_MS = isMobileTier ? 42 : 32;
const TARGET_FRAME_MS = getDitherCanvasFrameInterval(
  PREFERRED_TARGET_FRAME_MS,
);''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '  const forceRenderRef = useRef(true);',
    '''  const forceRenderRef = useRef(true);
  const requestRenderRef = useRef(() => {});''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''  useEffect(() => {
    pausedRef.current = paused;
    forceRenderRef.current = true;
  }, [paused]);''',
    '''  useEffect(() => {
    pausedRef.current = paused;
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [paused]);''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''  useEffect(() => {
    themeRef.current = isDark ? 1 : 0;
    forceRenderRef.current = true;
  }, [isDark]);''',
    '''  useEffect(() => {
    themeRef.current = isDark ? 1 : 0;
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [isDark]);''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''  useEffect(() => {
    resetSimulationRef.current();
    forceRenderRef.current = true;
  }, [resetVersion]);''',
    '''  useEffect(() => {
    resetSimulationRef.current();
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [resetVersion]);''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''    syncControlledProgressRef.current();
    forceRenderRef.current = true;
  }, [controlledProgress]);''',
    '''    syncControlledProgressRef.current();
    forceRenderRef.current = true;
    requestRenderRef.current();
  }, [controlledProgress]);''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
      forceRenderRef.current = true;
    };''',
    '''    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
      forceRenderRef.current = true;
      requestRenderRef.current();
    };''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (documentVisible) forceRenderRef.current = true;
    };''',
    '''    const handleVisibility = () => {
      documentVisible = document.visibilityState !== "hidden";
      if (!documentVisible) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
        return;
      }
      forceRenderRef.current = true;
      requestRenderRef.current();
    };''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''    const handleContextLost = (event) => {
      event.preventDefault();
      setFallback(true);
    };''',
    '''    const handleContextLost = (event) => {
      event.preventDefault();
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      setFallback(true);
    };''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: isMobileTier ? "low-power" : "high-performance",
      });''',
    '''      gl = createDitherCanvasContext({
        canvas,
        contextType: "webgl2",
        rendererId: "dither-canvas-rupture",
        options: {
          alpha: false,
          antialias: false,
          depth: false,
        },
      });''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''      const renderWidth = Math.max(1, Math.floor(width * scale));
      const renderHeight = Math.max(1, Math.floor(height * scale));
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        gl.viewport(0, 0, renderWidth, renderHeight);
        forceRenderRef.current = true;
      }''',
    '''      const target = getDitherCanvasSize(width, height, scale);
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        gl.viewport(0, 0, target.width, target.height);
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRenderRef.current = true;
      }''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", updateSize);''',
    '''    const handleResize = () => {
      updateSize();
      requestRenderRef.current();
    };
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", handleResize);''',
)
replace_span(
    "src/components/RuptureCanvas.js",
    "    const render = (timestamp) => {",
    "    return () => {",
    '''    const render = (timestamp) => {
      animationFrameRef.current = 0;
      if (!documentVisible) return;

      const shouldOnlyRefresh = pausedRef.current || reducedMotion;
      if (shouldOnlyRefresh && !forceRenderRef.current) return;

      const minimumFrameMs = reducedMotion ? REDUCED_FRAME_MS : TARGET_FRAME_MS;
      if (timestamp - lastFrameAt < minimumFrameMs) {
        scheduleRender();
        return;
      }
      const delta = lastFrameAt
        ? Math.min((timestamp - lastFrameAt) / 1000, 1 / 18)
        : 0;
      lastFrameAt = timestamp;

      if (!pausedRef.current && !reducedMotion) {
        localTime += delta;
        reveal = Math.min(1, reveal + delta / 1.9);
      } else if (reducedMotion) {
        reveal = 1;
      }

      updateOpening(delta);
      updateSize();
      draw();
      forceRenderRef.current = false;
      if (!pausedRef.current && !reducedMotion) scheduleRender();
    };

    const scheduleRender = () => {
      if (
        animationFrameRef.current
        || !documentVisible
      ) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };

    requestRenderRef.current = scheduleRender;
    scheduleRender();

''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '      window.removeEventListener("resize", updateSize);',
    '      window.removeEventListener("resize", handleResize);',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '      syncControlledProgressRef.current = () => {};',
    '''      syncControlledProgressRef.current = () => {};
      requestRenderRef.current = () => {};''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''      className={`rupture-shell${fallback ? " is-fallback" : ""}`}
      aria-hidden="true"''',
    '''      className={`rupture-shell${fallback ? " is-fallback" : ""}`}
      data-context-recovery="local"
      data-renderer-id="dither-canvas-rupture"
      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      aria-hidden="true"''',
)
replace_once(
    "src/components/RuptureCanvas.js",
    '''        ref={canvasRef}
        className="rupture-canvas"
        style={{ cursor: "ns-resize" }}''',
    '''        ref={canvasRef}
        className="rupture-canvas"
        data-renderer-id="dither-canvas-rupture"
        aria-hidden="true"
        tabIndex={-1}
        style={{ cursor: "ns-resize" }}''',
)

# Page-level theme and study observability plus compositor discipline.
replace_once(
    "src/components/DitherCanvasPage.js",
    '''      className={`dither-canvas-page dither-study-${activeStudy.id} dither-renderer-${activeStudy.type} rupture-${fieldState} dither-transition-${transitionPhase}${isMorphogenPaintMode ? " dither-morphogen-paint" : ""}`}
      aria-label="Spectral Display dither field lab"''',
    '''      className={`dither-canvas-page dither-study-${activeStudy.id} dither-renderer-${activeStudy.type} rupture-${fieldState} dither-transition-${transitionPhase}${isMorphogenPaintMode ? " dither-morphogen-paint" : ""}`}
      data-active-study={activeStudy.id}
      data-theme-mode={isDark ? "dark" : "light"}
      aria-label="Spectral Display dither field lab"''',
)
replace_once(
    "src/components/DitherScrollNarrative.css",
    '''  transform-origin: center;
  will-change: opacity, transform, filter, clip-path;
}''',
    '''  transform-origin: center;
  will-change: auto;
}''',
)
replace_once(
    "src/components/DitherScrollNarrative.css",
    '''.dither-study-scene.is-exiting {
  pointer-events: none;''',
    '''.dither-study-scene.is-exiting,
.dither-study-scene.is-entering {
  will-change: opacity, transform, filter, clip-path;
}

.dither-study-scene.is-exiting {
  pointer-events: none;''',
)

# Existing tests are updated to pin the runtime policy rather than direct
# context implementation details.
replace_once(
    "src/components/CreatorOSLavaLampCanvas.test.js",
    '    expect(source).toContain("const FRAME_INTERVAL_MS = 1000 / 30;");',
    '''    expect(source).toContain("const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30;");
    expect(source).toContain("getDitherCanvasFrameInterval(");''',
)
replace_once(
    "src/components/CreatorOSLavaLampCanvas.test.js",
    '''    expect(source.match(/getContext\("webgl"/g)).toHaveLength(1);
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('powerPreference: "low-power"');''',
    '''    expect(source).toContain("createDitherCanvasContext({");
    expect(source).toContain('contextType: "webgl"');
    expect(source).toContain("getDitherCanvasSize(");
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('data-context-recovery="local"');''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.test.js",
    '    expect(source).toContain("const FRAME_INTERVAL_MS = 1000 / 30");',
    '''    expect(source).toContain("const PREFERRED_FRAME_INTERVAL_MS = 1000 / 30");
    expect(source).toContain("getDitherCanvasFrameInterval(");''',
)
replace_once(
    "src/components/CreatorOSFieldCanvas.test.js",
    '''    expect(source.match(/getContext\("webgl2"/g)).toHaveLength(1);
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('powerPreference: "low-power"');''',
    '''    expect(source).toContain("createDitherCanvasContext({");
    expect(source).toContain('contextType: "webgl2"');
    expect(source).toContain("getDitherCanvasSize(");
    expect(source).toContain("premultipliedAlpha: true");
    expect(source).toContain('data-context-recovery="local"');''',
)

write(
    "src/components/DitherCanvasRuntimeContract.test.js",
    '''import fs from "fs";
import path from "path";

const source = (name) =>
  fs.readFileSync(path.join(__dirname, name), "utf8");

describe("Dither Field Lab runtime invariants", () => {
  const field = source("CreatorOSFieldCanvas.js");
  const lava = source("CreatorOSLavaLampCanvas.js");
  const rupture = source("RuptureCanvas.js");
  const page = source("DitherCanvasPage.js");
  const narrative = source("DitherScrollNarrative.css");
  const blackHole = source("BlackHoleBackground.js");

  test("every renderer owns local context recovery and a bounded runtime profile", () => {
    [field, lava, rupture].forEach((renderer) => {
      expect(renderer).toContain('data-context-recovery="local"');
      expect(renderer).toContain("ditherCanvasRuntimeProfile.id");
      expect(renderer).toContain("createDitherCanvasContext({");
      expect(renderer).toContain("getDitherCanvasSize(");
      expect(renderer).toContain("getDitherCanvasFrameInterval(");
    });
  });

  test("hidden, paused, and reduced-motion states do not own permanent frame loops", () => {
    [field, lava].forEach((renderer) => {
      expect(renderer).toContain("rafId = 0");
      expect(renderer).toContain("function scheduleFrame()");
      expect(renderer).toContain("if (pausedRef.current && !forceRender");
      expect(renderer).toContain("window.cancelAnimationFrame(rafId)");
    });
    expect(rupture).toContain("const scheduleRender = () =>");
    expect(rupture).toContain("animationFrameRef.current = 0");
    expect(rupture).toContain(
      "if (!pausedRef.current && !reducedMotion) scheduleRender()",
    );
  });

  test("the route mounts one study renderer and never the persistent black hole", () => {
    expect(page).toContain("key={activeStudy.id}");
    expect(page).toContain("{renderActiveStudy()}");
    expect(page).toContain("data-active-study={activeStudy.id}");
    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(blackHole).toContain('"/dither-canvas"');
  });

  test("paint-only shaders compile only for the opt-in paint experience", () => {
    expect(field).toContain("const paintProgramsRequired =");
    expect(field).toContain("paintDisplayProgram = paintProgramsRequired");
    expect(field).toContain("paintReactionProgram = paintProgramsRequired");
    expect(field).toContain("[contextVersion, mode, morphogenExperience]");
  });

  test("full-screen compositor promotion exists only during transitions", () => {
    expect(narrative).toContain("will-change: auto");
    expect(narrative).toContain(
      ".dither-study-scene.is-exiting,\n.dither-study-scene.is-entering",
    );
  });
});
''',
)

# Verify every study receives light and dark mode through its active renderer.
insert_before_last(
    "src/components/DitherCanvasPage.test.js",
    "});",
    '''
  test.each([
    ["Second Surface", "rupture-renderer"],
    ["Metabloom", "creatoros-field-renderer"],
    ["Tidal Weave", "creatoros-field-renderer"],
    ["Moiré Halo", "creatoros-field-renderer"],
    ["Contour Drift", "creatoros-field-renderer"],
    ["Lava Lamp", "creatoros-lava-renderer"],
    ["Morphogen Divide", "creatoros-field-renderer"],
    ["Quasicrystal Chorus", "creatoros-field-renderer"],
    ["Hyperbolic Garden", "creatoros-field-renderer"],
    ["Forward Pass", "creatoros-field-renderer"],
  ])("passes both themes through %s", (studyTitle, rendererTestId) => {
    render(<DitherCanvasPage />);

    if (studyTitle !== "Second Surface") {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(studyTitle) }),
      );
      flushScrollFrame();
      finishStudyTransition();
    }

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-theme-mode",
      "light",
    );
    expect(screen.getByTestId(rendererTestId)).toHaveAttribute(
      "data-theme-mode",
      "light",
    );

    fireEvent.click(screen.getByRole("button", { name: "Use dark mode" }));

    expect(screen.getByRole("main")).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
    expect(screen.getByTestId(rendererTestId)).toHaveAttribute(
      "data-theme-mode",
      "dark",
    );
  });

''',
)

# The built-route smoke must observe either the deliberate fallback or the
# actual field controls, not just an empty route shell.
replace_once(
    "scripts/windows-browser-smoke.mjs",
    '''  {
    route: "/dither-canvas?graphics=webgl",
    markers: ["graphics-fallback-page", "dither-canvas-page"],
  },''',
    '''  {
    route: "/dither-canvas?graphics=webgl",
    markers: [
      "graphics-fallback-page",
      'aria-label="Dither field controls"',
    ],
  },''',
)

# Documentation follows the real implementation.
replace_once(
    "CLAUDE.md",
    '''- CreatorOS-derived fields render at 0.5 CSS resolution, upscale with `image-rendering: pixelated`, use transparent premultiplied alpha over `#080809` / `#fff8f7`, and disable the route's full-screen blur and grain so Bayer cells remain crisp.
- Hidden tabs stop rendering. Reduced-motion users receive one settled static frame. Pause, theme, reset, context restoration, CSS fallback, pointer interaction, and explicit GPU cleanup are required invariants.''',
    '''- CreatorOS-derived fields retain their authored 0.5 CSS resolution on normal desktops, upscale with `image-rendering: pixelated`, use transparent premultiplied alpha over `#080809` / `#fff8f7`, and disable the route's full-screen blur and grain so Bayer cells remain crisp. Windows and mobile drawing buffers are additionally bounded by `ditherCanvasRuntime.js` without changing scene mathematics.
- Every field renderer declares local context recovery so a failed study cannot poison WebGL for the entire session. Windows uses a 600,000-pixel ceiling, a 24fps floor interval, and a high-performance adapter preference with strict-then-relaxed context creation.
- Hidden tabs cancel rendering. Paused and reduced-motion renderers draw only invalidated or settled frames rather than retaining idle animation callbacks. Theme, reset, context restoration, CSS fallback, pointer interaction, and explicit GPU cleanup are required invariants.''',
)

print("Dither Field Lab Windows hardening patch applied successfully.")
