const readDocumentVisible = (documentObject) =>
  !documentObject || documentObject.visibilityState !== "hidden";

const readReducedMotion = (windowObject) =>
  Boolean(
    windowObject?.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    )?.matches,
  );

const normalizeReason = (reason) =>
  String(reason || "unspecified").trim().slice(0, 80) ||
  "unspecified";

export const createVisualRuntimeScheduler = ({
  windowObject = typeof window === "undefined" ? null : window,
  documentObject = typeof document === "undefined" ? null : document,
  onFrame = () => ({ continue: false }),
  onError = () => {},
  onStateChange = () => {},
} = {}) => {
  if (!windowObject?.requestAnimationFrame) {
    throw new Error(
      "visual runtime scheduler requires requestAnimationFrame",
    );
  }

  const requestAnimationFrame =
    windowObject.requestAnimationFrame.bind(windowObject);
  const cancelAnimationFrame =
    windowObject.cancelAnimationFrame?.bind(windowObject) || (() => {});
  const motionQuery = windowObject.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  );

  const dirtyReasons = new Set();
  const suspensions = new Set();
  let frameId = 0;
  let frameCount = 0;
  let lastTimestamp = 0;
  let disposed = false;
  let started = false;
  let visible = readDocumentVisible(documentObject);
  let reducedMotion = readReducedMotion(windowObject);
  let state = "created";

  const setState = (nextState) => {
    if (state === nextState) return;
    state = nextState;
    onStateChange(nextState);
  };

  const cancelScheduledFrame = () => {
    if (!frameId) return;
    cancelAnimationFrame(frameId);
    frameId = 0;
  };

  const syncIdleState = () => {
    if (disposed) {
      setState("disposed");
    } else if (suspensions.size > 0) {
      setState("suspended");
    } else if (!visible) {
      setState("hidden");
    } else if (reducedMotion) {
      setState("reduced-motion");
    } else {
      setState("idle");
    }
  };

  const schedule = () => {
    if (
      disposed ||
      frameId ||
      suspensions.size > 0 ||
      !visible ||
      dirtyReasons.size === 0
    ) {
      if (!frameId) syncIdleState();
      return false;
    }

    frameId = requestAnimationFrame(runFrame);
    setState("scheduled");
    return true;
  };

  const invalidate = (reason = "external") => {
    if (disposed) return false;
    dirtyReasons.add(normalizeReason(reason));
    schedule();
    return true;
  };

  function runFrame(timestamp) {
    frameId = 0;

    if (disposed || suspensions.size > 0 || !visible) {
      syncIdleState();
      return;
    }

    const reasons = Array.from(dirtyReasons);
    dirtyReasons.clear();
    const deltaMs = lastTimestamp
      ? Math.max(0, Number(timestamp) - lastTimestamp)
      : 0;
    lastTimestamp = Number(timestamp) || 0;
    setState("rendering");

    try {
      const result = onFrame({
        timestamp: lastTimestamp,
        deltaMs,
        reasons,
        reducedMotion,
        frameCount,
      });
      frameCount += 1;

      if (result?.continue && !reducedMotion) {
        dirtyReasons.add("continuous-pass");
      }
    } catch (error) {
      suspensions.add("frame-error");
      onError(error);
    }

    if (!schedule()) syncIdleState();
  }

  const handleVisibilityChange = () => {
    visible = readDocumentVisible(documentObject);
    if (!visible) {
      cancelScheduledFrame();
      setState("hidden");
      return;
    }
    invalidate("visibility-restored");
  };

  const handleMotionChange = () => {
    reducedMotion = Boolean(motionQuery?.matches);
    invalidate("reduced-motion-changed");
  };

  const start = () => {
    if (started || disposed) return false;
    started = true;
    documentObject?.addEventListener?.(
      "visibilitychange",
      handleVisibilityChange,
    );
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", handleMotionChange);
    } else {
      motionQuery?.addListener?.(handleMotionChange);
    }
    syncIdleState();
    return true;
  };

  const suspend = (reason = "external") => {
    if (disposed) return false;
    suspensions.add(normalizeReason(reason));
    cancelScheduledFrame();
    setState("suspended");
    return true;
  };

  const resume = (reason = "external") => {
    if (disposed) return false;
    suspensions.delete(normalizeReason(reason));
    if (suspensions.size > 0) return false;
    invalidate(`resume:${normalizeReason(reason)}`);
    return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelScheduledFrame();
    dirtyReasons.clear();
    suspensions.clear();
    documentObject?.removeEventListener?.(
      "visibilitychange",
      handleVisibilityChange,
    );
    if (motionQuery?.removeEventListener) {
      motionQuery.removeEventListener("change", handleMotionChange);
    } else {
      motionQuery?.removeListener?.(handleMotionChange);
    }
    setState("disposed");
  };

  return {
    dispose,
    invalidate,
    resume,
    start,
    suspend,
    snapshot: () => ({
      state,
      started,
      disposed,
      visible,
      reducedMotion,
      frameScheduled: Boolean(frameId),
      frameCount,
      pendingReasons: Array.from(dirtyReasons),
      suspensions: Array.from(suspensions),
    }),
  };
};
