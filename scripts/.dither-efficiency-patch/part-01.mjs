bject.freeze([
  "sceneMetabloom",
  "sceneTidalWeave",
  "sceneMoireHalo",
  "sceneContourDrift",
  "sceneMorphogen",
  "sceneQuasicrystal",
  "sceneHyperbolic",
  "sceneForwardPass",
]);
const FIELD_SAMPLE_SCENE_MARKER =
  "vec4 sampleScene(int mode, vec2 uv, float time) {";
const FIELD_MAIN_MARKER = "\\n\\nvoid main() {";
`,
    "field scene constants",
  );

  next = replaceExact(
    next,
    `const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));

`,
    `const clampMode = (mode) =>
  Math.max(0, Math.min(MODE_COUNT - 1, Number.isFinite(mode) ? mode : 0));

export const specializeCreatorOSFieldFragmentShader = (source, mode) => {
  const activeMode = clampMode(mode);
  const sampleStart = source.indexOf(FIELD_SAMPLE_SCENE_MARKER);
  const mainStart = source.indexOf(FIELD_MAIN_MARKER, sampleStart);

  if (sampleStart < 0 || mainStart < 0) {
    throw new Error(
      "The CreatorOS field shader specialization boundary is missing.",
    );
  }

  const specializedSampleScene = [
    FIELD_SAMPLE_SCENE_MARKER,
    \`  return \${FIELD_SCENE_FUNCTIONS[activeMode]}(uv, time);\`,
    "}",
  ].join("\\n");

  return source.slice(0, sampleStart)
    + specializedSampleScene
    + source.slice(mainStart);
};

`,
    "field shader specialization",
  );

  next = replaceExact(
    next,
    `      circles.forEach((circle) => {
        const deltaX = uvX - circle.x;
        const deltaY = uvY - circle.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < circle.radius) {
          const amount = 1 - distance / circle.radius;
          v = Math.max(v, circle.strength * amount);
        }
      });
`,
    `      for (let index = 0; index < circles.length; index += 1) {
        const circle = circles[index];
        const deltaX = uvX - circle.x;
        const deltaY = uvY - circle.y;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        const radiusSquared = circle.radius * circle.radius;
        if (distanceSquared < radiusSquared) {
          const amount = 1 - Math.sqrt(distanceSquared) / circle.radius;
          v = Math.max(v, circle.strength * amount);
        }
      }
`,
    "reaction seed distance calculation",
  );

  next = replaceExact(
    next,
    `    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      targets.size,
      targets.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
`,
    `    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      targets.size,
      targets.size,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
`,
    "reaction target reset upload",
  );

  next = replaceExact(
    next,
    `const destroyReactionTargets = (gl, targets) => {
  targets?.textures?.forEach((texture) => gl.deleteTexture(texture));
  targets?.framebuffers?.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
};

`,
    `const destroyReactionTargets = (gl, targets) => {
  targets?.textures?.forEach((texture) => gl.deleteTexture(texture));
  targets?.framebuffers?.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
};

const createNeutralReactionTexture = (gl) => {
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error("The CreatorOS neutral reaction texture is unavailable.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 0, 0, 255]),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
};

`,
    "neutral reaction texture helper",
  );

  next = replaceExact(
    next,
    `    let reactionTargets;
    let resizeObserver;
    let rafId = 0;
    let lastFrameAt = 0;
`,
    `    let reactionTargets;
    let neutralReactionTexture;
    let resizeObserver;
    let frameCadence;
`,
    "field effect runtime variables",
  );

  next = replaceExact(
    next,
    `    const pointer = {
      x: 0.52,
      y: 0.52,
      sampleX: 0.52,
      sampleY: 0.52,
      lastActivityAt: performance.now(),
    };
`,
    `    const pointer = {
      x: 0.52,
      y: 0.52,
      sampleX: 0.52,
      sampleY: 0.52,
      lastActivityAt: performance.now(),
    };
    const pointerBounds = {
      left: 0,
      top: 0,
      width: 1,
      height: 1,
    };
`,
    "field pointer bounds",
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
    "field CSS style cache",
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
     