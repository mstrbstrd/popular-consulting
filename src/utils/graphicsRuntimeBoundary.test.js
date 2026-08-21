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

  test("contains an unmanaged lost canvas without reloading the document", () => {
    const failureListener = jest.fn();
    window.addEventListener(GRAPHICS_RUNTIME_FAILURE_EVENT, failureListener);

    const root = document.createElement("div");
    root.dataset.rendererId = "unmanaged-renderer";
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
      "context-lost:unmanaged-renderer",
    );
    expect(mockRecordGraphicsEvent).toHaveBeenCalledWith(
      "runtime-boundary-context-lost",
      { rendererId: "unmanaged-renderer" },
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

  test("delegates a locally recoverable canvas without poisoning the session", () => {
    const failureListener = jest.fn();
    window.addEventListener(GRAPHICS_RUNTIME_FAILURE_EVENT, failureListener);

    const canvas = document.createElement("canvas");
    canvas.dataset.rendererId = "black-hole-orb";
    canvas.dataset.contextRecovery = "local";
    document.body.appendChild(canvas);

    const event = new Event("webglcontextlost", {
      bubbles: true,
      cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(mockDisableWebGLForSession).not.toHaveBeenCalled();
    expect(mockRecordGraphicsEvent).toHaveBeenCalledWith(
      "runtime-boundary-delegated",
      { rendererId: "black-hole-orb", recovery: "local" },
    );
    expect(canvas.dataset.contextState).toBeUndefined();
    expect(canvas.style.visibility).toBe("");
    expect(canvas.style.pointerEvents).toBe("");
    expect(window.__bhModeActive).toBe(true);
    expect(failureListener).not.toHaveBeenCalled();

    window.removeEventListener(
      GRAPHICS_RUNTIME_FAILURE_EVENT,
      failureListener,
    );
  });

  test("initialization is idempotent", () => {
    expect(initGraphicsRuntimeBoundary()).toBe(cleanupBoundary);
  });
});
