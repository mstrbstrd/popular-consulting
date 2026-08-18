import {
  boundedViewportSize,
  initGraphicsContextGovernor,
} from "./graphicsContextGovernor";

const mockRecordGraphicsEvent = jest.fn();

jest.mock("./graphicsPolicy", () => ({
  recordGraphicsEvent: (...args) => mockRecordGraphicsEvent(...args),
}));

describe("graphics context governor", () => {
  let cleanupGovernor;
  let getContextSpy;
  let nowSpy;

  beforeEach(() => {
    mockRecordGraphicsEvent.mockClear();
    nowSpy = jest.spyOn(performance, "now");
  });

  afterEach(() => {
    cleanupGovernor?.();
    cleanupGovernor = null;
    getContextSpy?.mockRestore();
    getContextSpy = null;
    nowSpy?.mockRestore();
    nowSpy = null;
    document.body.innerHTML = "";
  });

  test("bounds a full-canvas viewport before the first draw", () => {
    const viewport = jest.fn();
    const drawArrays = jest.fn();
    const context = { viewport, drawArrays };

    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    cleanupGovernor = initGraphicsContextGovernor();

    const root = document.createElement("div");
    root.dataset.graphicsGovernor = "true";
    root.dataset.graphicsSinglePass = "true";
    root.dataset.maxShaderPixels = "1000000";
    root.dataset.shaderFrameInterval = String(1000 / 30);
    root.dataset.rendererId = "test-dither";
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 1000;
    root.appendChild(canvas);
    document.body.appendChild(root);

    const governed = canvas.getContext("webgl2");
    governed.viewport(0, 0, 2000, 1000);

    expect(canvas.width * canvas.height).toBeLessThanOrEqual(1_000_000);
    expect(viewport).toHaveBeenCalledWith(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    expect(root.dataset.renderWidth).toBe(String(canvas.width));
    expect(root.dataset.renderHeight).toBe(String(canvas.height));
  });

  test("caps a managed single-pass context at the configured frame interval", () => {
    const viewport = jest.fn();
    const drawArrays = jest.fn();
    const context = { viewport, drawArrays };

    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    cleanupGovernor = initGraphicsContextGovernor();

    const root = document.createElement("div");
    root.dataset.graphicsGovernor = "true";
    root.dataset.graphicsSinglePass = "true";
    root.dataset.maxShaderPixels = "1000000";
    root.dataset.shaderFrameInterval = "33";
    const canvas = document.createElement("canvas");
    root.appendChild(canvas);
    document.body.appendChild(root);

    nowSpy
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(110)
      .mockReturnValueOnce(140);

    const governed = canvas.getContext("webgl2");
    governed.drawArrays(5, 0, 4);
    governed.drawArrays(5, 0, 4);
    governed.drawArrays(5, 0, 4);

    expect(drawArrays).toHaveBeenCalledTimes(2);
  });

  test("does not alter unmarked canvases or 2D contexts", () => {
    const context = {
      viewport: jest.fn(),
      drawArrays: jest.fn(),
    };

    getContextSpy = jest
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    cleanupGovernor = initGraphicsContextGovernor();

    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    expect(canvas.getContext("webgl2")).toBe(context);
    expect(canvas.getContext("2d")).toBe(context);
    expect(context.__popconGraphicsGoverned).toBeUndefined();
  });

  test("computes a stable bounded aspect ratio", () => {
    expect(boundedViewportSize(2000, 1000, 1_000_000)).toEqual({
      width: 1414,
      height: 707,
    });
    expect(boundedViewportSize(640, 360, 1_000_000)).toEqual({
      width: 640,
      height: 360,
    });
  });
});
