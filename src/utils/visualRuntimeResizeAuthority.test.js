import {
  createVisualRuntimeResizeAuthority,
  resolveVisualRuntimeDrawingBufferSize,
} from "./visualRuntimeResizeAuthority";

describe("visual runtime resize authority", () => {
  test("bounds DPR and total drawing-buffer pixels", () => {
    expect(
      resolveVisualRuntimeDrawingBufferSize({
        cssWidth: 100,
        cssHeight: 50,
        devicePixelRatio: 2,
        maxDevicePixelRatio: 1.5,
        maxPixels: 1_000_000,
      }),
    ).toMatchObject({
      width: 150,
      height: 75,
      scale: 1.5,
    });

    const bounded = resolveVisualRuntimeDrawingBufferSize({
      cssWidth: 1920,
      cssHeight: 1080,
      devicePixelRatio: 2,
      maxDevicePixelRatio: 1.5,
      maxPixels: 1_000_000,
    });
    expect(bounded.width * bounded.height).toBeLessThanOrEqual(
      1_000_000,
    );
    expect(bounded.width / bounded.height).toBeCloseTo(16 / 9, 2);

    const oversized = resolveVisualRuntimeDrawingBufferSize({
      cssWidth: 10_000,
      cssHeight: 10_000,
      devicePixelRatio: 1,
      maxDevicePixelRatio: 1.5,
      maxPixels: 1_000_000,
    });
    expect(oversized.width * oversized.height).toBeLessThanOrEqual(
      1_000_000,
    );
    expect(oversized).toMatchObject({
      width: 1_000,
      height: 1_000,
      scale: 0.1,
    });
  });

  test("invalidates instead of starting an independent frame loop", () => {
    const listeners = new Map();
    const observed = [];
    const disconnected = jest.fn();
    class MockResizeObserver {
      observe(target) {
        observed.push(target);
      }
      disconnect() {
        disconnected();
      }
    }

    const windowObject = {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 1,
      ResizeObserver: MockResizeObserver,
      addEventListener: (name, listener) =>
        listeners.set(name, listener),
      removeEventListener: (name, listener) => {
        if (listeners.get(name) === listener) {
          listeners.delete(name);
        }
      },
    };
    const host = {
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    };
    const canvas = { width: 1, height: 1, dataset: {} };
    const onInvalidate = jest.fn();
    const onResize = jest.fn();
    const authority = createVisualRuntimeResizeAuthority({
      windowObject,
      host,
      canvas,
      onInvalidate,
      onResize,
    });

    authority.start();
    expect(observed).toEqual([host]);
    expect(authority.sync()).toMatchObject({ width: 800, height: 600 });
    expect(onResize).toHaveBeenCalledTimes(1);

    authority.sync();
    expect(onResize).toHaveBeenCalledTimes(1);
    listeners.get("resize")?.();
    expect(onInvalidate).toHaveBeenCalledWith("resize");

    authority.dispose();
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(listeners.has("resize")).toBe(false);
  });
});
