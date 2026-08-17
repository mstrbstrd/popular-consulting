import React from "react";
import { isMobileTier } from "../utils/deviceTier";

const ORB_SOURCE_SELECTOR =
  ".standalone-experience--orb .standalone-experience__dither > canvas:first-of-type";

export const ORB_METALBLOOM_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const ORB_METALBLOOM_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_source;
uniform vec2 u_texel;
uniform float u_time;
uniform float u_dark;

float sat(float value) {
  return clamp(value, 0.0, 1.0);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += noise(p) * amplitude;
    p = p * 2.03 + vec2(7.1, 3.7);
    amplitude *= 0.5;
  }
  return value;
}

float sourceChroma(vec3 color) {
  return max(max(color.r, color.g), color.b)
    - min(min(color.r, color.g), color.b);
}

float sourceHeight(vec2 uv) {
  vec3 source = texture(u_source, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
  float chroma = sourceChroma(source);
  float luma = dot(source, vec3(0.299, 0.587, 0.114));
  return smoothstep(0.025, 0.155, chroma) * mix(0.44, 1.0, luma);
}

vec3 normalizedSpectrum(vec3 color) {
  vec3 lifted = pow(max(color, vec3(0.0)), vec3(0.72));
  float luma = max(dot(lifted, vec3(0.299, 0.587, 0.114)), 0.08);
  return clamp(lifted * (0.72 / luma), vec3(0.0), vec3(1.35));
}

void main() {
  vec3 source = texture(u_source, v_uv).rgb;
  float chroma = sourceChroma(source);
  float presence = smoothstep(0.025, 0.145, chroma);

  float heightCenter = sourceHeight(v_uv);
  float heightLeft = sourceHeight(v_uv - vec2(u_texel.x * 4.0, 0.0));
  float heightRight = sourceHeight(v_uv + vec2(u_texel.x * 4.0, 0.0));
  float heightDown = sourceHeight(v_uv - vec2(0.0, u_texel.y * 4.0));
  float heightUp = sourceHeight(v_uv + vec2(0.0, u_texel.y * 4.0));
  float neighbourPresence = max(
    max(heightLeft, heightRight),
    max(heightDown, heightUp)
  );
  float shellPresence = max(presence, neighbourPresence * 0.34);

  if (shellPresence < 0.002) {
    fragColor = vec4(0.0);
    return;
  }

  float colorFlow = fbm(
    v_uv * vec2(3.2, 2.6)
      + vec2(u_time * 0.035, -u_time * 0.021)
  );
  float secondaryFlow = fbm(
    v_uv.yx * vec2(5.1, 3.7)
      + vec2(-u_time * 0.018, u_time * 0.027)
      + 11.4
  );

  vec2 metalSlope = vec2(
    heightLeft - heightRight,
    heightDown - heightUp
  ) * 7.2;
  metalSlope += vec2(
    colorFlow - secondaryFlow,
    secondaryFlow - 0.5
  ) * 0.24 * shellPresence;
  vec3 topologyNormal = normalize(vec3(
    metalSlope,
    0.72 + heightCenter * 0.48
  ));
  float aspect = u_texel.y / max(u_texel.x, 0.000001);
  vec2 orbPoint = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);
  const float orbRadius = 0.315;
  float orbDepth = sqrt(max(
    orbRadius * orbRadius - dot(orbPoint, orbPoint),
    0.00001
  ));
  vec3 orbNormal = normalize(vec3(orbPoint, orbDepth));
  float orbMaterial = 1.0 - smoothstep(
    orbRadius * 0.82,
    orbRadius * 1.14,
    length(orbPoint)
  );
  vec3 metalNormal = normalize(mix(
    topologyNormal,
    orbNormal,
    orbMaterial * 0.76
  ));

  vec3 viewDirection = vec3(0.0, 0.0, 1.0);
  vec3 reflectedDirection = reflect(-viewDirection, metalNormal);
  vec3 keyDirection = normalize(vec3(-0.48, 0.66, 0.86));
  vec3 counterDirection = normalize(vec3(0.72, -0.24, 0.64));
  vec3 halfVector = normalize(keyDirection + viewDirection);

  float keySpecular = pow(max(dot(metalNormal, halfVector), 0.0), 42.0);
  float counterSpecular = pow(
    max(dot(metalNormal, normalize(counterDirection + viewDirection)), 0.0),
    24.0
  );
  float horizonStrip = exp(
    -pow((reflectedDirection.y + 0.48) * 7.2, 2.0)
  );
  float verticalStrip = exp(
    -pow((reflectedDirection.x - 0.54) * 7.8, 2.0)
  );
  float counterStrip = exp(
    -pow((reflectedDirection.x + 0.62) * 8.6, 2.0)
  );
  float innerReflectionDistance = reflectedDirection.y + 0.12;
  float innerReflectionBand = exp(
    -innerReflectionDistance * innerReflectionDistance * 5.4
  );
  float innerReflectionSheen = sat(
    innerReflectionBand * (0.72 + secondaryFlow * 0.28)
  );
  float mirrorRaw = sat(
    horizonStrip * 0.72
      + verticalStrip * 0.56
      + counterStrip * 0.42
      + keySpecular
      + counterSpecular * 0.34
      + innerReflectionSheen * 0.045
  );
  float mirrorLevel = smoothstep(0.04, 0.92, mirrorRaw);
  float metalFresnel = pow(
    1.0 - sat(dot(metalNormal, viewDirection)),
    3.2
  );

  vec3 mercuryShadow = vec3(0.480, 0.505, 0.545);
  vec3 mercuryMid = vec3(0.655, 0.675, 0.710);
  vec3 mercuryHighlight = vec3(1.520, 1.560, 1.630);
  mercuryShadow *= mix(0.44, 0.22, u_dark);
  mercuryMid *= mix(0.88, 0.58, u_dark);
  mercuryHighlight *= mix(0.88, 0.78, u_dark);

  vec3 metalTint = mix(
    mercuryShadow,
    mercuryMid,
    smoothstep(0.08, 0.78, heightCenter)
  );
  vec3 metalMaterial = mix(
    metalTint,
    mercuryHighlight,
    sat(mirrorLevel * 0.68 + keySpecular * 0.52)
  );
  metalMaterial += mercuryHighlight
    * (metalFresnel * 0.13 + innerReflectionSheen * 0.035);

  vec3 sourceSpectrum = normalizedSpectrum(source);
  vec3 flowSpectrum = mix(
    sourceSpectrum,
    mix(sourceSpectrum.gbr, sourceSpectrum.brg, secondaryFlow),
    sat(0.16 + colorFlow * 0.24)
  );
  float reflectionPrismMask = sat(
    horizonStrip * 0.72
      + verticalStrip * 0.56
      + counterStrip * 0.42
      + keySpecular * 1.00
  );
  float reflectionLuma = mix(1.22, 1.30, u_dark);
  float reflectionChroma = mix(0.36, 0.31, u_dark);
  vec3 prismaticReflection = mix(
    vec3(reflectionLuma * 0.78),
    flowSpectrum * reflectionLuma,
    reflectionChroma
  );
  metalMaterial = mix(
    metalMaterial,
    prismaticReflection,
    reflectionPrismMask * mix(0.34, 0.30, u_dark)
  );

  float topologyEdge = sat(
    abs(heightLeft - heightRight)
      + abs(heightDown - heightUp)
  );
  float spectralEdgeMask = sat(
    topologyEdge * 2.8
      + max(neighbourPresence - presence, 0.0) * 0.74
      + metalFresnel * presence * 0.28
  );
  vec3 metalAccentSpectrum = mix(
    vec3(1.0),
    flowSpectrum,
    mix(0.78, 0.70, u_dark)
  );
  vec3 prismaticEdge = metalAccentSpectrum
    * spectralEdgeMask
    * mix(0.74, 0.68, u_dark);
  metalMaterial += prismaticEdge;

  float bodyAlpha = smoothstep(0.02, 0.12, chroma);
  float edgeAlpha = max(neighbourPresence - presence, 0.0) * 0.28;
  float alpha = sat(bodyAlpha + edgeAlpha);
  vec3 exposedMetal = metalMaterial * (0.78 + heightCenter * 0.18);
  vec3 finalColor = clamp(
    exposedMetal / (exposedMetal + vec3(0.48)) * 1.12,
    vec3(0.0),
    vec3(1.0)
  );

  fragColor = vec4(finalColor * alpha, alpha);
}`;

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate Metalbloom shader");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("Unable to compile Metalbloom shader");
  }

  return shader;
};

const createProgram = (gl) => {
  const vertexShader = compileShader(
    gl,
    gl.VERTEX_SHADER,
    ORB_METALBLOOM_VERTEX_SHADER,
  );
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    ORB_METALBLOOM_FRAGMENT_SHADER,
  );
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Unable to allocate Metalbloom program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    throw new Error("Unable to link Metalbloom program");
  }

  return program;
};

const createRenderer = (outputCanvas) => {
  const gl = outputCanvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    failIfMajorPerformanceCaveat: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  });
  if (!gl) return null;

  let program;
  let positionBuffer;
  let vertexArray;
  let sourceTexture;

  try {
    program = createProgram(gl);
    positionBuffer = gl.createBuffer();
    vertexArray = gl.createVertexArray();
    sourceTexture = gl.createTexture();
    if (!positionBuffer || !vertexArray || !sourceTexture) {
      throw new Error("Unable to allocate Metalbloom resources");
    }
  } catch (_) {
    if (program) gl.deleteProgram(program);
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    if (sourceTexture) gl.deleteTexture(sourceTexture);
    return null;
  }

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const uniforms = {
    source: gl.getUniformLocation(program, "u_source"),
    texel: gl.getUniformLocation(program, "u_texel"),
    time: gl.getUniformLocation(program, "u_time"),
    dark: gl.getUniformLocation(program, "u_dark"),
  };

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.clearColor(0, 0, 0, 0);

  return {
    gl,
    positionBuffer,
    program,
    sourceTexture,
    uniforms,
    vertexArray,
    uploadedHeight: 0,
    uploadedWidth: 0,
  };
};

const destroyRenderer = (renderer) => {
  if (!renderer) return;
  const {
    gl,
    positionBuffer,
    program,
    sourceTexture,
    vertexArray,
  } = renderer;
  gl.deleteTexture(sourceTexture);
  gl.deleteBuffer(positionBuffer);
  gl.deleteVertexArray(vertexArray);
  gl.deleteProgram(program);
};

const OrbMetalbloomPass = () => {
  React.useEffect(() => {
    if (isMobileTier) return undefined;

    const outputCanvas = document.createElement("canvas");
    outputCanvas.className = "orb-metalbloom-pass";
    outputCanvas.dataset.active = "false";
    outputCanvas.dataset.quality = "webgl";
    outputCanvas.setAttribute("aria-hidden", "true");

    let animationFrame = 0;
    let lastFrameTime = 0;
    let renderer = null;
    let rendererUnavailable = false;
    let sourceCanvas = null;
    let stopped = false;

    const stopRendering = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      destroyRenderer(renderer);
      renderer = null;
      outputCanvas.dataset.active = "false";
    };

    const render = (now) => {
      if (stopped || !renderer) return;
      animationFrame = window.requestAnimationFrame(render);

      if (document.visibilityState === "hidden") return;
      if (!sourceCanvas?.isConnected) return;
      if (sourceCanvas.width < 1 || sourceCanvas.height < 1) return;

      const sourceStyle = window.getComputedStyle(sourceCanvas);
      if (sourceStyle.visibility === "hidden") {
        outputCanvas.dataset.active = "false";
        return;
      }

      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const frameInterval = reducedMotion ? 1000 / 15 : 1000 / 45;
      if (now - lastFrameTime < frameInterval) return;
      lastFrameTime = now;

      if (
        outputCanvas.width !== sourceCanvas.width
        || outputCanvas.height !== sourceCanvas.height
      ) {
        outputCanvas.width = sourceCanvas.width;
        outputCanvas.height = sourceCanvas.height;
      }

      const {
        gl,
        program,
        sourceTexture,
        uniforms,
        vertexArray,
      } = renderer;
      gl.viewport(0, 0, outputCanvas.width, outputCanvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

      try {
        if (
          renderer.uploadedWidth !== sourceCanvas.width
          || renderer.uploadedHeight !== sourceCanvas.height
        ) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            sourceCanvas,
          );
          renderer.uploadedWidth = sourceCanvas.width;
          renderer.uploadedHeight = sourceCanvas.height;
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            sourceCanvas,
          );
        }
      } catch (_) {
        outputCanvas.dataset.active = "false";
        return;
      }

      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      gl.uniform1i(uniforms.source, 0);
      gl.uniform2f(
        uniforms.texel,
        1 / Math.max(sourceCanvas.width, 1),
        1 / Math.max(sourceCanvas.height, 1),
      );
      gl.uniform1f(uniforms.time, reducedMotion ? 0 : now / 1000);
      gl.uniform1f(uniforms.dark, isDark ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      outputCanvas.dataset.active = "true";
    };

    const startRendering = () => {
      if (renderer || rendererUnavailable || stopped) return;
      renderer = createRenderer(outputCanvas);
      if (!renderer) {
        rendererUnavailable = true;
        outputCanvas.dataset.quality = "css";
        return;
      }
      lastFrameTime = 0;
      animationFrame = window.requestAnimationFrame(render);
    };

    const refreshSource = () => {
      const candidate = document.querySelector(ORB_SOURCE_SELECTOR);
      const nextSource = candidate?.tagName === "CANVAS" ? candidate : null;

      if (!nextSource) {
        sourceCanvas = null;
        stopRendering();
        outputCanvas.remove();
        return;
      }

      sourceCanvas = nextSource;
      const sourceLayer = sourceCanvas.parentElement;
      if (sourceLayer && outputCanvas.parentElement !== sourceLayer) {
        sourceLayer.appendChild(outputCanvas);
      }
      startRendering();
    };

    const observer = new MutationObserver(refreshSource);
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
    refreshSource();

    return () => {
      stopped = true;
      observer.disconnect();
      stopRendering();
      outputCanvas.remove();
    };
  }, []);

  return null;
};

export default OrbMetalbloomPass;
