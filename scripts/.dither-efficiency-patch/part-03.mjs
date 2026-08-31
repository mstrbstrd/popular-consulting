target.width;
        canvas.height = target.height;
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRender = true;
      }
    };

    const readPointer = (event) => ({
      x: clamp(
        (event.clientX - pointerBounds.left) / pointerBounds.width,
      ),
      y: clamp(
        1 - (event.clientY - pointerBounds.top) / pointerBounds.height,
      ),
    });
`,
    "field cached layout bounds",
  );

  next = replaceExact(
    next,
    `      resetReactionTargets(
        gl,
        reactionTargets,
        seed,
        morphogenPaintRef.current >= 0.5,
      );
`,
    `      if (reactionTargets) {
        resetReactionTargets(
          gl,
          reactionTargets,
          seed,
          morphogenPaintRef.current >= 0.5,
        );
      }
`,
    "field optional reaction reset",
  );

  next = replaceExact(
    next,
    `      forceRender = true;
      lastFrameAt = 0;
    };
`,
    `      forceRender = true;
    };
`,
    "field reset clock removal",
  );

  next = replaceExact(
    next,
    `      if (page) {
        const chroma = energy * 0.58;
        page.style.setProperty("--rupture-energy", energy.toFixed(3));
        page.style.setProperty("--rupture-x", pointer.x.toFixed(3));
        page.style.setProperty("--rupture-y", pointer.y.toFixed(3));
        page.style.setProperty("--rupture-lift", \`\${(-energy * 3.7).toFixed(2)}px\`);
        page.style.setProperty("--rupture-chroma-positive", \`\${chroma.toFixed(2)}rem\`);
        page.style.setProperty(
          "--rupture-chroma-negative",
          \`\${(-chroma * 0.72).toFixed(2)}rem\`,
        );
      }
`,
    `      if (page) {
        const chroma = energy * 0.58;
        setPageStyle("--rupture-energy", energy.toFixed(3));
        setPageStyle("--rupture-x", pointer.x.toFixed(3));
        setPageStyle("--rupture-y", pointer.y.toFixed(3));
        setPageStyle(
          "--rupture-lift",
          \`\${(-energy * 3.7).toFixed(2)}px\`,
        );
        setPageStyle(
          "--rupture-chroma-positive",
          \`\${chroma.toFixed(2)}rem\`,
        );
        setPageStyle(
          "--rupture-chroma-negative",
          \`\${(-chroma * 0.72).toFixed(2)}rem\`,
        );
      }
`,
    "field cached CSS writes",
  );

  next = replaceExact(
    next,
    `    const drawReactionStep = (timeStep = 1.0, allowBrush = true) => {
      const writeIndex = 1 - reactionTargets.readIndex;
`,
    `    const drawReactionStep = (timeStep = 1.0, allowBrush = true) => {
      if (!reactionTargets || !reactionProgram) return;

      const writeIndex = 1 - reactionTargets.readIndex;
`,
    "field reaction guard",
  );

  next = replaceExact(
    next,
    `      const reactionVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
      if (!reactionVisible && reactionWarmupRemaining <= 0) return;
`,
    `      const reactionVisible =
        currentMode === REACTION_MODE || incomingMode === REACTION_MODE;
      if (
        !reactionTargets
        || (!reactionVisible && reactionWarmupRemaining <= 0)
      ) {
        return;
      }
`,
    "field reaction advance guard",
  );

  next = replaceExact(
    next,
    `      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(
        gl.TEXTURE_2D,
        reactionTargets.textures[reactionTargets.readIndex],
      );
      gl.uniform1i(activeDisplayUniforms.u_reaction, 0);
      gl.uniform2f(
        activeDisplayUniforms.u_reactionTexel,
        1 / reactionTargets.size,
        1 / reactionTargets.size,
      );

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
`,
    `      const reactionTexture = reactionTargets
        ? reactionTargets.textures[reactionTargets.readIndex]
        : neutralReactionTexture;
      const reactionSize = reactionTargets?.size || 1;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, reactionTexture);
      gl.uniform1i(activeDisplayUniforms.u_reaction, 0);
      gl.uniform2f(
        activeDisplayUniforms.u_reactionTexel,
        1 / reactionSize,
        1 / reactionSize,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 3);
`,
    "field neutral texture and clear removal",
  );

  next = replaceExact(
    next,
    `    function scheduleFrame() {
      if (
        rafId
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

      const paintBrushPending =
        isMorphogenPaintActive()
        && (brush.down || brush.pending);
      if (pausedRef.current && !forceRender && !paintBrushPending) return;
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
  