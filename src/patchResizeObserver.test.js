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
