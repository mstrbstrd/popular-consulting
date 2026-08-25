import { recordGraphicsEvent } from "./graphicsPolicy";
import { claimLiveBackgroundRenderer } from "./rendererOwnership";
import { VisualRuntimeRenderTargetPool } from "./visualRuntimeRenderTargetPool";
import { createVisualRuntimeResizeAuthority } from "./visualRuntimeResizeAuthority";
import { createVisualRuntimeScheduler } from "./visualRuntimeScheduler";

export const VISUAL_RUNTIME_SHELL_RENDERER_ID =
  "optimized-visual-runtime-shell";
export const VISUAL_RUNTIME_SHELL_FAILURE_EVENT =
  "visualRuntimeShellFailure";
export const VISUAL_RUNTIME_SHELL_STATE_EVENT =
  "visualRuntimeShellStateChange";
export const VISUAL_RUNTIME_SHELL_SCHEMA_VERSION = 1;

const CONTEXT_OPTIONS = Object.freeze({
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: false,
});

const normalizePassId = (value) =>
  String(value || "").trim().replace(/\s+/g, "-").slice(0, 80);

const serializeError = (error) => ({
  name: String(error?.name || "Error").slice(0, 80),
  message: String(
    error?.message || error || "unknown error",
  ).slice(0, 240),
});

export class VisualRuntimeShell {
  constructor({
    host,
    canvas,
    windowObject = typeof window === "undefined" ? null : window,
    documentObject = typeof document === "undefined" ? null : document,
    rendererId = VISUAL_RUNTIME_SHELL_RENDERER_ID,
    maxDevicePixelRatio = 1.5,
    maxPixels = 1_000_000,
    claimOwnership = claimLiveBackgroundRenderer,
  } = {}) {
    if (!windowObject || !documentObject || !host || !canvas) {
      throw new Error(
        "visual runtime shell requires window, document, host, and canvas",
      );
    }

    this.windowObject = windowObject;
    this.documentObject = documentObject;
    this.host = host;
    this.canvas = canvas;
    this.rendererId =
      normalizePassId(rendererId) || VISUAL_RUNTIME_SHELL_RENDERER_ID;
    this.maxDevicePixelRatio = maxDevicePixelRatio;
    this.maxPixels = maxPixels;
    this.claimOwnership = claimOwnership;
    this.releaseOwnership = null;
    this.gl = null;
    this.scheduler = null;
    this.resizeAuthority = null;
    this.renderTargetPool = null;
    this.passes = new Map();
    this.state = "created";
    this.contextAttemptCount = 0;
    this.contextCount = 0;
    this.frameCount = 0;
    this.contextLost = false;
    this.initialized = false;
    this.disposed = false;
    this.lastError = null;
    this.lastSize = null;
    this.theme = "light";
    this.section = 0;
    this.handleContextLost = this.handleContextLost.bind(this);
    this.handleContextRestored =
      this.handleContextRestored.bind(this);
  }

  setState(nextState) {
    if (this.state === nextState) return;
    this.state = nextState;
    this.host.dataset.visualRuntimeShellState = nextState;
    this.canvas.dataset.visualRuntimeShellState = nextState;
    this.host.dataset.visualRuntimeShellContexts = String(
      this.contextCount,
    );
    this.host.dataset.visualRuntimeShellCanvases = "1";

    this.windowObject.dispatchEvent?.(
      new this.windowObject.CustomEvent(
        VISUAL_RUNTIME_SHELL_STATE_EVENT,
        {
          detail: {
            rendererId: this.rendererId,
            state: nextState,
          },
        },
      ),
    );
  }

  createContext() {
    this.contextAttemptCount += 1;
    const gl = this.canvas.getContext("webgl2", CONTEXT_OPTIONS);
    if (!gl) return null;
    this.contextCount = 1;
    return gl;
  }

  configureContext() {
    const gl = this.gl;
    if (!gl) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 0);
    gl.viewport(
      0,
      0,
      this.canvas.width || 1,
      this.canvas.height || 1,
    );
  }

  initialize() {
    if (this.initialized || this.disposed) return false;
    this.initialized = true;
    this.setState("initializing");

    try {
      this.gl = this.createContext();
      if (!this.gl) {
        this.fail("context-unavailable");
        return false;
      }

      this.releaseOwnership = this.claimOwnership(this.rendererId);
      this.renderTargetPool = new VisualRuntimeRenderTargetPool(this.gl);
      this.scheduler = createVisualRuntimeScheduler({
        windowObject: this.windowObject,
        documentObject: this.documentObject,
        onFrame: (frame) => this.renderFrame(frame),
        onError: (error) => this.fail("frame-error", error),
        onStateChange: (state) => {
          if (
            !this.contextLost &&
            this.state !== "failed" &&
            this.state !== "disposed"
          ) {
            this.setState(state);
          }
        },
      });
      this.resizeAuthority = createVisualRuntimeResizeAuthority({
        windowObject: this.windowObject,
        host: this.host,
        canvas: this.canvas,
        maxDevicePixelRatio: this.maxDevicePixelRatio,
        maxPixels: this.maxPixels,
        onInvalidate: (reason) => this.scheduler.invalidate(reason),
        onResize: (size) => this.notifyPassesOfResize(size),
      });

      this.canvas.addEventListener(
        "webglcontextlost",
        this.handleContextLost,
        false,
      );
      this.canvas.addEventListener(
        "webglcontextrestored",
        this.handleContextRestored,
        false,
      );

      this.configureContext();
      this.scheduler.start();
      this.resizeAuthority.start();
      this.scheduler.invalidate("initial-mount");
      recordGraphicsEvent("visual-runtime-shell-mounted", {
        rendererId: this.rendererId,
        mode: "probe",
        maxPixels: this.maxPixels,
      });
      return true;
    } catch (error) {
      this.fail("initialization-error", error);
      return false;
    }
  }

  setTheme(theme) {
    const nextTheme = theme === "dark" ? "dark" : "light";
    if (this.theme === nextTheme) return false;
    this.theme = nextTheme;
    this.invalidate("theme-change");
    return true;
  }

  setSection(section) {
    const nextSection = Number(section);
    if (!Number.isInteger(nextSection) || nextSection < 0) {
      return false;
    }
    if (this.section === nextSection) return false;
    this.section = nextSection;
    this.invalidate("section-change");
    return true;
  }

  notifyPassesOfResize(size) {
    this.lastSize = size;
    this.passes.forEach((pass) => {
      if (pass.failed || typeof pass.resize !== "function") return;
      try {
        pass.resize({
          gl: this.gl,
          size,
          renderTargets: this.renderTargetPool,
        });
      } catch (error) {
        this.failPass(pass, error, "resize-error");
      }
    });
  }

  renderFrame(frame) {
    if (!this.gl || this.contextLost || this.disposed) {
      return { continue: false };
    }

    const size = this.resizeAuthority.sync();
    if (!size) return { continue: false };
    this.lastSize = size;
    this.configureContext();
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    let shouldContinue = false;
    const orderedPasses = Array.from(this.passes.values())
      .filter((pass) => !pass.failed)
      .sort((left, right) => left.order - right.order);

    orderedPasses.forEach((pass) => {
      this.configureContext();
      try {
        const result = pass.render({
          ...frame,
          gl: this.gl,
          canvas: this.canvas,
          size,
          theme: this.theme,
          section: this.section,
          renderTargets: this.renderTargetPool,
        });
        shouldContinue = Boolean(result?.continue) || shouldContinue;
      } catch (error) {
        this.failPass(pass, error, "render-error");
        this.configureContext();
      }
    });

    this.frameCount += 1;
    this.canvas.dataset.completedFrames = String(this.frameCount);
    this.host.dataset.completedFrames = String(this.frameCount);
    return { continue: shouldContinue };
  }

  registerPass(candidate) {
    if (this.disposed) {
      throw new Error("visual runtime shell is disposed");
    }
    const id = normalizePassId(candidate?.id);
    if (!id) throw new Error("visual runtime pass id is required");
    if (typeof candidate?.render !== "function") {
      throw new Error(`visual runtime pass ${id} requires render()`);
    }
    if (this.passes.has(id)) {
      throw new Error(
        `visual runtime pass ${id} is already registered`,
      );
    }

    const pass = {
      id,
      order: Number.isFinite(Number(candidate.order))
        ? Number(candidate.order)
        : 0,
      render: candidate.render,
      resize: candidate.resize,
      dispose: candidate.dispose,
      failed: false,
      lastError: null,
    };
    this.passes.set(id, pass);

    if (this.lastSize && typeof pass.resize === "function") {
      try {
        pass.resize({
          gl: this.gl,
          size: this.lastSize,
          renderTargets: this.renderTargetPool,
        });
      } catch (error) {
        this.failPass(pass, error, "resize-error");
      }
    }

    this.scheduler?.invalidate(`pass-registered:${id}`);
    return () => this.unregisterPass(id);
  }

  unregisterPass(passId) {
    const id = normalizePassId(passId);
    const pass = this.passes.get(id);
    if (!pass) return false;
    this.passes.delete(id);
    try {
      pass.dispose?.({
        gl: this.gl,
        renderTargets: this.renderTargetPool,
      });
    } catch (_) {
      // A pass is already isolated from the remaining runtime.
    }
    this.scheduler?.invalidate(`pass-unregistered:${id}`);
    return true;
  }

  failPass(pass, error, phase) {
    pass.failed = true;
    pass.lastError = serializeError(error);
    try {
      pass.dispose?.({
        gl: this.gl,
        renderTargets: this.renderTargetPool,
      });
    } catch (_) {
      // The failed pass remains quarantined.
    }
    recordGraphicsEvent("visual-runtime-shell-pass-failed", {
      rendererId: this.rendererId,
      passId: pass.id,
      phase,
      message: pass.lastError.message,
    });
  }

  handleContextLost(event) {
    event.preventDefault();
    if (this.disposed) return;
    this.contextLost = true;
    this.renderTargetPool?.abandon();
    this.scheduler?.suspend("context-lost");
    this.setState("context-lost");
    recordGraphicsEvent("visual-runtime-shell-context-lost", {
      rendererId: this.rendererId,
    });
    this.windowObject.dispatchEvent?.(
      new this.windowObject.CustomEvent(
        VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
        {
          detail: {
            rendererId: this.rendererId,
            reason: "context-lost",
            recoverable: true,
          },
        },
      ),
    );
  }

  handleContextRestored() {
    if (this.disposed || !this.gl) return;
    this.contextLost = false;
    this.renderTargetPool = new VisualRuntimeRenderTargetPool(
      this.gl,
    );
    this.configureContext();
    const restoredSize =
      this.lastSize || this.resizeAuthority?.measure?.() || null;
    if (restoredSize) this.notifyPassesOfResize(restoredSize);
    this.setState("ready");
    this.scheduler?.resume("context-lost");
    recordGraphicsEvent("visual-runtime-shell-context-restored", {
      rendererId: this.rendererId,
    });
  }

  fail(reason, error = null) {
    if (this.disposed || this.state === "failed") return;
    this.lastError = {
      reason: String(reason || "runtime-failure").slice(0, 120),
      error: error ? serializeError(error) : null,
    };
    this.scheduler?.suspend(`failed:${this.lastError.reason}`);
    this.renderTargetPool?.abandon();
    this.releaseOwnership?.();
    this.releaseOwnership = null;
    this.canvas.style.visibility = "hidden";
    this.setState("failed");
    recordGraphicsEvent("visual-runtime-shell-failed", {
      rendererId: this.rendererId,
      reason: this.lastError.reason,
      message: this.lastError.error?.message || "",
    });
    this.windowObject.dispatchEvent?.(
      new this.windowObject.CustomEvent(
        VISUAL_RUNTIME_SHELL_FAILURE_EVENT,
        {
          detail: {
            rendererId: this.rendererId,
            reason: this.lastError.reason,
            recoverable: false,
          },
        },
      ),
    );
  }

  invalidate(reason = "external") {
    return this.scheduler?.invalidate(reason) || false;
  }

  report() {
    return {
      schemaVersion: VISUAL_RUNTIME_SHELL_SCHEMA_VERSION,
      rendererId: this.rendererId,
      mode: "probe",
      state: this.state,
      initialized: this.initialized,
      disposed: this.disposed,
      theme: this.theme,
      section: this.section,
      ownershipClaimed: Boolean(this.releaseOwnership),
      context: {
        attempts: this.contextAttemptCount,
        count: this.contextCount,
        lost: this.contextLost,
        type: this.gl ? "webgl2" : null,
      },
      canvas: {
        width: Number(this.canvas.width) || 0,
        height: Number(this.canvas.height) || 0,
        cssWidth:
          Number(this.canvas.getBoundingClientRect?.().width) || 0,
        cssHeight:
          Number(this.canvas.getBoundingClientRect?.().height) || 0,
      },
      frameCount: this.frameCount,
      passes: Array.from(this.passes.values()).map((pass) => ({
        id: pass.id,
        order: pass.order,
        failed: pass.failed,
        lastError: pass.lastError,
      })),
      scheduler: this.scheduler?.snapshot() || null,
      resize: this.resizeAuthority?.snapshot() || null,
      renderTargets: this.renderTargetPool?.snapshot() || null,
      lastError: this.lastError,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener(
      "webglcontextlost",
      this.handleContextLost,
    );
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.handleContextRestored,
    );
    this.scheduler?.dispose();
    this.resizeAuthority?.dispose();
    Array.from(this.passes.keys()).forEach((id) =>
      this.unregisterPass(id),
    );
    this.renderTargetPool?.dispose();
    this.releaseOwnership?.();
    this.releaseOwnership = null;

    try {
      this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch (_) {
      // The context may already be lost or reclaimed.
    }

    this.setState("disposed");
    this.gl = null;
    recordGraphicsEvent("visual-runtime-shell-disposed", {
      rendererId: this.rendererId,
    });
  }
}
