       || !documentVisible
        || reducedMotion
      ) {
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    }

    function tick(now) {
      rafId = 0;
      if (!documentVisible) return;
      if (reducedMotion) {
        drawStatic();
        return;
      }
      if (now - lastFrameAt < FRAME_INTERVAL_MS) {
        scheduleFrame();
        return;
      }

      const delta = lastFrameAt
        ? Math.min((now - lastFrameAt) / 1000, 0.1)
        : 0;
      lastFrameAt = now;
      applyRestart();

      if (pausedRef.current && !forceRender) return;
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(INTRO_DURATION_SECONDS, introElapsed + delta);
      }

      updateSize();
      const intro = Math.min(1, introElapsed / INTRO_DURATION_SECONDS);
      draw(localTime, intro);
      reportState(intro < 1 ? "warming" : "flowing");
      forceRender = false;
      if (!pausedRef.current) scheduleFrame();
    }

    const start = () => {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      applyRestart();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      scheduleFrame();
    };
`,
    `    const renderFrame = ({ deltaMs }) => {
      if (!documentVisible) return false;
      if (reducedMotion) {
        drawStatic();
        return false;
      }

      const restarted = applyRestart();
      const delta = restarted
        ? 0
        : Math.min(deltaMs / 1000, 0.1);
      if (pausedRef.current && !forceRender) return false;
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(INTRO_DURATION_SECONDS, introElapsed + delta);
      }

      const intro = Math.min(1, introElapsed / INTRO_DURATION_SECONDS);
      draw(localTime, intro);
      reportState(intro < 1 ? "warming" : "flowing");
      forceRender = false;
      return !pausedRef.current;
    };

    frameCadence = createDitherCanvasCadence({
      frameIntervalMs: FRAME_INTERVAL_MS,
      onFrame: renderFrame,
    });

    const scheduleFrame = () => {
      if (!documentVisible || reducedMotion) return false;
      return frameCadence.schedule();
    };

    const start = () => {
      frameCadence.reset();
      applyRestart();
      updateSize();
      if (reducedMotion) {
        drawStatic();
        return;
      }
      forceRender = true;
      scheduleFrame();
    };
`,
    "lava cadence render loop",
  );

  next = replaceExact(
    next,
    `      if (!documentVisible) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
`,
    `      if (!documentVisible) {
        frameCadence.cancel();
      } else {
`,
    "lava visibility cancellation",
  );

  next = replaceExact(
    next,
    `      window.cancelAnimationFrame(rafId);
      redrawRef.current = () => {};
`,
    `      frameCadence.dispose();
      redrawRef.current = () => {};
`,
    "lava cleanup cadence",
  );

  next = replaceExact(
    next,
    `      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      aria-hidden="true"
`,
    `      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      data-frame-cadence="timer-raf"
      aria-hidden="true"
`,
    "lava runtime data attribute",
  );

  return next;
});

update("src/components/RuptureCanvas.js", (source) => {
  let next = source;

  next = replaceExact(
    next,
    "  createDitherCanvasContext,\n",
    "  createDitherCanvasCadence,\n  createDitherCanvasContext,\n",
    "rupture cadence import",
  );

  next = replaceExact(
    next,
    `  const animationFrameRef = useRef(0);
  const forceRenderRef = useRef(true);
`,
    `  const forceRenderRef = useRef(true);
`,
    "rupture animation frame ref removal",
  );

  next = replaceExact(
    next,
    `    let resizeObserver;
    let documentVisible = document.visibilityState !== "hidden";
`,
    `    let resizeObserver;
    let frameCadence;
    let documentVisible = document.visibilityState !== "hidden";
`,
    "rupture cadence variable",
  );

  next = replaceExact(
    next,
    `      if (!documentVisible) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
        return;
      }
`,
    `      if (!documentVisible) {
        frameCadence?.cancel();
        return;
      }
`,
    "rupture visibility cancellation",
  );

  next = replaceExact(
    next,
    `      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
      setFallback(true);
`,
    `      frameCadence?.cancel();
      setFallback(true);
`,
    "rupture context loss cancellation",
  );

  next = replaceExact(
    next,
    `    const openings = new Float32Array(MAX_NODES);
    const scars = new Float32Array(MAX_NODES);
    const nodeData = new Float32Array(MAX_NODES * 4);

`,
    `    const openings = new Float32Array(MAX_NODES);
    const scars = new Float32Array(MAX_NODES);
    const nodeData = new Float32Array(MAX_NODES * 4);
    for (let index = 0; index < MAX_NODES; index += 1) {
      const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
      const x = -0.06 + (sourceIndex / (ACTIVE_NODES - 1)) * 1.12;
      const offset = index * 4;
      nodeData[offset] = x;
      nodeData[offset + 1] = baseFaultY(x);
    }

`,
    "rupture static node geometry",
  );

  next = replaceExact(
    next,
    `    const pointer = { x: 0.52, y: 0.52 };
    const drag = {
`,
    `    const pointer = { x: 0.52, y: 0.52 };