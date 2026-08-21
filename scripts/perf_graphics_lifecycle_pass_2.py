from pathlib import Path
from textwrap import dedent

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
        raise RuntimeError(f"Expected one match in {path}, found {count}")
    write(path, content.replace(old, new, 1))


write(
    "src/utils/rendererOwnership.js",
    dedent(
        '''\
        import { hasHardwareWebGL, isMobileTier } from "./deviceTier";

        export const ORB_BLACK_HOLE_MODE_EVENT = "orbBlackHoleModeChange";
        export const LIVE_BACKGROUND_RENDERER_EVENT =
          "liveBackgroundRendererChange";
        export const LIVE_BACKGROUND_RENDERER_ATTRIBUTE =
          "data-live-background-renderer";

        const liveBackgroundClaims = new Map();

        export const resolveOrbBlackHoleOwnership = ({
          requested = false,
          hardwareWebGL = hasHardwareWebGL,
          mobile = isMobileTier,
        } = {}) => Boolean(requested && hardwareWebGL && !mobile);

        const dispatchOwnershipChange = (active) => {
          if (typeof window === "undefined") return;

          window.dispatchEvent(
            new CustomEvent(ORB_BLACK_HOLE_MODE_EVENT, {
              detail: { active: Boolean(active) },
            }),
          );
        };

        const normalizeRendererId = (rendererId) =>
          String(rendererId || "")
            .trim()
            .replace(/\\s+/g, "-");

        export const getLiveBackgroundRenderers = () =>
          Array.from(liveBackgroundClaims.keys());

        const syncLiveBackgroundOwnership = () => {
          const renderers = getLiveBackgroundRenderers();

          if (typeof document !== "undefined" && document.documentElement) {
            if (renderers.length > 0) {
              document.documentElement.setAttribute(
                LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
                renderers.join(" "),
              );
            } else {
              document.documentElement.removeAttribute(
                LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
              );
            }
          }

          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(LIVE_BACKGROUND_RENDERER_EVENT, {
                detail: {
                  active: renderers.length > 0,
                  renderers,
                },
              }),
            );
          }
        };

        export const releaseLiveBackgroundRenderer = (rendererId) => {
          const id = normalizeRendererId(rendererId);
          if (!id) return false;

          const count = liveBackgroundClaims.get(id) || 0;
          if (count <= 0) return false;

          if (count === 1) {
            liveBackgroundClaims.delete(id);
            syncLiveBackgroundOwnership();
          } else {
            liveBackgroundClaims.set(id, count - 1);
          }

          return true;
        };

        export const claimLiveBackgroundRenderer = (rendererId) => {
          const id = normalizeRendererId(rendererId);
          if (!id) return () => {};

          const count = liveBackgroundClaims.get(id) || 0;
          liveBackgroundClaims.set(id, count + 1);
          if (count === 0) syncLiveBackgroundOwnership();

          let released = false;
          return () => {
            if (released) return;
            released = true;
            releaseLiveBackgroundRenderer(id);
          };
        };

        export const resetLiveBackgroundRenderers = () => {
          const hadClaims = liveBackgroundClaims.size > 0;
          liveBackgroundClaims.clear();

          const hasAttribute = Boolean(
            typeof document !== "undefined" &&
              document.documentElement?.hasAttribute(
                LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
              ),
          );

          if (hadClaims || hasAttribute) syncLiveBackgroundOwnership();
        };

        const installLegacyOwnershipBridge = () => {
          if (typeof window === "undefined") return;

          const descriptor = Object.getOwnPropertyDescriptor(
            window,
            "__bhModeActive",
          );
          if (descriptor && descriptor.configurable === false) return;
          if (descriptor?.get?.__popconOwnershipBridge) return;

          let active = resolveOrbBlackHoleOwnership({
            requested: Boolean(window.__bhModeActive),
          });
          const getActive = () => active;
          getActive.__popconOwnershipBridge = true;

          Object.defineProperty(window, "__bhModeActive", {
            configurable: true,
            enumerable: true,
            get: getActive,
            set(value) {
              const nextActive = resolveOrbBlackHoleOwnership({
                requested: Boolean(value),
              });
              if (nextActive === active) return;
              active = nextActive;
              dispatchOwnershipChange(active);
            },
          });
        };

        installLegacyOwnershipBridge();

        export const isOrbBlackHoleModeActive = () =>
          Boolean(typeof window !== "undefined" && window.__bhModeActive);

        export const setOrbBlackHoleModeActive = (active) => {
          if (typeof window === "undefined") return;

          const nextActive = resolveOrbBlackHoleOwnership({
            requested: Boolean(active),
          });
          const descriptor = Object.getOwnPropertyDescriptor(
            window,
            "__bhModeActive",
          );

          if (descriptor?.get?.__popconOwnershipBridge) {
            window.__bhModeActive = nextActive;
            return;
          }

          const changed = Boolean(window.__bhModeActive) !== nextActive;
          window.__bhModeActive = nextActive;
          if (changed) dispatchOwnershipChange(nextActive);
        };
        '''
    ),
)

write(
    "src/patchResizeObserver.js",
    dedent(
        '''\
        /**
         * Defer ResizeObserver callbacks to one animation frame without allowing
         * continuous notifications to starve the callback. Pending work is always
         * cancelled on disconnect so an unmounted component cannot receive a late
         * resize notification.
         *
         * Must be imported before React / MUI so the patch is in place before any
         * ResizeObserver instances are created.
         */
        if (
          typeof window !== "undefined" &&
          typeof window.ResizeObserver !== "undefined"
        ) {
          const NativeResizeObserver = window.ResizeObserver;

          window.ResizeObserver = class ResizeObserver {
            constructor(callback) {
              this._rafId = 0;
              this._latestArgs = null;
              this._connected = true;
              this._ro = new NativeResizeObserver((...args) => {
                this._latestArgs = args;
                if (this._rafId) return;

                this._rafId = window.requestAnimationFrame(() => {
                  this._rafId = 0;
                  const latestArgs = this._latestArgs;
                  this._latestArgs = null;
                  if (!this._connected || !latestArgs) return;
                  callback(...latestArgs);
                });
              });
            }

            observe(...args) {
              this._connected = true;
              return this._ro.observe(...args);
            }

            unobserve(...args) {
              return this._ro.unobserve(...args);
            }

            disconnect(...args) {
              this._connected = false;
              this._latestArgs = null;
              if (this._rafId) {
                window.cancelAnimationFrame(this._rafId);
                this._rafId = 0;
              }
              return this._ro.disconnect(...args);
            }
          };
        }
        '''
    ),
)

write(
    "src/utils/graphicsContextGovernor.js",
    dedent(
        '''\
        import { recordGraphicsEvent } from "./graphicsPolicy";

        const GOVERNOR_SELECTOR = '[data-graphics-governor="true"]';
        const WEBGL_CONTEXT_NAMES = new Set([
          "webgl",
          "experimental-webgl",
          "webgl2",
        ]);

        let cleanupContextGovernor = null;

        const readPositiveNumber = (value, fallback) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
        };

        const boundedViewportSize = (width, height, maxPixels) => {
          const safeWidth = Math.max(1, Number(width) || 1);
          const safeHeight = Math.max(1, Number(height) || 1);
          const safeMaxPixels = Math.max(1, Number(maxPixels) || 1);
          const pixels = safeWidth * safeHeight;

          if (pixels <= safeMaxPixels) {
            return {
              width: Math.floor(safeWidth),
              height: Math.floor(safeHeight),
            };
          }

          const scale = Math.sqrt(safeMaxPixels / pixels);
          return {
            width: Math.max(1, Math.floor(safeWidth * scale)),
            height: Math.max(1, Math.floor(safeHeight * scale)),
          };
        };

        const governContext = (
          canvas,
          context,
          root,
          setNativeCanvasSize,
        ) => {
          if (!context || context.__popconGraphicsGoverned) return context;

          try {
            Object.defineProperty(context, "__popconGraphicsGoverned", {
              configurable: false,
              enumerable: false,
              value: true,
            });
          } catch (_) {
            return context;
          }

          const maxPixels = readPositiveNumber(
            root.dataset.maxShaderPixels,
            1_000_000,
          );
          const frameInterval = readPositiveNumber(
            root.dataset.shaderFrameInterval,
            1000 / 30,
          );
          const singlePass = root.dataset.graphicsSinglePass === "true";

          const originalViewport = context.viewport?.bind(context);
          if (originalViewport) {
            try {
              context.viewport = (x, y, width, height) => {
                const isFullCanvasViewport =
                  x === 0 &&
                  y === 0 &&
                  width === canvas.width &&
                  height === canvas.height;

                if (!isFullCanvasViewport) {
                  return originalViewport(x, y, width, height);
                }

                const bounded = boundedViewportSize(width, height, maxPixels);
                if (
                  canvas.width !== bounded.width ||
                  canvas.height !== bounded.height
                ) {
                  setNativeCanvasSize(canvas, bounded.width, bounded.height);
                  root.dataset.renderWidth = String(bounded.width);
                  root.dataset.renderHeight = String(bounded.height);
                  recordGraphicsEvent("context-governor-resized", {
                    rendererId: root.dataset.rendererId || "managed-webgl",
                    width: bounded.width,
                    height: bounded.height,
                  });
                }

                return originalViewport(
                  0,
                  0,
                  canvas.width,
                  canvas.height,
                );
              };
            } catch (_) {
              // Some browsers expose non-extensible native context methods.
            }
          }

          if (singlePass && typeof context.drawArrays === "function") {
            const originalDrawArrays = context.drawArrays.bind(context);
            let lastDrawAt = Number.NEGATIVE_INFINITY;

            try {
              context.drawArrays = (...args) => {
                const now =
                  typeof performance !== "undefined" &&
                  typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();

                if (now - lastDrawAt < frameInterval) return undefined;
                lastDrawAt = now;
                return originalDrawArrays(...args);
              };
            } catch (_) {
              // The renderer still retains its pixel and lifecycle controls.
            }
          }

          recordGraphicsEvent("context-governor-attached", {
            rendererId: root.dataset.rendererId || "managed-webgl",
            frameInterval,
            maxPixels,
          });

          return context;
        };

        export const initGraphicsContextGovernor = () => {
          if (
            cleanupContextGovernor ||
            typeof HTMLCanvasElement === "undefined" ||
            !HTMLCanvasElement.prototype.getContext
          ) {
            return cleanupContextGovernor || (() => {});
          }

          const canvasPrototype = HTMLCanvasElement.prototype;
          const originalGetContext = canvasPrototype.getContext;
          const widthDescriptor = Object.getOwnPropertyDescriptor(
            canvasPrototype,
            "width",
          );
          const heightDescriptor = Object.getOwnPropertyDescriptor(
            canvasPrototype,
            "height",
          );
          const requestedCanvasSizes = new WeakMap();

          const canPatchDimensions = Boolean(
            widthDescriptor?.get &&
              widthDescriptor?.set &&
              heightDescriptor?.get &&
              heightDescriptor?.set &&
              widthDescriptor.configurable !== false &&
              heightDescriptor.configurable !== false,
          );

          const setNativeCanvasSize = (canvas, width, height) => {
            if (!widthDescriptor?.set || !heightDescriptor?.set) {
              canvas.width = width;
              canvas.height = height;
              return;
            }

            widthDescriptor.set.call(canvas, width);
            heightDescriptor.set.call(canvas, height);
          };

          const setGovernedDimension = (canvas, dimension, value) => {
            const descriptor =
              dimension === "width" ? widthDescriptor : heightDescriptor;
            const root = canvas.closest?.(GOVERNOR_SELECTOR);

            if (!root || !descriptor?.set) {
              descriptor?.set?.call(canvas, value);
              return;
            }

            const requested = requestedCanvasSizes.get(canvas) || {
              width: widthDescriptor.get.call(canvas),
              height: heightDescriptor.get.call(canvas),
            };
            requested[dimension] = Math.max(
              1,
              Math.floor(Number(value) || 1),
            );
            requestedCanvasSizes.set(canvas, requested);

            const maxPixels = readPositiveNumber(
              root.dataset.maxShaderPixels,
              1_000_000,
            );
            const bounded = boundedViewportSize(
              requested.width,
              requested.height,
              maxPixels,
            );

            if (
              widthDescriptor.get.call(canvas) !== bounded.width ||
              heightDescriptor.get.call(canvas) !== bounded.height
            ) {
              setNativeCanvasSize(canvas, bounded.width, bounded.height);
            }

            root.dataset.renderWidth = String(bounded.width);
            root.dataset.renderHeight = String(bounded.height);
          };

          let governedWidthSetter = null;
          let governedHeightSetter = null;

          if (canPatchDimensions) {
            governedWidthSetter = function setGovernedCanvasWidth(value) {
              setGovernedDimension(this, "width", value);
            };
            governedHeightSetter = function setGovernedCanvasHeight(value) {
              setGovernedDimension(this, "height", value);
            };

            try {
              Object.defineProperty(canvasPrototype, "width", {
                ...widthDescriptor,
                set: governedWidthSetter,
              });
              Object.defineProperty(canvasPrototype, "height", {
                ...heightDescriptor,
                set: governedHeightSetter,
              });
            } catch (_) {
              governedWidthSetter = null;
              governedHeightSetter = null;
              recordGraphicsEvent("context-governor-dimensions-unavailable", {
                reason: "canvas-dimensions-readonly",
              });
            }
          }

          const governedGetContext = function getGovernedContext(
            contextType,
            ...args
          ) {
            const context = originalGetContext.call(this, contextType, ...args);
            if (!WEBGL_CONTEXT_NAMES.has(String(contextType).toLowerCase())) {
              return context;
            }

            const root = this.closest?.(GOVERNOR_SELECTOR);
            return root
              ? governContext(this, context, root, setNativeCanvasSize)
              : context;
          };

          try {
            canvasPrototype.getContext = governedGetContext;
          } catch (_) {
            if (governedWidthSetter && governedHeightSetter) {
              Object.defineProperty(canvasPrototype, "width", widthDescriptor);
              Object.defineProperty(canvasPrototype, "height", heightDescriptor);
            }
            recordGraphicsEvent("context-governor-unavailable", {
              reason: "prototype-readonly",
            });
            return () => {};
          }

          cleanupContextGovernor = () => {
            if (canvasPrototype.getContext === governedGetContext) {
              canvasPrototype.getContext = originalGetContext;
            }

            const currentWidthDescriptor = Object.getOwnPropertyDescriptor(
              canvasPrototype,
              "width",
            );
            const currentHeightDescriptor = Object.getOwnPropertyDescriptor(
              canvasPrototype,
              "height",
            );
            if (
              governedWidthSetter &&
              currentWidthDescriptor?.set === governedWidthSetter
            ) {
              Object.defineProperty(canvasPrototype, "width", widthDescriptor);
            }
            if (
              governedHeightSetter &&
              currentHeightDescriptor?.set === governedHeightSetter
            ) {
              Object.defineProperty(canvasPrototype, "height", heightDescriptor);
            }

            cleanupContextGovernor = null;
          };

          return cleanupContextGovernor;
        };

        export { boundedViewportSize };
        '''
    ),
)

write(
    "src/components/graphicsRuntimeStyle.js",
    dedent(
        '''\
        const STYLE_ID = "graphics-runtime-accessibility-styles";

        const GRAPHICS_RUNTIME_CSS = `
          .parallax-wrapper {
            touch-action: pinch-zoom;
          }

          html[data-live-background-renderer] .background-css-orb,
          html[data-live-background-renderer] .standalone-experience__fallback > span {
            animation-play-state: paused !important;
          }

          .scroll-indicator::before {
            display: none;
          }

          .scroll-indicator::after {
            content: '';
            width: 18px;
            height: 18px;
            border-right: 2px solid rgba(255, 255, 255, 0.92);
            border-bottom: 2px solid rgba(255, 255, 255, 0.92);
            transform: rotate(45deg);
          }
        `;

        if (
          typeof document !== "undefined" &&
          document.head &&
          !document.getElementById(STYLE_ID)
        ) {
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = GRAPHICS_RUNTIME_CSS;
          document.head.appendChild(style);
        }

        export { GRAPHICS_RUNTIME_CSS, STYLE_ID };
        '''
    ),
)

replace_once(
    "src/components/ManagedDitherBackground.js",
    '''import {
  isOrbBlackHoleModeActive,
  ORB_BLACK_HOLE_MODE_EVENT,
} from "../utils/rendererOwnership";''',
    '''import {
  claimLiveBackgroundRenderer,
  isOrbBlackHoleModeActive,
  ORB_BLACK_HOLE_MODE_EVENT,
} from "../utils/rendererOwnership";''',
)

replace_once(
    "src/components/ManagedDitherBackground.js",
    '''    let resizeFrame = 0;
    let settleFrame = 0;
''',
    '''    let resizeFrame = 0;
    let settleFrame = 0;
    const releaseBackgroundOwnership =
      claimLiveBackgroundRenderer(rendererId);
''',
)

replace_once(
    "src/components/ManagedDitherBackground.js",
    '''    recordGraphicsEvent("renderer-mounted", {
      rendererId,
      activeSection,
    });''',
    '''    recordGraphicsEvent("renderer-mounted", { rendererId });''',
)

replace_once(
    "src/components/ManagedDitherBackground.js",
    '''      window.removeEventListener("resize", scheduleBudgetEnforcement);
      recordGraphicsEvent("renderer-unmounted", { rendererId });
    };
  }, [activeSection, rendererId, shouldRender]);''',
    '''      window.removeEventListener("resize", scheduleBudgetEnforcement);
      releaseBackgroundOwnership();
      recordGraphicsEvent("renderer-unmounted", { rendererId });
    };
  }, [rendererId, shouldRender]);''',
)

replace_once(
    "src/components/BlackHoleBackground.js",
    'import { recordGraphicsEvent } from "../utils/graphicsPolicy";\n',
    'import { recordGraphicsEvent } from "../utils/graphicsPolicy";\nimport { claimLiveBackgroundRenderer } from "../utils/rendererOwnership";\n',
)

replace_once(
    "src/components/BlackHoleBackground.js",
    dedent(
        '''\
        const useFixedBackgroundTarget = (enabled) => {
          const [target, setTarget] = React.useState(null);

          React.useEffect(() => {
            if (!enabled) {
              setTarget(null);
              return undefined;
            }

            let frame = 0;
            let observer = null;

            const updateTarget = () => {
              const nextTarget = document.querySelector(".fixed-background");
              setTarget((currentTarget) =>
                currentTarget === nextTarget ? currentTarget : nextTarget,
              );
            };

            updateTarget();
            frame = window.requestAnimationFrame(updateTarget);

            if (typeof MutationObserver !== "undefined") {
              observer = new MutationObserver(updateTarget);
              observer.observe(document.body, { childList: true, subtree: true });
            }

            return () => {
              window.cancelAnimationFrame(frame);
              observer?.disconnect();
            };
          }, [enabled]);

          return target;
        };
        '''
    ),
    dedent(
        '''\
        const useFixedBackgroundTarget = (enabled) => {
          const [target, setTarget] = React.useState(null);

          React.useEffect(() => {
            if (!enabled) {
              setTarget(null);
              return undefined;
            }

            let disposed = false;
            let frame = 0;
            let observer = null;

            const stopObserving = () => {
              observer?.disconnect();
              observer = null;
            };

            const updateTarget = () => {
              frame = 0;
              if (disposed) return null;

              const nextTarget = document.querySelector(".fixed-background");
              setTarget((currentTarget) =>
                currentTarget === nextTarget ? currentTarget : nextTarget,
              );
              if (nextTarget) stopObserving();
              return nextTarget;
            };

            const scheduleTargetCheck = () => {
              if (disposed || frame) return;
              frame = window.requestAnimationFrame(updateTarget);
            };

            const initialTarget = updateTarget();
            if (!initialTarget) {
              if (typeof MutationObserver !== "undefined") {
                observer = new MutationObserver(scheduleTargetCheck);
                observer.observe(document.body, {
                  childList: true,
                  subtree: true,
                });
              }
              scheduleTargetCheck();
            }

            return () => {
              disposed = true;
              window.cancelAnimationFrame(frame);
              stopObserving();
            };
          }, [enabled]);

          return target;
        };
        '''
    ),
)

replace_once(
    "src/components/BlackHoleBackground.js",
    '''    let resizeObserver = null;
    let pipeline = null;
    const reducedMotion = window.matchMedia?.(''',
    '''    let resizeObserver = null;
    let pipeline = null;
    let releaseBackgroundOwnership = null;
    const reducedMotion = window.matchMedia?.(''',
)

replace_once(
    "src/components/BlackHoleBackground.js",
    '''      stopAnimation();
      const schedule = pipeline?.schedule?.id || "uninitialized";''',
    '''      stopAnimation();
      releaseBackgroundOwnership?.();
      releaseBackgroundOwnership = null;
      const schedule = pipeline?.schedule?.id || "uninitialized";''',
)

replace_once(
    "src/components/BlackHoleBackground.js",
    '''    if (!pipeline.initialize()) {
      failRenderer(pipeline.lastError || "initialization-failed");
      return undefined;
    }

    const render = (timestamp) => {''',
    '''    if (!pipeline.initialize()) {
      failRenderer(pipeline.lastError || "initialization-failed");
      return undefined;
    }
    releaseBackgroundOwnership = claimLiveBackgroundRenderer(
      "black-hole-background",
    );

    const render = (timestamp) => {''',
)

replace_once(
    "src/components/BlackHoleBackground.js",
    '''      resizeObserver?.disconnect();
      const schedule = pipeline?.schedule?.id || "uninitialized";
      pipeline?.destroy();''',
    '''      resizeObserver?.disconnect();
      releaseBackgroundOwnership?.();
      releaseBackgroundOwnership = null;
      const schedule = pipeline?.schedule?.id || "uninitialized";
      pipeline?.destroy();''',
)

replace_once(
    "src/components/ParallaxBackground.js",
    '''            zIndex: isActive ? 20 : 10 + index,
          }}''',
    '''            zIndex: isActive ? 20 : 10 + index,
            willChange:
              isActive || index === exitingSectionRef.current
                ? "transform, opacity"
                : "auto",
          }}''',
)

replace_once(
    "src/components/DitherBackground.js",
    '''    const drawParticles = (dt) => {
      if (!px2 || !popCvs) return;
      px2.clearRect(0, 0, popCvs.width, popCvs.height);
      const parts = particlesRef.current;
      if (!parts.length) return;
      const now = performance.now() / 1000;''',
    '''    let particleCanvasDirty = false;
    const drawParticles = (dt) => {
      if (!px2 || !popCvs) return;
      const parts = particlesRef.current;
      if (!parts.length) {
        if (particleCanvasDirty) {
          px2.clearRect(0, 0, popCvs.width, popCvs.height);
          particleCanvasDirty = false;
        }
        return;
      }
      px2.clearRect(0, 0, popCvs.width, popCvs.height);
      particleCanvasDirty = true;
      const now = performance.now() / 1000;''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''function buildBgKernels(W, H, count = 28) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      x: seededRand(i * 3.1) * W,
      y: seededRand(i * 3.7) * H,
      r: 8 + seededRand(i * 4.3) * 10,
      angle: seededRand(i * 2.9) * Math.PI * 2,
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------''',
    '''function buildBgKernels(W, H, count = 28) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      x: seededRand(i * 3.1) * W,
      y: seededRand(i * 3.7) * H,
      r: 8 + seededRand(i * 4.3) * 10,
      angle: seededRand(i * 2.9) * Math.PI * 2,
    });
  }
  return items;
}

export const shiftPopcornGameTimeline = (game, deltaMs) => {
  const offset = Number(deltaMs);
  if (!game || !Number.isFinite(offset) || offset <= 0) return game;

  ["startMs", "lastSpawn", "lastGolden"].forEach((key) => {
    if (Number(game[key]) > 0) game[key] += offset;
  });

  game.particles?.forEach((particle) => {
    if (Number(particle.born) > 0) particle.born += offset;
  });

  game.kernels?.forEach((kernel) => {
    ["spawnedAt", "popStartMs", "poppedAt", "fadeStart"].forEach(
      (key) => {
        if (Number(kernel[key]) > 0) kernel[key] += offset;
      },
    );
  });

  return game;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''const PopcornGame = ({ isActive }) => {
  const { isDark } = useThemeMode();
  const isDarkRef  = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  const canvasRef = useRef(null);''',
    '''const PopcornGame = ({ isActive }) => {
  const { isDark } = useThemeMode();
  const isDarkRef  = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  const [documentVisible, setDocumentVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const runtimeActive = isActive !== false && documentVisible;
  const canvasRef = useRef(null);''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''  const audioCtxRef = useRef(null);
  const musicRef = useRef(null);
  const phaseRef = useRef('idle');''',
    '''  const audioCtxRef = useRef(null);
  const musicRef = useRef(null);
  const phaseRef = useRef('idle');
  const pausedAtRef = useRef(null);''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''  useEffect(() => {
    phaseRef.current = phase;
    G.current.phase = phase;
  }, [phase]);

  // ---------------------------------------------------------------------------
  // Audio context (created on first interaction)''',
    '''  useEffect(() => {
    phaseRef.current = phase;
    G.current.phase = phase;
  }, [phase]);

  useEffect(() => {
    const handleVisibility = () => {
      setDocumentVisible(document.visibilityState !== "hidden");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Audio context (created on first interaction)''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      const g = G.current;''',
    '''  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || rafRef.current) return;
    const ctx = canvas.getContext('2d');

    const loop = (now) => {
      rafRef.current = null;
      const g = G.current;''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''        return false; // 'done'
      });
    };

    rafRef.current = requestAnimationFrame(loop);''',
    '''        return false; // 'done'
      });

      if (g.running || g.particles.length > 0 || g.kernels.length > 0) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''  const startConfettiLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;''',
    '''  const startConfettiLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || confettiRafRef.current) return;''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''      G.current.dpr = dpr;
      G.current.bgKernels = []; // rebuild on resize
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => ro.disconnect();
  }, []);''',
    '''      G.current.dpr = dpr;
      G.current.bgKernels = []; // rebuild on resize
      if (runtimeActive) startLoop();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    return () => ro.disconnect();
  }, [runtimeActive, startLoop]);''',
)

replace_once(
    "src/components/PopcornGame.js",
    '''  // ---------------------------------------------------------------------------
  // Start / stop game loop on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    startLoop();
    return () => {
      stopLoop();
      if (confettiRafRef.current) {
        cancelAnimationFrame(confettiRafRef.current);
        confettiRafRef.current = null;
      }
    };
  }, [startLoop, stopLoop]);

  // ---------------------------------------------------------------------------
  // isActive effect: stop/resume music
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isActive) {
      if (musicRef.current && musicRef.current.running) {
        musicRef.current.stop();
      }
    } else {
      if (G.current.running && musicRef.current && !musicRef.current.running) {
        musicRef.current.resume();
      }
    }
  }, [isActive]);''',
    '''  // ---------------------------------------------------------------------------
  // Runtime ownership: pause hidden work without advancing the game clock
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const now = performance.now();

    if (!runtimeActive) {
      if (pausedAtRef.current === null) pausedAtRef.current = now;
      stopLoop();
      if (confettiRafRef.current) {
        cancelAnimationFrame(confettiRafRef.current);
        confettiRafRef.current = null;
      }
      if (musicRef.current?.running) musicRef.current.stop();
      return undefined;
    }

    if (pausedAtRef.current !== null) {
      shiftPopcornGameTimeline(G.current, now - pausedAtRef.current);
      pausedAtRef.current = null;
    }

    if (phaseRef.current === "gameover" && G.current.confetti.length > 0) {
      startConfettiLoop();
    } else {
      startLoop();
    }

    if (G.current.running && musicRef.current && !musicRef.current.running) {
      musicRef.current.resume();
    }

    return undefined;
  }, [runtimeActive, startConfettiLoop, startLoop, stopLoop]);

  useEffect(() => {
    if (runtimeActive) startLoop();
  }, [isDark, runtimeActive, startLoop]);

  useEffect(
    () => () => {
      stopLoop();
      if (confettiRafRef.current) {
        cancelAnimationFrame(confettiRafRef.current);
        confettiRafRef.current = null;
      }
      musicRef.current?.stop();
      const closeResult = audioCtxRef.current?.close?.();
      closeResult?.catch?.(() => {});
      audioCtxRef.current = null;
      musicRef.current = null;
    },
    [stopLoop],
  );''',
)

replace_once(
    "src/utils/rendererOwnership.test.js",
    '''import {
  isOrbBlackHoleModeActive,
  ORB_BLACK_HOLE_MODE_EVENT,
  resolveOrbBlackHoleOwnership,
  setOrbBlackHoleModeActive,
} from "./rendererOwnership";''',
    '''import {
  claimLiveBackgroundRenderer,
  getLiveBackgroundRenderers,
  isOrbBlackHoleModeActive,
  LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
  LIVE_BACKGROUND_RENDERER_EVENT,
  ORB_BLACK_HOLE_MODE_EVENT,
  resetLiveBackgroundRenderers,
  resolveOrbBlackHoleOwnership,
  setOrbBlackHoleModeActive,
} from "./rendererOwnership";''',
)

replace_once(
    "src/utils/rendererOwnership.test.js",
    '''  beforeEach(() => {
    setOrbBlackHoleModeActive(false);
  });

  afterEach(() => {
    setOrbBlackHoleModeActive(false);
  });''',
    '''  beforeEach(() => {
    setOrbBlackHoleModeActive(false);
    resetLiveBackgroundRenderers();
  });

  afterEach(() => {
    setOrbBlackHoleModeActive(false);
    resetLiveBackgroundRenderers();
  });''',
)

replace_once(
    "src/utils/rendererOwnership.test.js",
    '''  test("does not emit duplicate ownership events for the same state", () => {
    const listener = jest.fn();
    window.addEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);

    setOrbBlackHoleModeActive(true);
    setOrbBlackHoleModeActive(true);

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);
  });
});''',
    '''  test("does not emit duplicate ownership events for the same state", () => {
    const listener = jest.fn();
    window.addEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);

    setOrbBlackHoleModeActive(true);
    setOrbBlackHoleModeActive(true);

    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(ORB_BLACK_HOLE_MODE_EVENT, listener);
  });

  test("reference-counts live background ownership and releases idempotently", () => {
    const listener = jest.fn();
    window.addEventListener(LIVE_BACKGROUND_RENDERER_EVENT, listener);

    const releaseFirst = claimLiveBackgroundRenderer("main-dither");
    const releaseSecond = claimLiveBackgroundRenderer("main-dither");

    expect(getLiveBackgroundRenderers()).toEqual(["main-dither"]);
    expect(document.documentElement).toHaveAttribute(
      LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
      "main-dither",
    );
    expect(listener).toHaveBeenCalledTimes(1);

    releaseFirst();
    releaseFirst();
    expect(getLiveBackgroundRenderers()).toEqual(["main-dither"]);
    expect(listener).toHaveBeenCalledTimes(1);

    releaseSecond();
    expect(getLiveBackgroundRenderers()).toEqual([]);
    expect(document.documentElement).not.toHaveAttribute(
      LIVE_BACKGROUND_RENDERER_ATTRIBUTE,
    );
    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener(LIVE_BACKGROUND_RENDERER_EVENT, listener);
  });
});''',
)

replace_once(
    "src/components/ManagedDitherBackground.test.js",
    'import ManagedDitherBackground from "./ManagedDitherBackground";\n',
    '''import ManagedDitherBackground from "./ManagedDitherBackground";
import {
  getLiveBackgroundRenderers,
  resetLiveBackgroundRenderers,
} from "../utils/rendererOwnership";
''',
)

replace_once(
    "src/components/ManagedDitherBackground.test.js",
    '''    window.__bhModeActive = false;
    setVisibility("visible");
    setReducedMotion(false);''',
    '''    window.__bhModeActive = false;
    resetLiveBackgroundRenderers();
    setVisibility("visible");
    setReducedMotion(false);''',
)

replace_once(
    "src/components/ManagedDitherBackground.test.js",
    '''    cleanup();
    window.__bhModeActive = false;
    setVisibility("visible");''',
    '''    cleanup();
    window.__bhModeActive = false;
    resetLiveBackgroundRenderers();
    setVisibility("visible");''',
)

replace_once(
    "src/components/ManagedDitherBackground.test.js",
    '''  test("unmounts the renderer while the document is hidden", () => {''',
    '''  test("claims live ownership only while its renderer is running", () => {
    const { rerender } = render(
      <ManagedDitherBackground
        enabled={true}
        rendererId="main-dither"
      />,
    );

    expect(getLiveBackgroundRenderers()).toEqual(["main-dither"]);
    expect(document.documentElement).toHaveAttribute(
      "data-live-background-renderer",
      "main-dither",
    );

    rerender(
      <ManagedDitherBackground
        enabled={false}
        rendererId="main-dither"
      />,
    );

    expect(getLiveBackgroundRenderers()).toEqual([]);
    expect(document.documentElement).not.toHaveAttribute(
      "data-live-background-renderer",
    );
  });

  test("unmounts the renderer while the document is hidden", () => {''',
)

replace_once(
    "src/components/BlackHoleBackground.test.js",
    '''    expect(componentSource).toContain("new BlackHolePipeline");''',
    '''    expect(componentSource).toContain("new BlackHolePipeline");
    expect(componentSource).toContain("claimLiveBackgroundRenderer");
    expect(componentSource).toContain("if (nextTarget) stopObserving()");''',
)

replace_once(
    "src/utils/graphicsContextGovernor.test.js",
    '''  test("caps a managed single-pass context at the configured frame interval", () => {''',
    '''  test("bounds governed backing stores before context creation", () => {
    cleanupGovernor = initGraphicsContextGovernor();

    const root = document.createElement("div");
    root.dataset.graphicsGovernor = "true";
    root.dataset.maxShaderPixels = "600000";
    const canvas = document.createElement("canvas");
    const particleCanvas = document.createElement("canvas");
    root.append(canvas, particleCanvas);
    document.body.appendChild(root);

    canvas.width = 3840;
    canvas.height = 2160;
    particleCanvas.width = 3840;
    particleCanvas.height = 2160;

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(600_000);
    expect(particleCanvas.width * particleCanvas.height).toBeLessThanOrEqual(
      600_000,
    );
    expect(canvas.width / canvas.height).toBeCloseTo(16 / 9, 2);
    expect(root.dataset.renderWidth).toBe(String(particleCanvas.width));
    expect(root.dataset.renderHeight).toBe(String(particleCanvas.height));

    const unmanaged = document.createElement("canvas");
    document.body.appendChild(unmanaged);
    unmanaged.width = 3840;
    unmanaged.height = 2160;
    expect(unmanaged.width).toBe(3840);
    expect(unmanaged.height).toBe(2160);
  });

  test("caps a managed single-pass context at the configured frame interval", () => {''',
)

write(
    "src/patchResizeObserver.test.js",
    dedent(
        '''\
        describe("ResizeObserver animation-frame patch", () => {
          let originalResizeObserver;
          let originalRequestAnimationFrame;
          let originalCancelAnimationFrame;
          let nativeCallback;
          let nativeDisconnect;
          let frames;
          let nextFrameId;

          beforeEach(() => {
            jest.resetModules();
            originalResizeObserver = window.ResizeObserver;
            originalRequestAnimationFrame = window.requestAnimationFrame;
            originalCancelAnimationFrame = window.cancelAnimationFrame;
            nativeCallback = null;
            nativeDisconnect = jest.fn();
            frames = new Map();
            nextFrameId = 1;

            class NativeResizeObserver {
              constructor(callback) {
                nativeCallback = callback;
              }

              observe() {}

              unobserve() {}

              disconnect(...args) {
                return nativeDisconnect(...args);
              }
            }

            window.ResizeObserver = NativeResizeObserver;
            window.requestAnimationFrame = jest.fn((callback) => {
              const id = nextFrameId;
              nextFrameId += 1;
              frames.set(id, callback);
              return id;
            });
            window.cancelAnimationFrame = jest.fn((id) => {
              frames.delete(id);
            });

            jest.isolateModules(() => {
              require("./patchResizeObserver");
            });
          });

          afterEach(() => {
            window.ResizeObserver = originalResizeObserver;
            window.requestAnimationFrame = originalRequestAnimationFrame;
            window.cancelAnimationFrame = originalCancelAnimationFrame;
          });

          test("coalesces repeated notifications without starving the callback", () => {
            const callback = jest.fn();
            new window.ResizeObserver(callback);

            nativeCallback(["first"], { id: 1 });
            nativeCallback(["latest"], { id: 2 });

            expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
            const frame = Array.from(frames.values())[0];
            frame();

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(["latest"], { id: 2 });
          });

          test("cancels pending callbacks when disconnected", () => {
            const callback = jest.fn();
            const observer = new window.ResizeObserver(callback);

            nativeCallback(["pending"], { id: 1 });
            const frame = Array.from(frames.values())[0];
            observer.disconnect();
            frame();

            expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
            expect(nativeDisconnect).toHaveBeenCalledTimes(1);
            expect(callback).not.toHaveBeenCalled();
          });
        });
        '''
    ),
)

write(
    "src/components/graphicsRuntimeStyle.test.js",
    dedent(
        '''\
        import { GRAPHICS_RUNTIME_CSS } from "./graphicsRuntimeStyle";

        describe("graphics runtime styles", () => {
          test("pauses CSS fallback motion while a live background owns the frame", () => {
            expect(GRAPHICS_RUNTIME_CSS).toContain(
              "html[data-live-background-renderer] .background-css-orb",
            );
            expect(GRAPHICS_RUNTIME_CSS).toContain(
              "html[data-live-background-renderer] .standalone-experience__fallback > span",
            );
            expect(GRAPHICS_RUNTIME_CSS).toContain(
              "animation-play-state: paused !important",
            );
          });
        });
        '''
    ),
)

write(
    "src/components/PopcornGame.lifecycle.test.js",
    dedent(
        '''\
        import fs from "fs";
        import path from "path";
        import { shiftPopcornGameTimeline } from "./PopcornGame";

        describe("PopcornGame runtime ownership", () => {
          const source = fs.readFileSync(
            path.join(process.cwd(), "src/components/PopcornGame.js"),
            "utf8",
          );

          test("shifts all wall-clock state when a hidden game resumes", () => {
            const game = {
              startMs: 100,
              lastSpawn: 200,
              lastGolden: 300,
              particles: [{ born: 400 }],
              kernels: [
                {
                  spawnedAt: 500,
                  popStartMs: 600,
                  poppedAt: 700,
                  fadeStart: 800,
                },
              ],
            };

            expect(shiftPopcornGameTimeline(game, 250)).toBe(game);
            expect(game).toEqual({
              startMs: 350,
              lastSpawn: 450,
              lastGolden: 550,
              particles: [{ born: 650 }],
              kernels: [
                {
                  spawnedAt: 750,
                  popStartMs: 850,
                  poppedAt: 950,
                  fadeStart: 1050,
                },
              ],
            });
          });

          test("does not run an offscreen or hidden canvas loop", () => {
            expect(source).toContain(
              "const runtimeActive = isActive !== false && documentVisible;",
            );
            expect(source).toContain("if (!runtimeActive) {");
            expect(source).toContain("stopLoop();");
            expect(source).toContain("if (!canvas || rafRef.current) return;");
          });

          test("renders the idle canvas once instead of looping forever", () => {
            expect(source).toContain(
              "if (g.running || g.particles.length > 0 || g.kernels.length > 0)",
            );
          });
        });
        '''
    ),
)

print("Graphics lifecycle optimization patch applied successfully.")
