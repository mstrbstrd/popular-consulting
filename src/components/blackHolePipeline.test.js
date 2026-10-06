import { BlackHolePipeline } from './blackHolePipeline';
import { BLACK_HOLE_RENDER_SCHEDULES, getBlackHoleCanvasSize } from './blackHoleSchedule';
import { createRenderTarget, destroyRenderTarget } from './blackHoleWebGL';

jest.mock('./blackHoleWebGL', () => ({
  ...jest.requireActual('./blackHoleWebGL'),
  createRenderTarget: jest.fn(),
  destroyRenderTarget: jest.fn(),
}));

let canvas, parent, pipeline, bounds;
beforeEach(() => {
  bounds = { width: 393, height: 700 };
  parent = document.createElement('div');
  parent.getBoundingClientRect = () => bounds;
  canvas = document.createElement('canvas');
  parent.appendChild(canvas);
  pipeline = new BlackHolePipeline({ canvas, getFrameInput: () => ({}) });
  pipeline.schedule = BLACK_HOLE_RENDER_SCHEDULES.full;
  const size = getBlackHoleCanvasSize(bounds.width, bounds.height, pipeline.schedule);
  canvas.width = size.width; canvas.height = size.height;
  pipeline.frontTarget = { frame: 'complete' };
  pipeline.backTarget = { frame: 'in-progress' };
  pipeline.frontReady = true;
  pipeline.frameInProgress = true;
  pipeline.tileCursor = 5;
  pipeline.gl = { bindFramebuffer: jest.fn(), viewport: jest.fn(), disable: jest.fn(), clearColor: jest.fn(), clear: jest.fn() };
  createRenderTarget.mockImplementation((gl, width, height) => ({ width, height }));
});

test('redundant resize notifications retain the displayed frame and in-progress tiles', () => {
  const front = pipeline.frontTarget, back = pipeline.backTarget;
  for (let i = 0; i < 3; i++) {
    pipeline.requestResize();
    expect(pipeline.resize()).toBe(true);
    expect(pipeline.resizeDirty).toBe(false);
  }
  expect(pipeline.frontTarget).toBe(front);
  expect(pipeline.backTarget).toBe(back);
  expect(pipeline.frontReady).toBe(true);
  expect(pipeline.frameInProgress).toBe(true);
  expect(pipeline.tileCursor).toBe(5);
  expect(createRenderTarget).not.toHaveBeenCalled();
  expect(destroyRenderTarget).not.toHaveBeenCalled();
  expect(pipeline.gl.clear).not.toHaveBeenCalled();
});

test('a real buffer-size change still reallocates both targets and resets tiled rendering', () => {
  bounds = { width: 700, height: 393 };
  pipeline.requestResize();
  expect(pipeline.resize()).toBe(true);
  expect(createRenderTarget).toHaveBeenCalledTimes(2);
  expect(destroyRenderTarget).toHaveBeenCalledTimes(2);
  expect(pipeline.frontReady).toBe(false);
  expect(pipeline.tileCursor).toBe(0);
  expect(pipeline.resizeDirty).toBe(false);
  expect(canvas.width).toBe(244);
  expect(canvas.height).toBe(137);
});

test('an outstanding GPU batch defers resize without destroying its targets', () => {
  pipeline.pendingSync = {};
  pipeline.requestResize();
  expect(pipeline.resize()).toBe(false);
  expect(pipeline.resizeDirty).toBe(true);
  expect(createRenderTarget).not.toHaveBeenCalled();
  expect(pipeline.gl.clear).not.toHaveBeenCalled();
});
