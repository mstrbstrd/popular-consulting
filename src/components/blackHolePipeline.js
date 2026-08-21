// Bounded double-buffered pipeline for the canonical black-hole shader.
import { recordGraphicsEvent } from "../utils/graphicsPolicy";
import {
  presentBlackHoleFrame,
  tickBlackHolePipeline,
} from "./blackHoleFramePump";
import {
  BLACK_HOLE_RENDER_SCHEDULES,
  BLACK_HOLE_SCHEDULE_SESSION_KEY,
  chooseBlackHoleRenderSchedule,
  createBlackHoleTiles,
  getBlackHoleCanvasSize,
  readBlackHoleScheduleOverride,
  resolveBlackHoleRenderSchedule,
} from "./blackHoleSchedule";
import {
  BLACK_HOLE_FRAGMENT_SHADER,
  BLACK_HOLE_VERTEX_SHADER,
  PRESENT_FRAGMENT_SHADER,
  PRESENT_VERTEX_SHADER,
} from "./blackHoleShader";
import {
  createBlackHoleContext,
  createProgram,
  createRenderTarget,
  createVertexArray,
  destroyRenderTarget,
  safeSessionGet,
  safeSessionSet,
} from "./blackHoleWebGL";

const CALIBRATION_GRID = 8;

const clearTarget = (gl, target) => {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer || null);
  gl.viewport(0, 0, target?.width || gl.drawingBufferWidth, target?.height || gl.drawingBufferHeight);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
};

export class BlackHolePipeline {
  constructor({ canvas, getFrameInput }) {
    this.canvas = canvas;
    this.getFrameInput = getFrameInput;
    this.gl = null;
    this.sceneProgram = null;
    this.presentProgram = null;
    this.buffer = null;
    this.sceneVertexArray = null;
    this.presentVertexArray = null;
    this.frontTarget = null;
    this.backTarget = null;
    this.frontReady = false;
    this.tiles = [];
    this.tileCursor = 0;
    this.frameSnapshot = null;
    this.pendingSync = null;
    this.pendingCompletesFrame = false;
    this.frameInProgress = false;
    this.resizeDirty = true;
    this.nextFrameEarliestAt = 0;
    this.completedFrames = 0;
    this.lastError = null;

    const search = typeof window !== "undefined" ? window.location.search : "";
    this.forcedScheduleId = readBlackHoleScheduleOverride(search);
    this.schedule = resolveBlackHoleRenderSchedule({
      search,
      storedSchedule: safeSessionGet(BLACK_HOLE_SCHEDULE_SESSION_KEY),
    });
  }

  initialize() {
    this.gl = createBlackHoleContext(this.canvas);
    if (!this.gl) return this.fail("context-unavailable");

    const gl = this.gl;
    this.sceneProgram = createProgram(
      gl,
      BLACK_HOLE_VERTEX_SHADER,
      BLACK_HOLE_FRAGMENT_SHADER,
      "scene",
    );
    this.presentProgram = createProgram(
      gl,
      PRESENT_VERTEX_SHADER,
      PRESENT_FRAGMENT_SHADER,
      "present",
    );
    if (!this.sceneProgram || !this.presentProgram) {
      return this.fail("shader-initialization");
    }

    this.buffer = gl.createBuffer();
    if (!this.buffer) return this.fail("buffer-unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.sceneVertexArray = createVertexArray(gl, this.sceneProgram, this.buffer);
    this.presentVertexArray = createVertexArray(gl, this.presentProgram, this.buffer);
    if (!this.sceneVertexArray || !this.presentVertexArray) {
      return this.fail("position-input-missing");
    }

    this.sceneUniforms = {
      time: gl.getUniformLocation(this.sceneProgram, "u_time"),
      resolution: gl.getUniformLocation(this.sceneProgram, "u_res"),
      tileRect: gl.getUniformLocation(this.sceneProgram, "u_tile_rect"),
      mouse: gl.getUniformLocation(this.sceneProgram, "u_mouse"),
      zoom: gl.getUniformLocation(this.sceneProgram, "u_zoom"),
      lightMode: gl.getUniformLocation(this.sceneProgram, "u_lightMode"),
    };
    this.presentFrameUniform = gl.getUniformLocation(this.presentProgram, "u_frame");
    this.updateDataset();
    return true;
  }

  fail(reason) {
    this.lastError = reason;
    return false;
  }

  updateDataset() {
    this.canvas.dataset.renderProfile = this.schedule.id;
    this.canvas.dataset.renderSchedule = this.schedule.id;
    this.canvas.dataset.tilesPerBatch = String(this.schedule.tilesPerBatch);
  }

  applySchedule(nextSchedule, detail = {}) {
    if (!nextSchedule || nextSchedule.id === this.schedule.id) return;
    const previous = this.schedule;
    this.schedule = nextSchedule;
    if (
      previous.maxPixels !== nextSchedule.maxPixels ||
      previous.pixelScale !== nextSchedule.pixelScale
    ) {
      this.resizeDirty = true;
    }
    this.updateDataset();
    if (!this.forcedScheduleId && nextSchedule.id !== "calibration") {
      safeSessionSet(
        BLACK_HOLE_SCHEDULE_SESSION_KEY,
        JSON.stringify({ id: nextSchedule.id }),
      );
    }
    recordGraphicsEvent("black-hole-schedule-changed", {
      from: previous.id,
      to: nextSchedule.id,
      ...detail,
    });
  }

  requestResize() {
    this.resizeDirty = true;
  }

  resize() {
    if (!this.gl || this.pendingSync) return false;
    const parent = this.canvas.parentElement;
    if (!parent) return this.fail("canvas-parent-missing");

    const bounds = parent.getBoundingClientRect();
    const target = getBlackHoleCanvasSize(
      bounds.width || parent.clientWidth || window.innerWidth,
      bounds.height || parent.clientHeight || window.innerHeight,
      this.schedule,
    );
    if (!target || target.width < 1 || target.height < 1) {
      return this.fail("canvas-size-invalid");
    }

    if (
      !this.resizeDirty &&
      this.canvas.width === target.width &&
      this.canvas.height === target.height &&
      this.frontTarget &&
      this.backTarget
    ) {
      return true;
    }

    const gl = this.gl;
    destroyRenderTarget(gl, this.frontTarget);
    destroyRenderTarget(gl, this.backTarget);
    this.canvas.width = target.width;
    this.canvas.height = target.height;
    this.frontTarget = createRenderTarget(gl, target.width, target.height);
    this.backTarget = createRenderTarget(gl, target.width, target.height);
    if (!this.frontTarget || !this.backTarget) {
      return this.fail("render-target-unavailable");
    }

    this.tiles = createBlackHoleTiles(target.width, target.height);
    this.tileCursor = 0;
    this.frameSnapshot = null;
    this.frameInProgress = false;
    this.frontReady = false;
    this.resizeDirty = false;
    this.canvas.dataset.renderWidth = String(target.width);
    this.canvas.dataset.renderHeight = String(target.height);
    this.canvas.dataset.tileCount = String(this.tiles.length);
    clearTarget(gl, this.frontTarget);
    clearTarget(gl, this.backTarget);
    clearTarget(gl, null);

    if (this.schedule.id === "calibration" && !this.calibrate()) return false;
    return true;
  }

  setSceneUniforms(input, tile) {
    const gl = this.gl;
    gl.uniform1f(this.sceneUniforms.time, input.time);
    gl.uniform2f(this.sceneUniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform4f(
      this.sceneUniforms.tileRect,
      tile.x,
      tile.y,
      tile.width,
      tile.height,
    );
    gl.uniform2f(this.sceneUniforms.mouse, input.mouseX, input.mouseY);
    gl.uniform1f(this.sceneUniforms.zoom, input.zoom);
    gl.uniform1f(this.sceneUniforms.lightMode, input.lightMode);
  }

  drawTile(tile, input) {
    const gl = this.gl;
    gl.viewport(tile.x, tile.y, tile.width, tile.height);
    gl.scissor(tile.x, tile.y, tile.width, tile.height);
    this.setSceneUniforms(input, tile);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  calibrate() {
    if (this.forcedScheduleId || !this.gl || !this.backTarget) return true;
    const width = Math.max(1, Math.floor(this.canvas.width / CALIBRATION_GRID));
    const height = Math.max(1, Math.floor(this.canvas.height / CALIBRATION_GRID));
    const tile = { x: 0, y: 0, width, height };
    const input = this.getFrameInput(8_000, true);
    const gl = this.gl;

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.backTarget.framebuffer);
      gl.enable(gl.SCISSOR_TEST);
      gl.useProgram(this.sceneProgram);
      gl.bindVertexArray(this.sceneVertexArray);
      const startedAt = performance.now();
      this.drawTile(tile, input);
      gl.finish();
      const measuredTileGpuMs = Math.max(0.1, performance.now() - startedAt);
      const areaRatio =
        (this.canvas.width * this.canvas.height) / (tile.width * tile.height);
      const estimatedFullFrameGpuMs = measuredTileGpuMs * areaRatio;
      const selected = chooseBlackHoleRenderSchedule(estimatedFullFrameGpuMs);
      this.canvas.dataset.estimatedFrameGpuMs = estimatedFullFrameGpuMs.toFixed(2);
      this.applySchedule(selected, {
        measuredTileGpuMs: measuredTileGpuMs.toFixed(2),
        estimatedFullFrameGpuMs: estimatedFullFrameGpuMs.toFixed(2),
        measurement: "blocking-calibration-tile",
      });
      recordGraphicsEvent("black-hole-calibrated", {
        schedule: this.schedule.id,
        measuredTileGpuMs: measuredTileGpuMs.toFixed(2),
        estimatedFullFrameGpuMs: estimatedFullFrameGpuMs.toFixed(2),
      });
      clearTarget(gl, this.frontTarget);
      clearTarget(gl, this.backTarget);
      clearTarget(gl, null);
      return true;
    } catch (_) {
      return this.fail("calibration-failed");
    }
  }

  present() {
    presentBlackHoleFrame(this);
  }

  tick(timestamp, reducedMotion = false) {
    return tickBlackHolePipeline(this, timestamp, reducedMotion);
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    try {
      if (this.pendingSync) gl.deleteSync(this.pendingSync);
      destroyRenderTarget(gl, this.frontTarget);
      destroyRenderTarget(gl, this.backTarget);
      if (this.sceneVertexArray) gl.deleteVertexArray(this.sceneVertexArray);
      if (this.presentVertexArray) gl.deleteVertexArray(this.presentVertexArray);
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.sceneProgram) gl.deleteProgram(this.sceneProgram);
      if (this.presentProgram) gl.deleteProgram(this.presentProgram);
    } catch (_) {
      // Context loss already owns reclamation of the underlying resources.
    }
    this.pendingSync = null;
    this.frontTarget = null;
    this.backTarget = null;
    this.gl = null;
  }
}
