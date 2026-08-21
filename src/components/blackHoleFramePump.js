// Frame submission and atomic presentation for BlackHolePipeline.
import { recordGraphicsEvent } from "../utils/graphicsPolicy";

export const presentBlackHoleFrame = (pipeline) => {
  const {
    gl,
    canvas,
    presentProgram,
    presentVertexArray,
    presentFrameUniform,
    frontReady,
    frontTarget,
  } = pipeline;
  if (!gl || !presentProgram || !presentVertexArray) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.useProgram(presentProgram);
  gl.bindVertexArray(presentVertexArray);
  if (!frontReady || !frontTarget) {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return;
  }
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, frontTarget.texture);
  gl.uniform1i(presentFrameUniform, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindTexture(gl.TEXTURE_2D, null);
};

const beginFrame = (pipeline, timestamp) => {
  pipeline.frameSnapshot = pipeline.getFrameInput(timestamp, false);
  pipeline.tileCursor = 0;
  pipeline.frameInProgress = true;
};

const completeBatch = (pipeline) => {
  const gl = pipeline.gl;
  if (pipeline.pendingSync && gl) gl.deleteSync(pipeline.pendingSync);
  pipeline.pendingSync = null;
  if (!pipeline.pendingCompletesFrame) return true;

  const completedTarget = pipeline.backTarget;
  pipeline.backTarget = pipeline.frontTarget;
  pipeline.frontTarget = completedTarget;
  pipeline.frontReady = true;
  pipeline.frameInProgress = false;
  pipeline.frameSnapshot = null;
  pipeline.tileCursor = 0;
  pipeline.completedFrames += 1;
  pipeline.canvas.dataset.completedFrames = String(pipeline.completedFrames);
  pipeline.nextFrameEarliestAt =
    performance.now() + pipeline.schedule.minCompletedFrameIntervalMs;
  presentBlackHoleFrame(pipeline);

  if (pipeline.completedFrames === 1) {
    recordGraphicsEvent("black-hole-first-frame", {
      schedule: pipeline.schedule.id,
      width: pipeline.canvas.width,
      height: pipeline.canvas.height,
      tileCount: pipeline.tiles.length,
    });
  }
  return true;
};

const submitBatch = (pipeline) => {
  const {
    gl,
    backTarget,
    frameSnapshot,
    sceneProgram,
    sceneVertexArray,
  } = pipeline;
  if (!gl || !backTarget || !frameSnapshot || pipeline.pendingSync) {
    return false;
  }

  const batchSize = Math.max(
    1,
    Math.min(
      pipeline.schedule.tilesPerBatch,
      pipeline.tiles.length - pipeline.tileCursor,
    ),
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, backTarget.framebuffer);
  gl.enable(gl.SCISSOR_TEST);
  gl.useProgram(sceneProgram);
  gl.bindVertexArray(sceneVertexArray);

  for (let index = 0; index < batchSize; index += 1) {
    pipeline.drawTile(
      pipeline.tiles[pipeline.tileCursor + index],
      frameSnapshot,
    );
  }

  pipeline.tileCursor += batchSize;
  pipeline.pendingCompletesFrame =
    pipeline.tileCursor >= pipeline.tiles.length;
  pipeline.pendingSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  if (!pipeline.pendingSync) {
    gl.finish();
    return completeBatch(pipeline);
  }
  return true;
};

const pollBatch = (pipeline) => {
  if (!pipeline.pendingSync || !pipeline.gl) return true;
  const gl = pipeline.gl;
  const status = gl.clientWaitSync(pipeline.pendingSync, 0, 0);
  if (status === gl.WAIT_FAILED) return pipeline.fail("gpu-sync-failed");
  if (
    status !== gl.ALREADY_SIGNALED &&
    status !== gl.CONDITION_SATISFIED
  ) {
    return true;
  }
  return completeBatch(pipeline);
};

export const tickBlackHolePipeline = (
  pipeline,
  timestamp,
  reducedMotion = false,
) => {
  if (!pipeline.gl) return false;
  if (!pollBatch(pipeline)) return false;
  if (pipeline.pendingSync) return true;
  if (pipeline.resizeDirty && !pipeline.resize()) return false;
  if (reducedMotion && pipeline.frontReady && !pipeline.frameInProgress) {
    return false;
  }
  if (timestamp < pipeline.nextFrameEarliestAt) return true;
  if (!pipeline.frameInProgress) beginFrame(pipeline, timestamp);
  if (!submitBatch(pipeline)) return false;
  return (
    !reducedMotion ||
    pipeline.frameInProgress ||
    Boolean(pipeline.pendingSync) ||
    !pipeline.frontReady
  );
};
