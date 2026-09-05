import {
  getDefaultMetabloomAction,
  resolveMetabloomAction,
} from "./metabloomActions";

const TAU = Math.PI * 2;
const MIN_DELTA_SECONDS = 1 / 240;
const MAX_DELTA_SECONDS = 1 / 15;

export const METABLOOM_POSE_KEYS = Object.freeze([
  "offsetX",
  "offsetY",
  "scaleX",
  "scaleY",
  "rotation",
  "centerScale",
  "radiusScale",
  "burst",
  "orbit",
  "tremble",
  "expression",
  "voice",
]);

export const METABLOOM_NEUTRAL_POSE = Object.freeze({
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  centerScale: 1,
  radiusScale: 1,
  burst: 0,
  orbit: 0,
  tremble: 0,
  expression: 0,
  voice: 0,
});

const CHANNEL_CONFIG = Object.freeze({
  offsetX: Object.freeze({
    min: -0.16,
    max: 0.16,
    smoothTime: 0.18,
    maxSpeed: 0.92,
  }),
  offsetY: Object.freeze({
    min: -0.16,
    max: 0.16,
    smoothTime: 0.19,
    maxSpeed: 0.92,
  }),
  scaleX: Object.freeze({
    min: 0.76,
    max: 1.24,
    smoothTime: 0.20,
    maxSpeed: 1.9,
  }),
  scaleY: Object.freeze({
    min: 0.76,
    max: 1.24,
    smoothTime: 0.20,
    maxSpeed: 1.9,
  }),
  rotation: Object.freeze({
    min: -0.20,
    max: 0.20,
    smoothTime: 0.20,
    maxSpeed: 1.15,
  }),
  centerScale: Object.freeze({
    min: 0.16,
    max: 1.12,
    smoothTime: 0.22,
    maxSpeed: 3.1,
  }),
  radiusScale: Object.freeze({
    min: 0.74,
    max: 1.28,
    smoothTime: 0.20,
    maxSpeed: 2.4,
  }),
  burst: Object.freeze({
    min: 0,
    max: 0.52,
    smoothTime: 0.16,
    maxSpeed: 3.8,
  }),
  orbit: Object.freeze({
    min: 0,
    max: 0.80,
    smoothTime: 0.23,
    maxSpeed: 2.8,
  }),
  tremble: Object.freeze({
    min: -0.75,
    max: 0.75,
    smoothTime: 0.07,
    maxSpeed: 11,
  }),
  expression: Object.freeze({
    min: 0,
    max: 1,
    smoothTime: 0.18,
    maxSpeed: 3.8,
  }),
  voice: Object.freeze({
    min: 0,
    max: 1,
    smoothTime: 0.10,
    maxSpeed: 6.2,
  }),
});

const ACTION_TIMING = Object.freeze({
  reform: Object.freeze({ attackEnd: 0.24, releaseStart: 0.66, response: 0.18 }),
  agree: Object.freeze({ attackEnd: 0.12, releaseStart: 0.82, response: 0.115 }),
  disagree: Object.freeze({ attackEnd: 0.10, releaseStart: 0.84, response: 0.10 }),
  happy: Object.freeze({ attackEnd: 0.22, releaseStart: 0.76, response: 0.15 }),
  excited: Object.freeze({ attackEnd: 0.08, releaseStart: 0.86, response: 0.095 }),
  sad: Object.freeze({ attackEnd: 0.34, releaseStart: 0.70, response: 0.22 }),
  surprised: Object.freeze({ attackEnd: 0.06, releaseStart: 0.78, response: 0.085 }),
  thinking: Object.freeze({ attackEnd: 0.22, releaseStart: 0.78, response: 0.18 }),
  sleepy: Object.freeze({ attackEnd: 0.38, releaseStart: 0.74, response: 0.25 }),
  angry: Object.freeze({ attackEnd: 0.14, releaseStart: 0.80, response: 0.09 }),
});

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

const finiteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

export const smootherstep = (value) => {
  const t = clamp(finiteNumber(value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const segment = (phase, start, end) => {
  if (end <= start) return phase >= end ? 1 : 0;
  return smootherstep((phase - start) / (end - start));
};

const windowEnvelope = (phase, attackEnd, releaseStart) =>
  segment(phase, 0, attackEnd)
  * (1 - segment(phase, releaseStart, 1));

const pulseEnvelope = (phase, start, peak, end) =>
  segment(phase, start, peak) * (1 - segment(phase, peak, end));

const createNeutralPose = () => ({ ...METABLOOM_NEUTRAL_POSE });

const resetPose = (pose) => {
  METABLOOM_POSE_KEYS.forEach((key) => {
    pose[key] = METABLOOM_NEUTRAL_POSE[key];
  });
  return pose;
};

const clampPose = (pose) => {
  METABLOOM_POSE_KEYS.forEach((key) => {
    const config = CHANNEL_CONFIG[key];
    pose[key] = clamp(
      finiteNumber(pose[key], METABLOOM_NEUTRAL_POSE[key]),
      config.min,
      config.max,
    );
  });
  return pose;
};

const intensityGain = (intensity) => clamp(intensity) * 1.44;

const addPhysiology = (pose, timeSeconds, seed, enabled) => {
  if (!enabled) return pose;

  const time = finiteNumber(timeSeconds);
  const phaseSeed = finiteNumber(seed) * TAU;
  const breath = Math.sin(time * 0.86 + phaseSeed * 0.73);
  const slowBreath = Math.sin(time * 0.41 + phaseSeed * 1.17);
  const sway = Math.sin(time * 0.27 + phaseSeed * 1.91);

  pose.offsetX += sway * 0.0038;
  pose.offsetY += breath * 0.0036 + slowBreath * 0.0022;
  pose.scaleX += breath * 0.0065;
  pose.scaleY -= breath * 0.0090;
  pose.rotation += sway * 0.0048;
  pose.centerScale += slowBreath * 0.008;
  pose.radiusScale += breath * 0.006;
  return pose;
};

const resolveAction = (value) =>
  resolveMetabloomAction(value) || getDefaultMetabloomAction();

export const sampleMetabloomActionPose = ({
  action = "reform",
  enabled = true,
  intensity,
  phase = 1,
  seed = 0.5,
  talking = false,
  timeSeconds = 0,
} = {}, outputPose = createNeutralPose()) => {
  const resolvedAction = resolveAction(action);
  const actionId = resolvedAction.id;
  const timing = ACTION_TIMING[actionId] || ACTION_TIMING.reform;
  const normalizedPhase = clamp(finiteNumber(phase, 1));
  const normalizedIntensity = clamp(
    finiteNumber(intensity, resolvedAction.intensity),
  );
  const gain = intensityGain(normalizedIntensity);
  const envelope = enabled
    ? windowEnvelope(
        normalizedPhase,
        timing.attackEnd,
        timing.releaseStart,
      )
    : 0;
  const pose = resetPose(outputPose);
  const decay = 1 - normalizedPhase * 0.24;

  if (actionId === "reform") {
    const gather = envelope * gain;
    pose.centerScale = 1 - gather * 0.83;
    pose.radiusScale = 1 + gather * 0.28;
    pose.scaleX = 1 + gather * 0.045;
    pose.scaleY = 1 - gather * 0.025;
    pose.expression = gather * 0.42;
  } else if (actionId === "agree") {
    const nod = Math.sin(normalizedPhase * TAU * 2) * envelope * decay;
    pose.offsetY = -nod * 0.092 * gain;
    pose.scaleX = 1 + Math.abs(nod) * 0.025 * gain;
    pose.scaleY = 1 - Math.abs(nod) * 0.052 * gain;
    pose.rotation = Math.sin(normalizedPhase * TAU) * envelope * 0.010 * gain;
    pose.expression = envelope * 0.68;
  } else if (actionId === "disagree") {
    const shake = Math.sin(normalizedPhase * TAU * 2.65) * envelope * decay;
    pose.offsetX = shake * 0.104 * gain;
    pose.rotation = shake * 0.047 * gain;
    pose.scaleX = 1 + Math.abs(shake) * 0.012;
    pose.expression = envelope * 0.74;
  } else if (actionId === "happy") {
    const swell = envelope * (0.92 + 0.08 * Math.sin(normalizedPhase * TAU * 1.5));
    pose.offsetY = swell * 0.060 * gain;
    pose.scaleX = 1 + swell * 0.070 * gain;
    pose.scaleY = 1 + swell * 0.092 * gain;
    pose.radiusScale = 1 + swell * 0.060 * gain;
    pose.centerScale = 1 + swell * 0.025;
    pose.expression = envelope * 0.78;
  } else if (actionId === "excited") {
    const compression = pulseEnvelope(normalizedPhase, 0.015, 0.10, 0.24);
    const burst = pulseEnvelope(normalizedPhase, 0.17, 0.34, 0.80);
    const followThrough = Math.sin(normalizedPhase * TAU * 2.25)
      * windowEnvelope(normalizedPhase, 0.28, 0.90)
      * (1 - normalizedPhase)
      * 0.24;
    pose.scaleX = 1 - compression * 0.19 * gain + followThrough * 0.10 * gain;
    pose.scaleY = 1 - compression * 0.15 * gain + burst * 0.08 * gain;
    pose.radiusScale = 1 - burst * 0.21 * gain;
    pose.centerScale = 1 - compression * 0.22 * gain;
    pose.burst = burst * 0.46 * gain;
    pose.offsetY = burst * 0.030 * gain;
    pose.expression = Math.max(compression * 0.72, burst);
  } else if (actionId === "sad") {
    const settle = envelope;
    pose.offsetY = -settle * 0.095 * gain;
    pose.scaleX = 1 + settle * 0.105 * gain;
    pose.scaleY = 1 - settle * 0.175 * gain;
    pose.centerScale = 1 - settle * 0.105 * gain;
    pose.radiusScale = 1 + settle * 0.020;
    pose.rotation = -settle * 0.018 * gain;
    pose.expression = settle * 0.76;
  } else if (actionId === "surprised") {
    const contraction = pulseEnvelope(normalizedPhase, 0.005, 0.065, 0.20);
    const rebound = pulseEnvelope(normalizedPhase, 0.12, 0.30, 0.72);
    pose.scaleX = 1 - contraction * 0.20 * gain + rebound * 0.14 * gain;
    pose.scaleY = 1 - contraction * 0.20 * gain + rebound * 0.16 * gain;
    pose.radiusScale = 1 - contraction * 0.09 + rebound * 0.065 * gain;
    pose.centerScale = 1 - contraction * 0.18 * gain;
    pose.burst = rebound * 0.18 * gain;
    pose.expression = Math.max(contraction, rebound) * 0.92;
  } else if (actionId === "thinking") {
    const consider = envelope;
    pose.rotation = -consider * 0.120 * gain;
    pose.offsetX = -consider * 0.026 * gain;
    pose.offsetY = consider * 0.018 * gain;
    pose.orbit = consider * 0.72 * gain;
    pose.scaleX = 1 - consider * 0.018;
    pose.scaleY = 1 + consider * 0.022;
    pose.expression = consider * 0.68;
  } else if (actionId === "sleepy") {
    const exhale = envelope;
    pose.offsetY = -exhale * 0.112 * gain;
    pose.scaleX = 1 + exhale * 0.145 * gain;
    pose.scaleY = 1 - exhale * 0.215 * gain;
    pose.centerScale = 1 - exhale * 0.145 * gain;
    pose.radiusScale = 1 + exhale * 0.025;
    pose.rotation = Math.sin(normalizedPhase * Math.PI) * -0.016 * gain;
    pose.expression = exhale * 0.62;
  } else if (actionId === "angry") {
    const brace = envelope;
    const tremble = Math.sin(
      finiteNumber(timeSeconds) * 32.0
        + normalizedPhase * TAU * 7.0
        + finiteNumber(seed) * TAU,
    ) * brace;
    pose.scaleX = 1 - brace * 0.075 * gain;
    pose.scaleY = 1 - brace * 0.115 * gain;
    pose.centerScale = 1 - brace * 0.085 * gain;
    pose.radiusScale = 1 + brace * 0.055 * gain;
    pose.tremble = tremble * 0.78 * gain;
    pose.rotation = tremble * 0.012 * gain;
    pose.expression = brace * 0.86;
  }

  const voiceTarget = talking && enabled
    ? clamp(
        (0.26 + 0.50 * (0.5 + 0.5 * Math.sin(timeSeconds * 8.4 + seed * 9.1)))
          * (0.62 + 0.38 * (0.5 + 0.5 * Math.sin(timeSeconds * 3.0 + seed * 5.7)))
          * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(timeSeconds * 1.13 + seed * 12.4))),
      )
    : 0;
  // Preserve idle physiology but eliminate every deliberate gesture at zero intensity.
  if (normalizedIntensity === 0) resetPose(pose);
  pose.voice = voiceTarget;

  addPhysiology(pose, timeSeconds, seed, enabled);
  return clampPose(pose);
};

export const smoothDamp = ({
  current,
  deltaSeconds,
  maxSpeed = Number.POSITIVE_INFINITY,
  smoothTime,
  target,
  velocity,
}) => {
  const requestedDelta = finiteNumber(deltaSeconds, 0);
  if (requestedDelta <= 0) {
    return {
      value: finiteNumber(current),
      velocity: finiteNumber(velocity),
    };
  }
  const safeDelta = clamp(
    requestedDelta,
    MIN_DELTA_SECONDS,
    MAX_DELTA_SECONDS,
  );
  const safeSmoothTime = Math.max(0.0001, finiteNumber(smoothTime, 0.12));
  const omega = 2 / safeSmoothTime;
  const x = omega * safeDelta;
  const exponential = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const originalTarget = finiteNumber(target);
  let change = finiteNumber(current) - originalTarget;
  const speed = Math.max(0, finiteNumber(maxSpeed, Number.POSITIVE_INFINITY));
  const maxChange = Number.isFinite(speed)
    ? speed * safeSmoothTime
    : Number.POSITIVE_INFINITY;
  change = clamp(change, -maxChange, maxChange);
  const adjustedTarget = finiteNumber(current) - change;
  const temporary = (finiteNumber(velocity) + omega * change) * safeDelta;
  let nextVelocity = (finiteNumber(velocity) - omega * temporary) * exponential;
  let nextValue = adjustedTarget + (change + temporary) * exponential;

  const crossedTarget = (originalTarget - current > 0) === (nextValue > originalTarget);
  if (crossedTarget) {
    nextValue = originalTarget;
    nextVelocity = 0;
  }

  return { value: nextValue, velocity: nextVelocity };
};

export const dampMetabloomValue = (
  current,
  target,
  deltaSeconds,
  response = 10,
) => {
  const delta = clamp(finiteNumber(deltaSeconds), 0, MAX_DELTA_SECONDS);
  const alpha = 1 - Math.exp(-Math.max(0.01, response) * delta);
  return finiteNumber(current) + (finiteNumber(target) - finiteNumber(current)) * alpha;
};

export const dampMetabloomVector = (
  current,
  target,
  deltaSeconds,
  response = 10,
) => {
  for (let index = 0; index < current.length; index += 1) {
    current[index] = dampMetabloomValue(
      current[index],
      target[index],
      deltaSeconds,
      response,
    );
  }
  return current;
};

export const createMetabloomMotionRuntime = () => {
  const pose = createNeutralPose();
  const targetPose = createNeutralPose();
  const velocity = Object.fromEntries(
    METABLOOM_POSE_KEYS.map((key) => [key, 0]),
  );
  const frame = {
    moving: false,
    motionEnergy: 0,
    pose,
    targetPose,
    velocity,
  };
  let motionEnergy = 0;

  const updateFrame = () => {
    const remaining = METABLOOM_POSE_KEYS.reduce(
      (sum, key) => sum + Math.abs(targetPose[key] - pose[key]),
      0,
    );
    const velocityMagnitude = METABLOOM_POSE_KEYS.reduce(
      (sum, key) => sum + Math.abs(velocity[key]),
      0,
    );
    frame.moving =
      remaining > 0.004
      || velocityMagnitude > 0.02
      || motionEnergy > 0.012;
    frame.motionEnergy = motionEnergy;
    return frame;
  };

  const snapshot = () => ({
    moving: frame.moving,
    motionEnergy: frame.motionEnergy,
    pose: { ...pose },
    targetPose: { ...targetPose },
    velocity: { ...velocity },
  });

  const reset = ({ snap = true } = {}) => {
    resetPose(targetPose);
    METABLOOM_POSE_KEYS.forEach((key) => {
      velocity[key] = 0;
      if (snap) pose[key] = METABLOOM_NEUTRAL_POSE[key];
    });
    motionEnergy = 0;
    updateFrame();
    return snapshot();
  };

  const step = (options = {}) => {
    const resolvedAction = resolveAction(options.action);
    const timing = ACTION_TIMING[resolvedAction.id] || ACTION_TIMING.reform;
    const deltaSeconds = clamp(
      finiteNumber(options.deltaSeconds, 0),
      0,
      MAX_DELTA_SECONDS,
    );
    sampleMetabloomActionPose(options, targetPose);
    let frameMotion = 0;

    METABLOOM_POSE_KEYS.forEach((key) => {
      const config = CHANNEL_CONFIG[key];
      const responseScale = key === "voice"
        ? targetPose.voice > pose.voice ? 0.70 : 1.35
        : key === "tremble"
          ? 0.60
          : clamp(timing.response / 0.14, 0.65, 1.8);
      const next = smoothDamp({
        current: pose[key],
        target: targetPose[key],
        velocity: velocity[key],
        smoothTime: config.smoothTime * responseScale,
        maxSpeed: config.maxSpeed,
        deltaSeconds,
      });
      frameMotion += Math.abs(next.value - pose[key]);
      pose[key] = clamp(next.value, config.min, config.max);
      velocity[key] = next.velocity;
    });

    motionEnergy = dampMetabloomValue(
      motionEnergy,
      clamp(frameMotion * 18 + Math.abs(pose.voice) * 0.18),
      deltaSeconds,
      12,
    );
    return updateFrame();
  };

  const snap = (options = {}) => {
    // Static settling is terminal, never the midpoint of the gather gesture.
    const settling = resolveAction(options.action).id === "reform";
    sampleMetabloomActionPose(
      settling ? { ...options, phase: 1, enabled: false, talking: false } : options,
      targetPose,
    );
    METABLOOM_POSE_KEYS.forEach((key) => {
      pose[key] = targetPose[key];
      velocity[key] = 0;
    });
    motionEnergy = 0;
    return updateFrame();
  };

  updateFrame();
  return Object.freeze({
    reset,
    snap,
    snapshot,
    step,
  });
};
