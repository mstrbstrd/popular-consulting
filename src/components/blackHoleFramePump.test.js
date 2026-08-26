import {
  isDarkEvidenceCapture,
  resolveBlackHoleBatchSize,
  tickBlackHolePipeline,
} from "./blackHoleFramePump";

const createMockPipeline = () => {
  const metrics = {
    sceneDraws: 0,
    presentationDraws: 0,
  };
  const gl = {
    FRAMEBUFFER: 1,
    SCISSOR_TEST: 2,
    TRIANGLE_STRIP: 3,
    TEXTURE0: 4,
    TEXTURE_2D: 5,
    SYNC_GPU_COMMANDS_COMPLETE: 6,
    WAIT_FAILED: 7,
    ALREADY_SIGNALED: 8,
    CONDITION_SATISFIED: 9,
    bindFramebuffer: jest.fn(),
    viewport: jest.fn(),
    disable: jest.fn(),
    useProgram: jest.fn(),
    bindVertexArray: jest.fn(),
    clearColor: jest.fn(),
    clear: jest.fn(),
    activeTexture: jest.fn(),
    bindTexture: jest.fn(),
    uniform1i: jest.fn(),
    enable: jest.fn(),
    finish: jest.fn(),
    flush: jest.fn(),
    fenceSync: jest.fn(() => ({})),
    clientWaitSync: jest.fn(() => 8),
    deleteSync: jest.fn(),
    drawArrays: jest.fn(() => {
      metrics.presentationDraws += 1;
    }),
  };
  const pipeline = {
    gl,
    canvas: {
      width: 504,
      height: 315,
      dataset: {},
    },
    presentProgram: {},
    presentVertexArray: {},
    presentFrameUniform: {},
    frontTarget: {
      framebuffer: {},
      texture: {},
    },
    backTarget: {
      framebuffer: {},
      texture: {},
    },
    frontReady: false,
    frameInProgress: false,
    frameSnapshot: null,
    pendingSync: null,
    pendingCompletesFrame: false,
    resizeDirty: false,
    nextFrameEarliestAt: 0,
    completedFrames: 0,
    tileCursor: 0,
    tiles: Array.from({ length: 16 }, (_, index) => ({
      x: index,
      y: 0,
      width: 1,
      height: 1,
    })),
    schedule: {
      id: "full",
      tilesPerBatch: 16,
      minCompletedFrameIntervalMs: 0,
    },
    sceneProgram: {},
    sceneVertexArray: {},
    getFrameInput: () => ({
      time: 8,
      mouseX: 0.5,
      mouseY: 0.35,
      zoom: 14,
      lightMode: 0,
    }),
    drawTile: jest.fn(() => {
      metrics.sceneDraws += 1;
    }),
    fail: jest.fn(() => false),
  };

  return { gl, metrics, pipeline };
};

const replaceSearch = (search = "") => {
  window.history.replaceState({}, "", `/${search}`);
};

describe("black-hole frame-pump evidence scheduling", () => {
  afterEach(() => {
    replaceSearch();
  });

  test("keeps the authored batch size outside evidence capture", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "",
        scheduledTilesPerBatch: 16,
        remainingTiles: 12,
      }),
    ).toBe(12);
  });

  test("yields after one tile during strict dark evidence", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "?visual-runtime-evidence=dark",
        scheduledTilesPerBatch: 16,
        remainingTiles: 16,
      }),
    ).toBe(1);
  });

  test("uses the canonical evidence-request normalization", () => {
    const normalizedSearch =
      "?visual-runtime-evidence=%20DARK%20";

    expect(isDarkEvidenceCapture(normalizedSearch)).toBe(true);
    expect(
      resolveBlackHoleBatchSize({
        search: normalizedSearch,
        scheduledTilesPerBatch: 16,
        remainingTiles: 16,
      }),
    ).toBe(1);
  });

  test("does not alter unrelated evidence modes", () => {
    expect(isDarkEvidenceCapture("")).toBe(false);
    expect(
      isDarkEvidenceCapture("?visual-runtime-evidence=light"),
    ).toBe(false);
    expect(
      resolveBlackHoleBatchSize({
        search: "?visual-runtime-evidence=light",
        scheduledTilesPerBatch: 4,
        remainingTiles: 9,
      }),
    ).toBe(4);
  });

  test("never exceeds the remaining tile count", () => {
    expect(
      resolveBlackHoleBatchSize({
        search: "",
        scheduledTilesPerBatch: 8,
        remainingTiles: 2,
      }),
    ).toBe(2);
  });

  test("completes a deterministic evidence frame without a fence", () => {
    replaceSearch("?visual-runtime-evidence=dark");
    const { gl, metrics, pipeline } = createMockPipeline();
    let shouldContinue = true;
    let ticks = 0;

    while (shouldContinue && ticks < 32) {
      shouldContinue = tickBlackHolePipeline(
        pipeline,
        ticks * 50,
        true,
      );
      ticks += 1;
    }

    expect(ticks).toBe(16);
    expect(shouldContinue).toBe(false);
    expect(pipeline.completedFrames).toBe(1);
    expect(metrics.sceneDraws).toBe(16);
    expect(metrics.presentationDraws).toBe(1);
    expect(gl.finish).toHaveBeenCalledTimes(16);
    expect(gl.fenceSync).not.toHaveBeenCalled();
  });

  test("preserves the asynchronous production fence path", () => {
    replaceSearch();
    const { gl, metrics, pipeline } = createMockPipeline();

    expect(tickBlackHolePipeline(pipeline, 0, true)).toBe(true);
    expect(pipeline.completedFrames).toBe(0);
    expect(gl.fenceSync).toHaveBeenCalledTimes(1);
    expect(gl.finish).not.toHaveBeenCalled();

    expect(tickBlackHolePipeline(pipeline, 50, true)).toBe(false);
    expect(pipeline.completedFrames).toBe(1);
    expect(metrics.sceneDraws).toBe(16);
    expect(metrics.presentationDraws).toBe(1);
    expect(gl.clientWaitSync).toHaveBeenCalledTimes(1);
  });
});
