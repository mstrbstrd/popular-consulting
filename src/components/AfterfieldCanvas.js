import React, { useEffect, useId, useRef } from "react";
import { isMobileTier } from "../utils/deviceTier";

const POINT_COUNT = isMobileTier ? 32 : 42;
const MAX_ANCHORS = 3;
const ANCHOR_LIFETIME_MS = 18000;
const TARGET_FRAME_MS = isMobileTier ? 50 : 38;

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const closedPath = (points) => {
  if (!points.length) return "";

  const count = points.length;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let index = 0; index < count; index += 1) {
    const previous = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    const following = points[(index + 2) % count];
    const controlOne = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const controlTwo = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    };

    path += ` C ${controlOne.x.toFixed(2)} ${controlOne.y.toFixed(2)}`;
    path += ` ${controlTwo.x.toFixed(2)} ${controlTwo.y.toFixed(2)}`;
    path += ` ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }

  return `${path} Z`;
};

const AfterfieldCanvas = ({
  isDark = false,
  onFieldStateChange,
  paused = false,
  resetVersion = 0,
}) => {
  const rootRef = useRef(null);
  const svgRef = useRef(null);
  const masterPathRef = useRef(null);
  const chronologyRef = useRef(null);
  const echoOneRef = useRef(null);
  const echoTwoRef = useRef(null);
  const gradientRef = useRef(null);
  const threadRefs = useRef([]);
  const anchorRingRefs = useRef([]);
  const anchorPointRefs = useRef([]);
  const pausedRef = useRef(paused);
  const onFieldStateChangeRef = useRef(onFieldStateChange);
  const resetFieldRef = useRef(() => {});
  const instanceId = useId().replace(/:/g, "");
  const gradientId = `afterfield-spectrum-${instanceId}`;
  const patternId = `afterfield-pattern-${instanceId}`;
  const maskId = `afterfield-mask-${instanceId}`;
  const pathId = `afterfield-path-${instanceId}`;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onFieldStateChangeRef.current = onFieldStateChange;
  }, [onFieldStateChange]);

  useEffect(() => {
    resetFieldRef.current();
  }, [resetVersion]);

  useEffect(() => {
    const root = rootRef.current;
    const svg = svgRef.current;
    if (!root || !svg) return undefined;

    const radial = new Float32Array(POINT_COUNT);
    const radialVelocity = new Float32Array(POINT_COUNT);
    const tangent = new Float32Array(POINT_COUNT);
    const tangentVelocity = new Float32Array(POINT_COUNT);
    const size = { width: Math.max(root.clientWidth, 1), height: Math.max(root.clientHeight, 1) };
    const pointer = {
      x: size.width * 0.66,
      y: size.height * 0.47,
      sampleX: size.width * 0.66,
      sampleY: size.height * 0.47,
      lastActivityAt: performance.now(),
    };

    let anchors = [];
    let echoHistory = [];
    let animationFrame = 0;
    let frameCounter = 0;
    let lastFrameAt = 0;
    let localTime = 0;
    let visible = document.visibilityState !== "hidden";
    let reducedMotion = false;
    let forceRender = true;
    let fieldState = "braiding";

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncReducedMotion = () => {
      reducedMotion = Boolean(motionQuery?.matches);
      forceRender = true;
    };
    syncReducedMotion();
    if (motionQuery?.addEventListener) {
      motionQuery.addEventListener("change", syncReducedMotion);
    } else {
      motionQuery?.addListener?.(syncReducedMotion);
    }

    const readLayout = () => {
      const portrait = size.height > size.width * 1.15;
      const centerX = portrait ? size.width * 0.50 : size.width * 0.68;
      const centerY = portrait ? size.height * 0.38 : size.height * 0.47;
      const radiusX = portrait
        ? Math.min(size.width * 0.43, size.height * 0.24)
        : Math.min(size.width * 0.31, size.height * 0.48);
      const radiusY = portrait
        ? Math.min(size.height * 0.23, size.width * 0.56)
        : Math.min(size.height * 0.34, size.width * 0.24);

      return { centerX, centerY, radiusX, radiusY };
    };

    const clearAnchorElements = () => {
      for (let index = 0; index < MAX_ANCHORS; index += 1) {
        threadRefs.current[index]?.setAttribute("opacity", "0");
        anchorRingRefs.current[index]?.setAttribute("opacity", "0");
        anchorPointRefs.current[index]?.setAttribute("opacity", "0");
      }
    };

    const resetField = () => {
      radial.fill(0);
      radialVelocity.fill(0);
      tangent.fill(0);
      tangentVelocity.fill(0);
      anchors = [];
      echoHistory = [];
      localTime = 0;
      pointer.lastActivityAt = performance.now();
      clearAnchorElements();
      forceRender = true;
      fieldState = "braiding";
      onFieldStateChangeRef.current?.(fieldState);
    };
    resetFieldRef.current = resetField;

    const updateSize = () => {
      const bounds = root.getBoundingClientRect();
      size.width = Math.max(bounds.width, 1);
      size.height = Math.max(bounds.height, 1);
      svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
      forceRender = true;
    };
    updateSize();

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateSize);
      resizeObserver.observe(root);
    }
    window.addEventListener("resize", updateSize);

    const readPointer = (event) => {
      const bounds = root.getBoundingClientRect();
      return {
        x: clamp(event.clientX - bounds.left, 0, bounds.width),
        y: clamp(event.clientY - bounds.top, 0, bounds.height),
      };
    };

    const depositMotion = (pointX, pointY, deltaX, deltaY, strength = 1) => {
      const layout = readLayout();
      let angle = Math.atan2(
        (pointY - layout.centerY) / Math.max(layout.radiusY, 1),
        (pointX - layout.centerX) / Math.max(layout.radiusX, 1),
      );
      if (angle < 0) angle += Math.PI * 2;

      const targetIndex = (angle / (Math.PI * 2)) * POINT_COUNT;
      const normalizedDeltaX = deltaX / Math.max(size.width, 1);
      const normalizedDeltaY = deltaY / Math.max(size.height, 1);
      const speed = Math.min(
        1.65,
        Math.hypot(normalizedDeltaX, normalizedDeltaY) * 36 * strength,
      );

      for (let index = 0; index < POINT_COUNT; index += 1) {
        let distance = Math.abs(index - targetIndex);
        distance = Math.min(distance, POINT_COUNT - distance);
        const weight = Math.exp(-(distance * distance) / 7.5);
        radialVelocity[index] +=
          weight * speed * 20 * (normalizedDeltaY * 0.74 + normalizedDeltaX * 0.34);
        tangentVelocity[index] +=
          weight * speed * 18 * (normalizedDeltaX - normalizedDeltaY * 0.24);
      }
    };

    const handlePointerMove = (event) => {
      const next = readPointer(event);
      const deltaX = next.x - pointer.sampleX;
      const deltaY = next.y - pointer.sampleY;
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      depositMotion(next.x, next.y, deltaX, deltaY);
      forceRender = true;
    };

    const handlePointerDown = (event) => {
      const next = readPointer(event);
      pointer.x = next.x;
      pointer.y = next.y;
      pointer.sampleX = next.x;
      pointer.sampleY = next.y;
      pointer.lastActivityAt = performance.now();
      anchors.push({ bornAt: performance.now(), x: next.x, y: next.y });
      if (anchors.length > MAX_ANCHORS) anchors.shift();
      depositMotion(next.x, next.y, size.width * 0.026, -size.height * 0.020, 1.4);
      root.setPointerCapture?.(event.pointerId);
      forceRender = true;
    };

    const handlePointerLeave = () => {
      const layout = readLayout();
      pointer.x = layout.centerX;
      pointer.y = layout.centerY;
      pointer.sampleX = layout.centerX;
      pointer.sampleY = layout.centerY;
      forceRender = true;
    };

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    const simulateField = (delta) => {
      const waveStrength = 46;
      const springStrength = 5.2;
      const damping = Math.pow(0.86, delta * 60);

      for (let index = 0; index < POINT_COUNT; index += 1) {
        const previous = (index - 1 + POINT_COUNT) % POINT_COUNT;
        const next = (index + 1) % POINT_COUNT;
        radialVelocity[index] += (
          (radial[previous] + radial[next] - radial[index] * 2) * waveStrength
          - radial[index] * springStrength
        ) * delta;
        tangentVelocity[index] += (
          (tangent[previous] + tangent[next] - tangent[index] * 2) * waveStrength
          - tangent[index] * springStrength * 0.82
        ) * delta;
        radialVelocity[index] *= damping;
        tangentVelocity[index] *= damping;
        radial[index] += radialVelocity[index] * delta;
        tangent[index] += tangentVelocity[index] * delta;
      }
    };

    const buildPoints = (timestamp) => {
      const layout = readLayout();
      const points = [];
      const parallaxX = (pointer.x - layout.centerX) * 0.045;
      const parallaxY = (pointer.y - layout.centerY) * 0.038;
      const autonomousTime = reducedMotion ? 0 : localTime;

      for (let index = 0; index < POINT_COUNT; index += 1) {
        const angle = (index / POINT_COUNT) * Math.PI * 2;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const tangentX = -sine;
        const tangentY = cosine;
        const shape = 1
          + 0.068 * Math.cos(angle * 3 - 0.30 + autonomousTime * 0.11)
          + 0.038 * Math.sin(angle * 4 + 0.80 - autonomousTime * 0.07)
          + 0.018 * Math.cos(angle * 5 + autonomousTime * 0.05);
        const asymmetryX = layout.radiusX * 0.040 * Math.cos(angle * 2 + 1.20);
        const asymmetryY = layout.radiusY * 0.046 * Math.sin(angle * 3 - 0.70);
        let x = layout.centerX
          + parallaxX
          + layout.radiusX * shape * cosine
          + asymmetryX
          + radial[index] * cosine
          + tangent[index] * tangentX;
        let y = layout.centerY
          + parallaxY
          + layout.radiusY * shape * sine
          + asymmetryY
          + radial[index] * sine * 0.74
          + tangent[index] * tangentY * 0.72;

        for (const anchor of anchors) {
          const age = (timestamp - anchor.bornAt) / 1000;
          if (age < 0 || age > ANCHOR_LIFETIME_MS / 1000) continue;
          const deltaX = x - anchor.x;
          const deltaY = y - anchor.y;
          const distance = Math.hypot(deltaX, deltaY);
          const influenceRadius = Math.min(size.width, size.height) * 0.20;
          const influence = Math.exp(
            -(distance * distance) / (2 * influenceRadius * influenceRadius),
          ) * Math.exp(-age / 11);
          const swirl = Math.min(size.width, size.height)
            * 0.046
            * influence
            * Math.sin(age * 1.45 + index * 0.31);
          x += (-deltaY / (distance + 1)) * swirl - deltaX * influence * 0.052;
          y += (deltaX / (distance + 1)) * swirl - deltaY * influence * 0.052;
        }

        points.push({ x, y });
      }

      return points;
    };

    const updateAnchorElements = (timestamp, points) => {
      anchors = anchors.filter(
        (anchor) => timestamp - anchor.bornAt < ANCHOR_LIFETIME_MS,
      );

      for (let index = 0; index < MAX_ANCHORS; index += 1) {
        const thread = threadRefs.current[index];
        const ring = anchorRingRefs.current[index];
        const point = anchorPointRefs.current[index];
        const anchor = anchors[index];

        if (!thread || !ring || !point) continue;
        if (!anchor) {
          thread.setAttribute("opacity", "0");
          ring.setAttribute("opacity", "0");
          point.setAttribute("opacity", "0");
          continue;
        }

        let nearest = points[0];
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const fieldPoint of points) {
          const distance = (fieldPoint.x - anchor.x) ** 2
            + (fieldPoint.y - anchor.y) ** 2;
          if (distance < nearestDistance) {
            nearest = fieldPoint;
            nearestDistance = distance;
          }
        }

        const age = (timestamp - anchor.bornAt) / 1000;
        const fade = clamp(1 - age / (ANCHOR_LIFETIME_MS / 1000));
        const controlX = (anchor.x + nearest.x) / 2 + Math.sin(age * 1.3) * 28;
        const controlY = (anchor.y + nearest.y) / 2 + Math.cos(age * 0.9) * 22;
        thread.setAttribute(
          "d",
          `M ${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)}`
            + ` Q ${controlX.toFixed(2)} ${controlY.toFixed(2)}`
            + ` ${nearest.x.toFixed(2)} ${nearest.y.toFixed(2)}`,
        );
        thread.setAttribute("opacity", String(0.30 * fade));
        ring.setAttribute("cx", String(anchor.x));
        ring.setAttribute("cy", String(anchor.y));
        ring.setAttribute("r", String(18 + age * 5));
        ring.setAttribute("opacity", String(0.34 * fade));
        point.setAttribute("cx", String(anchor.x));
        point.setAttribute("cy", String(anchor.y));
        point.setAttribute("r", String(6.5 + Math.sin(age * 2.2) * 1.4));
        point.setAttribute("opacity", String(fade));
      }
    };

    const updateState = () => {
      const idleSeconds = (performance.now() - pointer.lastActivityAt) / 1000;
      const nextState = idleSeconds < 0.70
        ? "remembering"
        : idleSeconds < 2.20
          ? "settling"
          : "braiding";

      if (nextState !== fieldState) {
        fieldState = nextState;
        onFieldStateChangeRef.current?.(fieldState);
      }
    };

    const render = (timestamp) => {
      animationFrame = requestAnimationFrame(render);
      if (!visible) return;
      if (pausedRef.current && !forceRender) return;
      const frameInterval = reducedMotion ? 100 : TARGET_FRAME_MS;
      if (!forceRender && timestamp - lastFrameAt < frameInterval) return;

      const delta = lastFrameAt
        ? Math.min((timestamp - lastFrameAt) / 1000, 0.06)
        : TARGET_FRAME_MS / 1000;
      lastFrameAt = timestamp;
      forceRender = false;

      if (!pausedRef.current) {
        if (!reducedMotion) localTime += delta;
        simulateField(delta);
      }

      const points = buildPoints(timestamp);
      const path = closedPath(points);
      masterPathRef.current?.setAttribute("d", path);
      chronologyRef.current?.setAttribute(
        "stroke-dashoffset",
        String(-(localTime * 18) % 120),
      );

      frameCounter += 1;
      if (frameCounter === 1 || (!pausedRef.current && frameCounter % 9 === 0)) {
        echoHistory.unshift(path);
        echoHistory = echoHistory.slice(0, 3);
        echoOneRef.current?.setAttribute("d", echoHistory[1] || path);
        echoTwoRef.current?.setAttribute("d", echoHistory[2] || path);
      }
      if (frameCounter % 4 === 0) {
        gradientRef.current?.setAttribute(
          "gradientTransform",
          `rotate(${18 + Math.sin(localTime * 0.12) * 14} .5 .5)`,
        );
      }
      if (anchors.length) updateAnchorElements(timestamp, points);
      updateState();
    };

    const handleVisibility = () => {
      visible = document.visibilityState !== "hidden";
      lastFrameAt = 0;
      forceRender = true;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    resetField();
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("resize", updateSize);
      resizeObserver?.disconnect();
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerleave", handlePointerLeave);
      if (motionQuery?.removeEventListener) {
        motionQuery.removeEventListener("change", syncReducedMotion);
      } else {
        motionQuery?.removeListener?.(syncReducedMotion);
      }
      resetFieldRef.current = () => {};
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="afterfield-shell"
      data-theme-mode={isDark ? "dark" : "light"}
      aria-hidden="true"
    >
      <svg ref={svgRef} className="afterfield-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient
            ref={gradientRef}
            id={gradientId}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <stop offset="0" stopColor="#ff4f81" />
            <stop offset="0.14" stopColor="#ff8a3d" />
            <stop offset="0.28" stopColor="#f3e65d" />
            <stop offset="0.43" stopColor="#61e899" />
            <stop offset="0.58" stopColor="#39c7ff" />
            <stop offset="0.73" stopColor="#725cff" />
            <stop offset="0.88" stopColor="#ff4fde" />
            <stop offset="1" stopColor="#ff4f81" />
          </linearGradient>
          <pattern
            id={patternId}
            width="12"
            height="12"
            patternUnits="userSpaceOnUse"
          >
            <rect width="12" height="12" fill="white" />
            <rect x="0" y="0" width="3" height="3" fill="black" />
            <rect x="7" y="1" width="2" height="2" fill="#444" />
            <rect x="4" y="7" width="3" height="3" fill="#222" />
            <rect x="10" y="9" width="1.5" height="1.5" fill="#666" />
          </pattern>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="100%"
            height="100%"
          >
            <rect width="100%" height="100%" fill={`url(#${patternId})`} />
          </mask>
          <path ref={masterPathRef} id={pathId} />
        </defs>

        <path
          ref={echoTwoRef}
          className="afterfield-echo afterfield-echo-two"
          stroke={`url(#${gradientId})`}
        />
        <path
          ref={echoOneRef}
          className="afterfield-echo afterfield-echo-one"
          stroke={`url(#${gradientId})`}
        />
        <use
          href={`#${pathId}`}
          className="afterfield-underpaint"
          stroke={`url(#${gradientId})`}
        />
        <use
          href={`#${pathId}`}
          className="afterfield-membrane"
          stroke={`url(#${gradientId})`}
          mask={`url(#${maskId})`}
        />
        <use
          href={`#${pathId}`}
          className="afterfield-edge"
          stroke={`url(#${gradientId})`}
        />
        <use
          ref={chronologyRef}
          href={`#${pathId}`}
          className="afterfield-chronology"
          stroke={`url(#${gradientId})`}
        />

        {Array.from({ length: MAX_ANCHORS }, (_, index) => (
          <g key={index}>
            <path
              ref={(node) => {
                threadRefs.current[index] = node;
              }}
              className="afterfield-thread"
              stroke={`url(#${gradientId})`}
              opacity="0"
            />
            <circle
              ref={(node) => {
                anchorRingRefs.current[index] = node;
              }}
              className="afterfield-anchor-ring"
              stroke={`url(#${gradientId})`}
              opacity="0"
            />
            <circle
              ref={(node) => {
                anchorPointRefs.current[index] = node;
              }}
              className="afterfield-anchor-point"
              stroke={`url(#${gradientId})`}
              opacity="0"
            />
          </g>
        ))}
      </svg>
    </div>
  );
};

export default AfterfieldCanvas;
