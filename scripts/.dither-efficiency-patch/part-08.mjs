ntime data attribute",
  );

  return next;
});

update("src/components/DitherCanvasPage.js", (source) =>
  replaceExact(
    source,
    `    const sharedProps = {
      isDark,
      paused,
      resetVersion,
    };
`,
    `    const sharedProps = {
      isDark,
      paused: paused || transitionPhase === "exiting",
      resetVersion,
    };
`,
    "pause outgoing dither renderer",
  ),
);

update("src/utils/ditherCanvasRuntime.test.js", (source) => {
  let next = replaceExact(
    source,
    "  createDitherCanvasContext,\n",
    "  createDitherCanvasCadence,\n  createDitherCanvasContext,\n",
    "runtime cadence test import",
  );

  next = replaceExact(
    next,
    `  test("retries a caveated adapter with the same renderer options", () => {
`,
    `  test("sleeps between capped frames instead of polling every display refresh", () => {
    let now = 0;
    let nextId = 1;
    const animationFrames = new Map();
    const timers = new Map();
    const onFrame = jest
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const windowObject = {
      performance: { now: () => now },
      requestAnimationFrame: jest.fn((callback) => {
        const id = nextId;
        nextId += 1;
        animationFrames.set(id, callback);
        return id;
      }),
      cancelAnimationFrame: jest.fn((id) => {
        animationFrames.delete(id);
      }),
      setTimeout: jest.fn((callback) => {
        const id = nextId;
        nextId += 1;
        timers.set(id, callback);
        return id;
      }),
      clearTimeout: jest.fn((id) => {
        timers.delete(id);
      }),
    };
    const cadence = createDitherCanvasCadence({
      frameIntervalMs: 1000 / 30,
      onFrame,
      windowObject,
    });

    expect(cadence.schedule()).toBe(true);
    expect(cadence.schedule()).toBe(false);
    expect(animationFrames.size).toBe(1);

    const firstFrame = animationFrames.values().next().value;
    animationFrames.clear();
    firstFrame(0);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(1);
    expect(animationFrames.size).toBe(0);

    now = 34;
    const timer = timers.values().next().value;
    timers.clear();
    timer();
    expect(animationFrames.size).toBe(1);

    const secondFrame = animationFrames.values().next().value;
    animationFrames.clear();
    secondFrame(34);

    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(cadence.snapshot()).toMatchObject({
      animationFrameId: 0,
      timerId: 0,
      disposed: false,
    });

    cadence.dispose();
    expect(cadence.schedule()).toBe(false);
    expect(cadence.snapshot().disposed).toBe(true);
  });

  test("retries a caveated adapter with the same renderer options", () => {
`,
    "runtime cadence test",
  );

  return next;
});

update("src/components/CreatorOSFieldCanvas.test.js", (source) => {
  let next = replaceExact(
    source,
    'import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";\n',
    `import CreatorOSFieldCanvas, {
  specializeCreatorOSFieldFragmentShader,
} from "./CreatorOSFieldCanvas";
`,
    "field specialization test import",
  );

  next = replaceExact(
    next,
    `  test("keeps every refined study distinct inside one renderer", () => {
`,
    `  test("specializes every field study to one fixed GPU scene path", () => {
    const sceneFunctions = [
      "sceneMetabloom",
      "sceneTidalWeave",
      "sceneMoireHalo",
      "sceneContourDrift",
      "sceneMorphogen",
      "sceneQuasicrystal",
      "sceneHyperbolic",
      "sceneForwardPass",
    ];

    sceneFunctions.forEach((sceneFunction, mode) => {
      const specialized = specializeCreatorOSFieldFragmentShader(
        CREATOROS_FIELD_FRAGMENT_SHADER,
        mode,
      );
      const sampleStart = specialized.indexOf("vec4 sampleScene");
      const mainStart = specialized.indexOf("\\n\\nvoid main()", sampleStart);
      const sampleScene = specialized.slice(sampleStart, mainStart);
      expect(sampleScene).toContain(\`return \${sceneFunction}(uv, time)\`);
      expect(sampleScene).not.toContain("if (mode ==");
    });
  });

  test("keeps every refined study distinct inside one renderer", () => {
`,
    "field specialization test",
  );

  return next;
});

update("src/components/DitherCanvasRuntimeContract.test.js", (source) => {
  let next = replaceExact(
    source,
    `  test("hidden, paused, and reduced-motion states do not own permanent frame loops", () => {
    [field, lava].forEach((renderer) => {
      expect(renderer).toContain("rafId = 0");
      expect(renderer).toContain("function scheduleFrame()");
      expect(renderer).toContain("if (pausedRef.current && !forceRender");
      expect(renderer).toContain("window.cancelAnimationFrame(rafId)");
    });
    expect(rupture).toContain("const scheduleRender = () =>");
    expect(rupture).toContain("animationFrameRef.current = 0");
    expect(rupture).toContain(
      "if (!pausedRef.current && !reducedMotion) scheduleRender()",
    );
  });
`,
    `  test("hidden, paused, and reduced-motion states do not own permanent frame loops", () => {
    [field, lava, rupture].forEach((renderer) => {
      expect(renderer).toContain("createDitherCanvasCadence({");
      expect(renderer).toContain('data-frame-cadence="timer-raf"');
      expect(renderer).toMatch(/frameCadence\??\.cancel\(\)/);
      expect(renderer).toContain("frameCadence.dispose()");
    });
    [field, lava].forEach((renderer) => {
      expect(renderer).toCont