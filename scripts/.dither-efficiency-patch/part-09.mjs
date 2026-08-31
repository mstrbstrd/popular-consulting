Contain("if (pausedRef.current && !forceRender");
      expect(renderer).toContain("return !pausedRef.current");
    });
    expect(rupture).toContain(
      "return !pausedRef.current && !reducedMotion",
    );
  });
`,
    "runtime cadence contract",
  );

  next = replaceExact(
    next,
    `  test("paint-only shaders compile only for the opt-in paint experience", () => {
    expect(field).toContain("const paintProgramsRequired =");
    expect(field).toContain("paintDisplayProgram = paintProgramsRequired");
    expect(field).toContain("paintReactionProgram = paintProgramsRequired");
    expect(field).toContain("[contextVersion, mode, morphogenExperience]");
  });
`,
    `  test("feedback resources exist only for Morphogen Divide", () => {
    expect(field).toContain("const reactionProgramsRequired =");
    expect(field).toContain("reactionProgram = reactionProgramsRequired");
    expect(field).toContain("reactionTargets = reactionProgramsRequired");
    expect(field).toContain('data-reaction-runtime={');
    expect(field).toContain("createNeutralReactionTexture");
    expect(field).toContain("gl.texSubImage2D(");
  });

  test("paint-only shaders compile only for the opt-in paint experience", () => {
    expect(field).toContain("const paintProgramsRequired =");
    expect(field).toContain("paintDisplayProgram = paintProgramsRequired");
    expect(field).toContain("paintReactionProgram = paintProgramsRequired");
    expect(field).toContain("[contextVersion, mode, morphogenExperience]");
  });
`,
    "lazy feedback contract",
  );

  next = replaceExact(
    next,
    `    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(blackHole).toContain('"/dither-canvas"');
`,
    `    expect(page).toContain('data-theme-mode={isDark ? "dark" : "light"}');
    expect(page).toContain(
      'paused: paused || transitionPhase === "exiting"',
    );
    expect(blackHole).toContain('"/dither-canvas"');
`,
    "outgoing renderer pause contract",
  );

  return next;
});

console.log("Dither canvas efficiency patch complete.");
