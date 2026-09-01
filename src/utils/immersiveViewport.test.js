import fs from "fs";
import path from "path";
import {
  initImmersiveViewport,
  resolveImmersiveViewportHeight,
} from "./immersiveViewport";

describe("immersive viewport sizing", () => {
  test("binds every immersive layer to the measured height", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/immersive-viewport.css"),
      "utf8",
    );
    const entry = fs.readFileSync(
      path.join(process.cwd(), "src/index.js"),
      "utf8",
    );

    expect(entry).toContain("initImmersiveViewport();");
    expect(entry).toContain("./immersive-viewport.css");
    expect(css).toContain(".parallax-wrapper > .fixed-background");
    expect(css).toContain(".parallax-wrapper > .sections-content");
    expect(css).toContain("--immersive-viewport-height");
  });

  test("uses the unzoomed visual viewport and rounds up to avoid gaps", () => {
    expect(
      resolveImmersiveViewportHeight({
        visualViewportHeight: 641.2,
        visualViewportScale: 1,
        innerHeight: 590,
      }),
    ).toBe(642);
  });

  test("falls back to layout height while pinch zoomed", () => {
    expect(
      resolveImmersiveViewportHeight({
        visualViewportHeight: 320,
        visualViewportScale: 2,
        innerHeight: 640,
      }),
    ).toBe(640);
  });

  test("does not collapse the complete experience for the mobile keyboard", () => {
    expect(
      resolveImmersiveViewportHeight({
        visualViewportHeight: 330,
        visualViewportScale: 1,
        innerHeight: 640,
        previousHeight: 640,
        textEntryFocused: true,
      }),
    ).toBe(640);
  });

  test("resynchronizes after a restored tab becomes visible", () => {
    jest.useFakeTimers();
    const originalVisualViewportDescriptor =
      Object.getOwnPropertyDescriptor(window, "visualViewport");
    const originalInnerHeightDescriptor =
      Object.getOwnPropertyDescriptor(window, "innerHeight");
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const viewportListeners = {};
    const visualViewport = {
      width: 390,
      height: 560,
      scale: 1,
      addEventListener: jest.fn((name, handler) => {
        viewportListeners[name] = handler;
      }),
      removeEventListener: jest.fn((name, handler) => {
        if (viewportListeners[name] === handler) {
          delete viewportListeners[name];
        }
      }),
    };
    let cleanup = () => {};

    try {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: visualViewport,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: 560,
        writable: true,
      });
      window.requestAnimationFrame = (callback) =>
        window.setTimeout(() => callback(performance.now()), 0);
      window.cancelAnimationFrame = (frameId) =>
        window.clearTimeout(frameId);

      cleanup = initImmersiveViewport();
      expect(
        document.documentElement.style.getPropertyValue(
          "--immersive-viewport-height",
        ),
      ).toBe("560px");

      visualViewport.height = 690;
      window.innerHeight = 690;
      window.dispatchEvent(new Event("pageshow"));
      jest.advanceTimersByTime(500);

      expect(
        document.documentElement.style.getPropertyValue(
          "--immersive-viewport-height",
        ),
      ).toBe("690px");
      expect(visualViewport.addEventListener).toHaveBeenCalledWith(
        "resize",
        expect.any(Function),
        { passive: true },
      );
    } finally {
      cleanup();
      jest.clearAllTimers();
      jest.useRealTimers();
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;

      if (originalVisualViewportDescriptor) {
        Object.defineProperty(
          window,
          "visualViewport",
          originalVisualViewportDescriptor,
        );
      } else {
        delete window.visualViewport;
      }

      if (originalInnerHeightDescriptor) {
        Object.defineProperty(
          window,
          "innerHeight",
          originalInnerHeightDescriptor,
        );
      } else {
        delete window.innerHeight;
      }

      document.documentElement.style.removeProperty(
        "--immersive-viewport-height",
      );
    }
  });
});
