 setFallback(true);
`,
    "field context loss cancellation",
  );

  next = replaceExact(
    next,
    `      const paintProgramsRequired =
        modeRef.current === REACTION_MODE
        && morphogenPaintRef.current >= 0.5;
      displayProgram = createProgram(
        gl,
        CREATOROS_FIELD_FRAGMENT_SHADER,
        "CreatorOS original field",
      );
      paintDisplayProgram = paintProgramsRequired
        ? createProgram(
            gl,
            CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
            "CreatorOS sand paint field",
          )
        : null;
      reactionProgram = createProgram(
        gl,
        CREATOROS_REACTION_FRAGMENT_SHADER,
        "CreatorOS original reaction diffusion",
      );
      paintReactionProgram = paintProgramsRequired
        ? createProgram(
            gl,
            CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
            "CreatorOS sand paint reaction diffusion",
          )
        : null;
`,
    `      const activeMode = modeRef.current;
      const reactionProgramsRequired = activeMode === REACTION_MODE;
      const paintProgramsRequired =
        reactionProgramsRequired
        && morphogenPaintRef.current >= 0.5;
      displayProgram = createProgram(
        gl,
        specializeCreatorOSFieldFragmentShader(
          CREATOROS_FIELD_FRAGMENT_SHADER,
          activeMode,
        ),
        "CreatorOS specialized field",
      );
      paintDisplayProgram = paintProgramsRequired
        ? createProgram(
            gl,
            specializeCreatorOSFieldFragmentShader(
              CREATOROS_FIELD_PAINT_FRAGMENT_SHADER,
              activeMode,
            ),
            "CreatorOS sand paint field",
          )
        : null;
      reactionProgram = reactionProgramsRequired
        ? createProgram(
            gl,
            CREATOROS_REACTION_FRAGMENT_SHADER,
            "CreatorOS original reaction diffusion",
          )
        : null;
      paintReactionProgram = paintProgramsRequired
        ? createProgram(
            gl,
            CREATOROS_REACTION_PAINT_FRAGMENT_SHADER,
            "CreatorOS sand paint reaction diffusion",
          )
        : null;
`,
    "field lazy program initialization",
  );

  next = replaceExact(
    next,
    `      configurePosition(gl, displayProgram, positionBuffer);
      if (paintDisplayProgram) {
        configurePosition(gl, paintDisplayProgram, positionBuffer);
      }
      configurePosition(gl, reactionProgram, positionBuffer);
      if (paintReactionProgram) {
        configurePosition(gl, paintReactionProgram, positionBuffer);
      }

      reactionTargets = createReactionTargets(
        gl,
        REACTION_SIZE,
        seed,
        morphogenPaintRef.current >= 0.5,
      );
`,
    `      configurePosition(gl, displayProgram, positionBuffer);
      if (paintDisplayProgram) {
        configurePosition(gl, paintDisplayProgram, positionBuffer);
      }
      if (reactionProgram) {
        configurePosition(gl, reactionProgram, positionBuffer);
      }
      if (paintReactionProgram) {
        configurePosition(gl, paintReactionProgram, positionBuffer);
      }

      neutralReactionTexture = createNeutralReactionTexture(gl);
      reactionTargets = reactionProgramsRequired
        ? createReactionTargets(
            gl,
            REACTION_SIZE,
            seed,
            morphogenPaintRef.current >= 0.5,
          )
        : null;
`,
    "field lazy reaction targets",
  );

  next = replaceExact(
    next,
    `      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      destroyReactionTargets(gl, reactionTargets);
      if (positionBuffer && gl) gl.deleteBuffer(positionBuffer);
`,
    `      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      destroyReactionTargets(gl, reactionTargets);
      if (neutralReactionTexture && gl) {
        gl.deleteTexture(neutralReactionTexture);
      }
      if (positionBuffer && gl) gl.deleteBuffer(positionBuffer);
`,
    "field initialization cleanup",
  );

  next = replaceExact(
    next,
    `    const reactionUniforms = collectUniforms(
      gl,
      reactionProgram,
      reactionUniformNames,
    );
`,
    `    const reactionUniforms = reactionProgram
      ? collectUniforms(
          gl,
          reactionProgram,
          reactionUniformNames,
        )
      : null;
`,
    "field optional reaction uniforms",
  );

  next = replaceExact(
    next,
    `      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = target.width;
        canvas.height = target.height;
        root.dataset.renderWidth = String(target.width);
        root.dataset.renderHeight = String(target.height);
        forceRender = true;
      }
    };

    const readPointer = (event) => {
      const bounds = root.getBoundingClientRect();
      return {
        x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1)),
        y: clamp(1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)),
      };
    };
`,
    `      pointerBounds.left = bounds.left;
      pointerBounds.top = bounds.top;
      pointerBounds.width = Math.max(bounds.width, 1);
      pointerBounds.height = Math.max(bounds.height, 1);
      if (canvas.width !== target.width || canvas.height !== target.height) {
        canvas.width = 