import { createVisualRuntimeScheduler } from "./visualRuntimeScheduler";

const createEnvironment = ({ reducedMotion = false } = {}) => {
  const frames = new Map();
  const documentListeners = new Map();
  const motionListeners = new Set();
  let nextFrameId = 1;
  const motionQuery = {
    matches: reducedMotion,
    addEventListener: (_name, listener) => motionListeners.add(listener),
    removeEventListener: (_name, listener) => motionListeners.delete(listener),
  };
  const documentObject = {
    visibilityState: "visible",
    addEventListener: (name, listener) =>
      documentListeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (documentListeners.get(name) === listener) {
        documentListeners.delete(name);
      }
    },
  };
  const windowObject = {
    requestAnimationFrame: (callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    matchMedia: () => motionQuery,
  };

  return {
    documentObject,
    windowObject,
    flushFrame: (timestamp = 16) => {
      const pending = Array.from(frames.entries());
      frames.clear();
      pending.forEach(([, callback]) => callback(timestamp));
    },
    pendingFrames: () => frames.size,
    setVisible: (visible) => {
      documentObject.visibilityState = visible ? "visible" : "hidden";
      documentListeners.get("visibilitychange")?.();
    },
  };
};

describe("visual runtime scheduler", () => {
  test("coalesces invalidations into one frame and returns to idle", () => {
    const environment = createEnvironment();
    const onFrame = jest.fn(() => ({ continue: false }));
    const scheduler = createVisualRuntimeScheduler({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
      onFrame,
    });

    scheduler.start();
    scheduler.invalidate("theme");
    scheduler.invalidate("pointer");

    expect(environment.pendingFrames()).toBe(1);
    environment.flushFrame(20);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        reasons: ["theme", "pointer"],
        frameCount: 0,
      }),
    );
    expect(scheduler.snapshot()).toMatchObject({
      state: "idle",
      frameScheduled: false,
      frameCount: 1,
    });
  });

  test("continues only while a pass requests another frame", () => {
    const environment = createEnvironment();
    const onFrame = jest
      .fn()
      .mockReturnValueOnce({ continue: true })
      .mockReturnValueOnce({ continue: false });
    const scheduler = createVisualRuntimeScheduler({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
      onFrame,
    });

    scheduler.start();
    scheduler.invalidate("animation-start");
    environment.flushFrame(16);
    expect(environment.pendingFrames()).toBe(1);

    environment.flushFrame(32);
    expect(environment.pendingFrames()).toBe(0);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(scheduler.snapshot().state).toBe("idle");
  });

  test("owns no frame while hidden and resumes from one invalidation", () => {
    const environment = createEnvironment();
    const onFrame = jest.fn(() => ({ continue: false }));
    const scheduler = createVisualRuntimeScheduler({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
      onFrame,
    });

    scheduler.start();
    scheduler.invalidate("initial");
    environment.setVisible(false);

    expect(environment.pendingFrames()).toBe(0);
    expect(scheduler.snapshot().state).toBe("hidden");

    environment.setVisible(true);
    expect(environment.pendingFrames()).toBe(1);
    environment.flushFrame(16);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  test("draws an invalidated reduced-motion frame but cannot loop", () => {
    const environment = createEnvironment({ reducedMotion: true });
    const onFrame = jest.fn(() => ({ continue: true }));
    const scheduler = createVisualRuntimeScheduler({
      windowObject: environment.windowObject,
      documentObject: environment.documentObject,
      onFrame,
    });

    scheduler.start();
    scheduler.invalidate("static-frame");
    environment.flushFrame(16);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(environment.pendingFrames()).toBe(0);
    expect(scheduler.snapshot().state).toBe("reduced-motion");
  });
});
