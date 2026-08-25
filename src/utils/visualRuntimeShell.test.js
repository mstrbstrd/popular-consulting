import { WEBGL_DISABLED_SESSION_KEY } from "./graphicsPolicy";
import { VisualRuntimeShell } from "./visualRuntimeShell";

const createGl = () => {
  const loseContext = jest.fn();
  return {
    FRAMEBUFFER: 36160,
    SCISSOR_TEST: 3089,
    DEPTH_TEST: 2929,
    STENCIL_TEST: 2960,
    BLEND: 3042,
    COLOR_BUFFER_BIT: 16384,
    RGBA8: 32856,
    RGBA: 6408,
    UNSIGNED_BYTE: 5121,
    LINEAR: 9729,
    TEXTURE_2D: 3553,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    CLAMP_TO_EDGE: 33071,
    COLOR_ATTACHMENT0: 36064,
    FRAMEBUFFER_COMPLETE: 36053,
    bindFramebuffer: jest.fn(),
    disable: jest.fn(),
    colorMask: jest.fn(),
    clearColor: jest.fn(),
    viewport: jest.fn(),
    clear: jest.fn(),
    createTexture: jest.fn(() => ({})),
    createFramebuffer: jest.fn(() => ({})),
    bindTexture: jest.fn(),
    texParameteri: jest.fn(),
    texImage2D: jest.fn(),
    framebufferTexture2D: jest.fn(),
    checkFramebufferStatus: jest.fn(() => 36053),
    deleteTexture: jest.fn(),
    deleteFramebuffer: jest.fn(),
    getExtension: jest.fn((name) =>
      name === "WEBGL_lose_context" ? { loseContext } : null,
    ),
    loseContext,
  };
};

const installBrowserMocks = (gl) => {
  const frames = new Map();
  let nextFrameId = 1;
  const motionListeners = new Set();
  const motionQuery = {
    matches: false,
    addEventListener: (_name, listener) =>
      motionListeners.add(listener),
    removeEventListener: (_name, listener) =>
      motionListeners.delete(listener),
  };

  jest
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    });
  jest
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id) => frames.delete(id));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: jest.fn(() => motionQuery),
  });
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: class MockResizeObserver {
      observe() {}
      disconnect() {}
    },
  });
  jest
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation((type) => (type === "webgl2" ? gl : null));

  return {
    flushFrame: (timestamp = 16) => {
      const pending = Array.from(frames.values());
      frames.clear();
      pending.forEach((callback) => callback(timestamp));
    },
    pendingFrames: () => frames.size,
  };
};

const createSurface = () => {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  host.appendChild(canvas);
  document.body.appendChild(host);
  return { host, canvas };
};

describe("persistent visual runtime shell", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.sessionStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("owns exactly one context, one claim, and one settling scheduler", () => {
    const gl = createGl();
    const browser = installBrowserMocks(gl);
    const { host, canvas } = createSurface();
    const releaseOwnership = jest.fn();
    const claimOwnership = jest.fn(() => releaseOwnership);
    const shell = new VisualRuntimeShell({
      host,
      canvas,
      claimOwnership,
    });

    expect(shell.initialize()).toBe(true);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith(
      "webgl2",
      expect.objectContaining({
        antialias: false,
        powerPreference: "high-performance",
      }),
    );
    expect(claimOwnership).toHaveBeenCalledTimes(1);
    expect(browser.pendingFrames()).toBe(1);

    browser.flushFrame(16);
    expect(browser.pendingFrames()).toBe(0);
    expect(shell.report()).toMatchObject({
      state: "idle",
      frameCount: 1,
      ownershipClaimed: true,
      context: {
        attempts: 1,
        count: 1,
        lost: false,
        type: "webgl2",
      },
      scheduler: {
        state: "idle",
        frameScheduled: false,
      },
    });

    shell.dispose();
    expect(releaseOwnership).toHaveBeenCalledTimes(1);
    expect(gl.loseContext).toHaveBeenCalledTimes(1);
  });

  test("quarantines a failed pass without disabling healthy passes", () => {
    const gl = createGl();
    const browser = installBrowserMocks(gl);
    const { host, canvas } = createSurface();
    const shell = new VisualRuntimeShell({
      host,
      canvas,
      claimOwnership: () => () => {},
    });
    shell.initialize();
    browser.flushFrame(16);

    const healthyRender = jest.fn(() => ({ continue: false }));
    shell.registerPass({
      id: "broken-pass",
      order: 1,
      render: () => {
        throw new Error("pass exploded");
      },
    });
    shell.registerPass({
      id: "healthy-pass",
      order: 2,
      render: healthyRender,
    });
    browser.flushFrame(32);

    expect(healthyRender).toHaveBeenCalledTimes(1);
    expect(shell.report()).toMatchObject({
      state: "idle",
      passes: [
        expect.objectContaining({
          id: "broken-pass",
          failed: true,
        }),
        expect.objectContaining({
          id: "healthy-pass",
          failed: false,
        }),
      ],
    });
    shell.dispose();
  });

  test("recovers locally without poisoning WebGL for the session", () => {
    const gl = createGl();
    const browser = installBrowserMocks(gl);
    const { host, canvas } = createSurface();
    const shell = new VisualRuntimeShell({
      host,
      canvas,
      claimOwnership: () => () => {},
    });
    shell.initialize();
    browser.flushFrame(16);

    const lostEvent = new Event("webglcontextlost", {
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(lostEvent);

    expect(lostEvent.defaultPrevented).toBe(true);
    expect(shell.report()).toMatchObject({
      state: "context-lost",
      context: { count: 1, lost: true },
    });
    expect(
      window.sessionStorage.getItem(WEBGL_DISABLED_SESSION_KEY),
    ).toBeNull();

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1);
    expect(browser.pendingFrames()).toBe(1);
    browser.flushFrame(32);
    expect(shell.report()).toMatchObject({
      state: "idle",
      context: { count: 1, lost: false },
    });
    shell.dispose();
  });
});
