import {
  GRAPHICS_RUNTIME_FAILURE_EVENT,
  initGraphicsRuntimeBoundary,
} from "./graphicsRuntimeBoundary";

const mockDisableWebGLForSession = jest.fn();
const mockRecordGraphicsEvent = jest.fn();

jest.mock("./graphicsPolicy", () => ({
  disableWebGLForSession: (...args) => mockDisableWebGLForSession(...args),
  recordGraphicsEvent: (...args) => mockRecordGraphicsEvent(...args),
}));

describe("graphics runtime boundary", () => {
  let cleanupBoundary;

  beforeEach(() => {
    mockDisableWebGLForSession.mockClear();
    mockRecordGraphicsEvent.mockClear();
    window.__bhModeActive = true;
    cleanupBoundary = initGraphicsRuntimeBoundary();
  });

  afterEach(() => {
    cleanupBoundary?.();
    document.body.innerHTML = "";
    window.__bhModeActive = false;
  });

  test("degrades a lost canvas locally without reloading the document", () => {
    const failureListener = jest.fn();
    window.addEventListener(GRAPHICS_RUNTIME_FAILURE_EVENT, failureListener);

    const root = document.createElement("div");
    root.dataset.rendererId = "black-hole-orb";
    const canvas = document.createElement("canvas");
    root.appendChild(canvas);
    document.body.appendChild(root);

    const event = new Event("webglcontextlost", {
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(mockDisableWebGLForSession).toHaveBeenCalledWith(
      "context-lost:black-hole-orb",
    );
    expect(mockRecordGraphicsEvent).toHaveBeenCalledWith(
      "runtime-boundary-context-lost",
      { rendererId: "black-hole-orb" },
    );
    expect(canvas.dataset.contextState).toBe("lost");
    expect(canvas.style.visibility).toBe("hidden");
    expect(canvas.style.pointerEvents).toBe("none");
    expect(window.__bhModeActive).toBe(false);
    expect(failureListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(
      GRAPHICS_RUNTIME_FAILURE_EVENT,
      failureListener,
    );
  });

  test("initialization is idempotent", () => {
    expect(initGraphicsRuntimeBoundary()).toBe(cleanupBoundary);
  });
});
