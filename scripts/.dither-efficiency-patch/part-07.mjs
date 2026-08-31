"rupture pointer style update",
  );

  next = replaceExact(
    next,
    `    const uploadGeometry = () => {
      for (let index = 0; index < MAX_NODES; index += 1) {
        const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
        const x = -0.06 + (sourceIndex / (ACTIVE_NODES - 1)) * 1.12;
        const offset = index * 4;
        nodeData[offset] = x;
        nodeData[offset + 1] = baseFaultY(x);
        nodeData[offset + 2] = openings[sourceIndex];
        nodeData[offset + 3] = scars[sourceIndex];
      }
    };

    const draw = () => {
      uploadGeometry();
      gl.useProgram(program);
`,
    `    const uploadGeometry = () => {
      for (let index = 0; index < MAX_NODES; index += 1) {
        const sourceIndex = Math.min(index, ACTIVE_NODES - 1);
        const offset = index * 4;
        nodeData[offset + 2] = openings[sourceIndex];
        nodeData[offset + 3] = scars[sourceIndex];
      }
      gl.uniform4fv(uniforms["u_nodes[0]"], nodeData);
      geometryDirty = false;
    };

    gl.useProgram(program);
    gl.uniform1i(uniforms.u_nodeCount, ACTIVE_NODES);
    gl.uniform4fv(uniforms["u_branches[0]"], branchData);
    gl.uniform4fv(uniforms["u_branchMeta[0]"], branchMeta);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
    gl.uniform1i(uniforms.u_atlas, 0);
    gl.uniform1f(uniforms.u_cellSize, isMobileTier ? 12 : 7);
    gl.uniform1i(uniforms.u_charCount, GLYPHS.length);
    gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
    gl.uniform1i(uniforms.u_atlasRows, atlas.rows);

    const draw = () => {
      gl.useProgram(program);
      if (geometryDirty) uploadGeometry();
`,
    "rupture static GPU state",
  );

  next = replaceExact(
    next,
    `      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.uniform1i(uniforms.u_nodeCount, ACTIVE_NODES);
      gl.uniform4fv(uniforms["u_nodes[0]"], nodeData);
      gl.uniform4fv(uniforms["u_branches[0]"], branchData);
      gl.uniform4fv(uniforms["u_branchMeta[0]"], branchMeta);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlas.texture);
      gl.uniform1i(uniforms.u_atlas, 0);
      gl.uniform1f(uniforms.u_cellSize, isMobileTier ? 12 : 7);
      gl.uniform1i(uniforms.u_charCount, GLYPHS.length);
      gl.uniform1i(uniforms.u_atlasCols, atlas.columns);
      gl.uniform1i(uniforms.u_atlasRows, atlas.rows);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
`,
    `      gl.uniform1f(uniforms.u_reveal, reveal);
      gl.uniform2f(uniforms.u_pointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
`,
    "rupture dynamic GPU state",
  );

  next = replaceExact(
    next,
    `    const render = (timestamp) => {
      animationFrameRef.current = 0;
      if (!documentVisible) return;

      const shouldOnlyRefresh = pausedRef.current || reducedMotion;
      if (shouldOnlyRefresh && !forceRenderRef.current) return;

      const minimumFrameMs = reducedMotion ? REDUCED_FRAME_MS : TARGET_FRAME_MS;
      if (timestamp - lastFrameAt < minimumFrameMs) {
        scheduleRender();
        return;
      }
      const delta = lastFrameAt
        ? Math.min((timestamp - lastFrameAt) / 1000, 1 / 18)
        : 0;
      lastFrameAt = timestamp;

      if (!pausedRef.current && !reducedMotion) {
        localTime += delta;
        reveal = Math.min(1, reveal + delta / 1.9);
      } else if (reducedMotion) {
        reveal = 1;
      }

      updateOpening(delta);
      updateSize();
      draw();
      forceRenderRef.current = false;
      if (!pausedRef.current && !reducedMotion) scheduleRender();
    };

    const scheduleRender = () => {
      if (
        animationFrameRef.current
        || !documentVisible
      ) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };

    requestRenderRef.current = scheduleRender;
    scheduleRender();
`,
    `    const render = ({ deltaMs }) => {
      if (!documentVisible) return false;

      const shouldOnlyRefresh = pausedRef.current || reducedMotion;
      if (shouldOnlyRefresh && !forceRenderRef.current) return false;
      const delta = Math.min(deltaMs / 1000, 1 / 18);

      if (!pausedRef.current && !reducedMotion) {
        localTime += delta;
        reveal = Math.min(1, reveal + delta / 1.9);
      } else if (reducedMotion) {
        reveal = 1;
      }

      updateOpening(delta);
      draw();
      forceRenderRef.current = false;
      return !pausedRef.current && !reducedMotion;
    };

    frameCadence = createDitherCanvasCadence({
      frameIntervalMs: () =>
        reducedMotion ? REDUCED_FRAME_MS : TARGET_FRAME_MS,
      onFrame: render,
    });

    const scheduleRender = () => {
      if (!documentVisible) return false;
      return frameCadence.schedule();
    };

    requestRenderRef.current = scheduleRender;
    scheduleRender();
`,
    "rupture cadence render loop",
  );

  next = replaceExact(
    next,
    `      cancelAnimationFrame(animationFrameRef.current);
      resetSimulationRef.current = () => {};
`,
    `      frameCadence.dispose();
      resetSimulationRef.current = () => {};
`,
    "rupture cadence cleanup",
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
    "rupture ru