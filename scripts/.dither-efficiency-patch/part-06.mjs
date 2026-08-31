
    const pointerBounds = {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    };
    const drag = {
`,
    "rupture pointer bounds",
  );

  next = replaceExact(
    next,
    `    let currentEnergy = 0;
    let lastFrameAt = 0;
    let activeState = "sealed";
`,
    `    let currentEnergy = 0;
    let geometryDirty = true;
    let activeState = "sealed";
`,
    "rupture geometry dirty state",
  );

  next = replaceExact(
    next,
    `    const page = root.closest(".dither-canvas-page");
    const pointerSurface = page || root;

`,
    `    const page = root.closest(".dither-canvas-page");
    const pointerSurface = page || root;
    const pageStyleCache = new Map();

    const setPageStyle = (name, value) => {
      if (!page || pageStyleCache.get(name) === value) return;
      pageStyleCache.set(name, value);
      page.style.setProperty(name, value);
    };

`,
    "rupture CSS style cache",
  );

  next = replaceExact(
    next,
    `      const chroma = currentEnergy * 0.62;
      page.style.setProperty("--rupture-energy", currentEnergy.toFixed(3));
      page.style.setProperty("--rupture-x", pointer.x.toFixed(3));
      page.style.setProperty("--rupture-y", pointer.y.toFixed(3));
      page.style.setProperty(
        "--rupture-lift",
        \`\${(-currentEnergy * 4.5).toFixed(2)}px\`,
      );
      page.style.setProperty(
        "--rupture-chroma-positive",
        \`\${chroma.toFixed(2)}rem\`,
      );
      page.style.setProperty(
        "--rupture-chroma-negative",
        \`\${(-chroma * 0.72).toFixed(2)}rem\`,
      );
`,
    `      const chroma = currentEnergy * 0.62;
      setPageStyle("--rupture-energy", currentEnergy.toFixed(3));
      setPageStyle("--rupture-x", pointer.x.toFixed(3));
      setPageStyle("--rupture-y", pointer.y.toFixed(3));
      setPageStyle(
        "--rupture-lift",
        \`\${(-currentEnergy * 4.5).toFixed(2)}px\`,
      );
      setPageStyle(
        "--rupture-chroma-positive",
        \`\${chroma.toFixed(2)}rem\`,
      );
      setPageStyle(
        "--rupture-chroma-negative",
        \`\${(-chroma * 0.72).toFixed(2)}rem\`,
      );
`,
    "rupture cached CSS writes",
  );

  next = replaceExact(
    next,
    `    const updateOpening = (delta) => {
      const response = reducedMotion || pausedRef.current
`,
    `    const updateOpening = (delta) => {
      const previousProgress = progress;
      const response = reducedMotion || pausedRef.current
`,
    "rupture progress change capture",
  );

  next = replaceExact(
    next,
    `      const easedProgress = smoothStep(progress);
      const opening = openingForProgress(progress);
      for (let index = 0; index < ACTIVE_NODES; index += 1) {
        const position = index / Math.max(ACTIVE_NODES - 1, 1);
        const center = Math.exp(-Math.pow((position - 0.57) / 0.24, 2));
        const edgeAllowance = 0.90 + center * 0.10;
        openings[index] = opening * edgeAllowance;
        scars[index] = Math.min(opening, 1) * (0.08 + center * 0.11);
      }

      currentEnergy = easedProgress;
      reportState(stateForProgress(progress));
`,
    `      const easedProgress = smoothStep(progress);
      const openingChanged =
        Math.abs(progress - previousProgress) >= 0.000001;
      if (openingChanged || geometryDirty) {
        const opening = openingForProgress(progress);
        for (let index = 0; index < ACTIVE_NODES; index += 1) {
          const position = index / Math.max(ACTIVE_NODES - 1, 1);
          const center = Math.exp(
            -Math.pow((position - 0.57) / 0.24, 2),
          );
          const edgeAllowance = 0.90 + center * 0.10;
          openings[index] = opening * edgeAllowance;
          scars[index] = Math.min(opening, 1)
            * (0.08 + center * 0.11);
        }
        geometryDirty = true;
      }

      currentEnergy = easedProgress;
      reportState(stateForProgress(progress));
`,
    "rupture geometry invalidation",
  );

  next = replaceExact(
    next,
    `      currentEnergy = smoothStep(resetProgress);
      pointer.x = 0.52;
`,
    `      currentEnergy = smoothStep(resetProgress);
      geometryDirty = true;
      pointer.x = 0.52;
`,
    "rupture reset geometry invalidation",
  );

  next = replaceExact(
    next,
    `      width = Math.max(bounds.width, 1);
      height = Math.max(bounds.height, 1);
`,
    `      width = Math.max(bounds.width, 1);
      height = Math.max(bounds.height, 1);
      pointerBounds.left = bounds.left;
      pointerBounds.top = bounds.top;
      pointerBounds.width = width;
      pointerBounds.height = height;
`,
    "rupture cached layout bounds",
  );

  next = replaceExact(
    next,
    `    const readPointer = (event) => {
      const bounds = root.getBoundingClientRect();
      return {
        x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1)),
        y: clamp(1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)),
      };
    };
`,
    `    const readPointer = (event) => ({
      x: clamp(
        (event.clientX - pointerBounds.left) / pointerBounds.width,
      ),
      y: clamp(
        1 - (event.clientY - pointerBounds.top) / pointerBounds.height,
      ),
    });
`,
    "rupture pointer layout reuse",
  );

  next = replaceExact(
    next,
    `      pointer.x = next.x;
      pointer.y = next.y;
      forceRenderRef.current = true;
`,
    `      pointer.x = next.x;
      pointer.y = next.y;
      updatePageStyles();
      forceRenderRef.current = true;
`,
    