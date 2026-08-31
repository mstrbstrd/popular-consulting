        drawReactionStep(0.62, true);
        }
      }

      updateSize();
      draw();
      forceRender = false;
      if (!pausedRef.current || brush.down || brush.pending) scheduleFrame();
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
      const paintBrushPending =
        isMorphogenPaintActive()
        && (brush.down || brush.pending);
      if (pausedRef.current && !forceRender && !paintBrushPending) {
        return false;
      }
      if (!pausedRef.current) {
        localTime += delta;
        introElapsed = Math.min(
          INTRO_DURATION_SECONDS,
          introElapsed + delta,
        );
        simulate(delta, performance.now());
        advanceReaction();
      } else {
        currentMode = modeRef.current;
        incomingMode = currentMode;
        modeMix = 1;
        if (paintBrushPending) {
          drawReactionStep(0.62, true);
        }
      }

      draw();
      forceRender = false;
      return !pausedRef.current || brush.down || brush.pending;
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
    "field cadence render loop",
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
    "field visibility cancellation",
  );

  next = replaceExact(
    next,
    `      window.cancelAnimationFrame(rafId);
      redrawRef.current = () => {};
`,
    `      frameCadence.dispose();
      redrawRef.current = () => {};
`,
    "field cleanup cadence",
  );

  next = replaceExact(
    next,
    `      destroyReactionTargets(gl, reactionTargets);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
`,
    `      destroyReactionTargets(gl, reactionTargets);
      if (neutralReactionTexture) {
        gl.deleteTexture(neutralReactionTexture);
      }
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
`,
    "field final texture cleanup",
  );

  next = replaceExact(
    next,
    `      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      aria-hidden="true"
`,
    `      data-runtime-profile={ditherCanvasRuntimeProfile.id}
      data-field-specialization={FIELD_SCENE_FUNCTIONS[clampMode(mode)]}
      data-frame-cadence="timer-raf"
      data-reaction-runtime={
        clampMode(mode) === REACTION_MODE ? "active" : "inactive"
      }
      aria-hidden="true"
`,
    "field runtime data attributes",
  );

  return next;
});

update("src/components/CreatorOSLavaLampCanvas.js", (source) => {
  let next = source;

  next = replaceExact(
    next,
    "  createDitherCanvasContext,\n",
    "  createDitherCanvasCadence,\n  createDitherCanvasContext,\n",
    "lava cadence import",
  );

  next = replaceExact(
    next,
    `    let resizeObserver;
    let rafId = 0;
    let lastFrameAt = 0;
`,
    `    let resizeObserver;
    let frameCadence;
`,
    "lava runtime variables",
  );

  next = replaceExact(
    next,
    `    const handleContextLost = (event) => {
      event.preventDefault();
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      setFallback(true);
`,
    `    const handleContextLost = (event) => {
      event.preventDefault();
      frameCadence?.cancel();
      setFallback(true);
`,
    "lava context loss cancellation",
  );

  next = replaceExact(
    next,
    `      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
`,
    `      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      vertexShader = null;
      fragmentShader = null;
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
`,
    "lava shader release after link",
  );

  next = replaceExact(
    next,
    `      gl.uniform1f(lightUniform, lightRef.current);
      gl.uniform1f(introUniform, intro);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
`,
    `      gl.uniform1f(lightUniform, lightRef.current);
      gl.uniform1f(introUniform, intro);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
`,
    "lava clear removal",
  );

  next = replaceExact(
    next,
    `      introElapsed = 0;
      lastFrameAt = 0;
      forceRender = true;
`,
    `      introElapsed = 0;
      forceRender = true;
`,
    "lava reset clock removal",
  );

  next = replaceExact(
    next,
    `    function scheduleFrame() {
      if (
        rafId
 