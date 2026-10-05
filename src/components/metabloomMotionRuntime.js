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
  "stillness",
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
  stillness: 0,
});

const CHANNEL_CONFIG = Object.freeze({
  stillness: Object.freeze({ min: 0, max: 1, smoothTime: 0.12, maxSpeed: 6 }),
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
  curious: Object.freeze({ attackEnd: 0.28, releaseStart: 0.76, response: 0.12 }),
  listening: Object.freeze({ attackEnd: 0.24, releaseStart: 0.82, response: 0.16 }),
  skeptical: Object.freeze({ attackEnd: 0.30, releaseStart: 0.78, response: 0.13 }),
  relieved: Object.freeze({ attackEnd: 0.14, releaseStart: 0.78, response: 0.17 }),
  shy: Object.freeze({ attackEnd: 0.22, releaseStart: 0.80, response: 0.14 }),
  resolute: Object.freeze({ attackEnd: 0.20, releaseStart: 0.82, response: 0.11 }),
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
  const breath = Math.sin(time * 0.86 + phaseSeed * 0.73) * (1 - pose.stillness * 0.85);
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
  physiology = true,
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
  const gain = enabled ? intensityGain(normalizedIntensity) : 0;
  const envelope = enabled
    ? windowEnvelope(
        normalizedPhase,
        timing.attackEnd,
        timing.releaseStart,
      )
    : 0;
  const pose = resetPose(outputPose);
  const beat = (start, peak, end) => pulseEnvelope(normalizedPhase, start, peak, end);
  const hold = (start, end) => windowEnvelope(normalizedPhase, start, end);
  // Authored close-up acting. Each action has a readable pause between the
  // main gesture and recovery; the same pose channels drive both renderers.

  if (actionId === "reform") {
    const gather = envelope * gain;
    pose.centerScale = 1 - gather * 0.83;
    pose.radiusScale = 1 + gather * 0.28;
    pose.scaleX = 1 + gather * 0.045;
    pose.scaleY = 1 - gather * 0.025;
    pose.expression = gather * 0.42;
  } else if (actionId === "agree") {
    const anticipate = beat(0, 0.10, 0.22);
    const nod = beat(0.13, 0.28, 0.43) + beat(0.45, 0.56, 0.72) * 0.55;
    pose.offsetY = (anticipate * 0.032 - nod * 0.14) * gain;
    pose.scaleX += nod * 0.055 * gain;
    pose.scaleY -= nod * 0.10 * gain;
    pose.centerScale -= envelope * 0.20 * gain;
    pose.stillness = hold(0.60, 0.82) * gain;
    pose.expression = envelope * 0.68 * gain;
  } else if (actionId === "disagree") {
    const shake = beat(0.10, 0.23, 0.37) - beat(0.29, 0.44, 0.59)
      + beat(0.53, 0.64, 0.76) * 0.50;
    pose.offsetX = shake * 0.15 * gain;
    pose.rotation = shake * 0.12 * gain;
    pose.scaleX -= envelope * 0.06 * gain;
    pose.scaleY -= envelope * 0.04 * gain;
    pose.centerScale -= envelope * 0.16 * gain;
    pose.stillness = hold(0.64, 0.84) * gain;
    pose.expression = envelope * 0.74 * gain;
  } else if (actionId === "happy") {
    const dip = beat(0, 0.13, 0.30);
    const welcome = hold(0.40, 0.70);
    pose.offsetY = (-dip * 0.045 + welcome * 0.10) * gain;
    pose.rotation = welcome * 0.065 * gain;
    pose.scaleX += (welcome * 0.10 + dip * 0.06) * gain;
    pose.scaleY += (welcome * 0.10 - dip * 0.10) * gain;
    pose.radiusScale += welcome * 0.08 * gain;
    pose.centerScale -= welcome * 0.13 * gain;
    pose.stillness = welcome * 0.62 * gain;
    pose.expression = welcome * 0.78 * gain;
  } else if (actionId === "excited") {
    const crouch = beat(0, 0.14, 0.27);
    const spring = beat(0.20, 0.38, 0.58);
    const rebound = beat(0.54, 0.68, 0.84);
    pose.offsetY = (-crouch * 0.06 + spring * 0.15 + rebound * 0.065) * gain;
    pose.scaleX += (crouch * 0.15 - spring * 0.10 + rebound * 0.06) * gain;
    pose.scaleY += (-crouch * 0.21 + spring * 0.19 - rebound * 0.045) * gain;
    pose.centerScale -= crouch * 0.33 * gain;
    pose.radiusScale -= spring * 0.10 * gain;
    pose.burst = spring * 0.32 * gain;
    pose.rotation = (spring - rebound) * 0.07 * gain;
    pose.expression = Math.max(crouch, spring, rebound) * gain;
  } else if (actionId === "sad") {
    const sink = hold(0.46, 0.76);
    pose.offsetY = -sink * 0.12 * gain;
    pose.scaleX += sink * 0.10 * gain;
    pose.scaleY -= sink * 0.19 * gain;
    pose.centerScale -= sink * 0.18 * gain;
    pose.rotation = -sink * 0.075 * gain;
    pose.stillness = sink * gain;
    pose.expression = sink * 0.76 * gain;
  } else if (actionId === "surprised") {
    const recoil = hold(0.14, 0.47);
    const flinch = beat(0, 0.08, 0.19);
    const peek = beat(0.52, 0.68, 0.88);
    pose.offsetX = (-recoil * 0.06 + peek * 0.024) * gain;
    pose.offsetY = recoil * 0.11 * gain;
    pose.scaleX += (-flinch * 0.16 + recoil * 0.10) * gain;
    pose.scaleY += (-flinch * 0.12 + recoil * 0.18) * gain;
    pose.centerScale -= recoil * 0.32 * gain;
    pose.rotation = (-recoil * 0.09 + peek * 0.07) * gain;
    pose.stillness = hold(0.18, 0.48) * gain;
    pose.expression = recoil * 0.92 * gain;
  } else if (actionId === "thinking") {
    const consider = hold(0.32, 0.76);
    pose.rotation = -consider * 0.18 * gain;
    pose.offsetX = -consider * 0.045 * gain;
    pose.offsetY = consider * 0.024 * gain;
    pose.orbit = consider * 0.30 * gain;
    pose.centerScale -= consider * 0.24 * gain;
    pose.stillness = consider * 0.92 * gain;
    pose.expression = consider * 0.68 * gain;
  } else if (actionId === "sleepy") {
    const exhale = hold(0.42, 0.78);
    const rouse = beat(0.54, 0.64, 0.76);
    pose.offsetY = (-exhale * 0.13 + rouse * 0.04) * gain;
    pose.scaleX += exhale * 0.15 * gain;
    pose.scaleY -= exhale * 0.22 * gain;
    pose.centerScale -= exhale * 0.20 * gain;
    pose.rotation = -exhale * 0.08 * gain;
    pose.stillness = exhale * gain;
    pose.expression = exhale * 0.62 * gain;
  } else if (actionId === "angry") {
    const brace = hold(0.18, 0.78);
    const insist = beat(0.26, 0.36, 0.49) + beat(0.50, 0.60, 0.74) * 0.65;
    pose.scaleX -= brace * 0.10 * gain;
    pose.scaleY += (-brace * 0.12 + insist * 0.17) * gain;
    pose.offsetY = insist * 0.08 * gain;
    pose.centerScale -= brace * 0.30 * gain;
    pose.rotation = insist * 0.055 * gain;
    pose.stillness = brace * 0.80 * gain;
    pose.expression = brace * 0.86 * gain;
  } else if (actionId === "curious") {
    const approach = hold(0.34, 0.76);
    const notice = beat(0, 0.12, 0.25);
    pose.offsetX = (approach * 0.085 - notice * 0.02) * gain;
    pose.offsetY = approach * 0.035 * gain;
    pose.rotation = approach * 0.19 * gain;
    pose.scaleX += approach * 0.045 * gain;
    pose.scaleY += approach * 0.09 * gain;
    pose.centerScale -= approach * 0.30 * gain;
    pose.stillness = hold(0.40, 0.76) * gain;
    pose.expression = approach * 0.78 * gain;
  } else if (actionId === "listening") {
    const attend = hold(0.26, 0.80);
    const nod = beat(0.56, 0.64, 0.74);
    pose.offsetY = (attend * 0.025 - nod * 0.035) * gain;
    pose.offsetX = attend * 0.028 * gain;
    pose.rotation = attend * 0.075 * gain;
    pose.scaleX += attend * 0.06 * gain;
    pose.scaleY += attend * 0.055 * gain;
    pose.centerScale -= attend * 0.28 * gain;
    pose.stillness = attend * gain;
    pose.expression = attend * 0.50 * gain;
  } else if (actionId === "skeptical") {
    const withdraw = hold(0.26, 0.78);
    const tilt = hold(0.45, 0.77);
    pose.offsetX = -withdraw * 0.07 * gain;
    pose.offsetY = withdraw * 0.02 * gain;
    pose.rotation = tilt * 0.23 * gain;
    pose.scaleX -= withdraw * 0.10 * gain;
    pose.scaleY -= withdraw * 0.055 * gain;
    pose.centerScale -= tilt * 0.22 * gain;
    pose.stillness = hold(0.44, 0.78) * gain;
    pose.expression = tilt * 0.75 * gain;
  } else if (actionId === "relieved") {
    const brace = beat(0, 0.14, 0.38);
    const exhale = beat(0.20, 0.54, 0.82);
    const lift = beat(0.63, 0.80, 1);
    pose.offsetY = (-exhale * 0.055 + lift * 0.04) * gain;
    pose.scaleX += (-brace * 0.09 + exhale * 0.12) * gain;
    pose.scaleY += (brace * 0.10 - exhale * 0.12 + lift * 0.05) * gain;
    pose.centerScale -= (brace * 0.24 + exhale * 0.10) * gain;
    pose.rotation = -exhale * 0.065 * gain;
    pose.stillness = exhale * 0.70 * gain;
    pose.expression = Math.max(brace, exhale) * 0.68 * gain;
  } else if (actionId === "shy") {
    const tuck = hold(0.25, 0.69);
    const peek = beat(0.57, 0.74, 0.91);
    pose.offsetX = (-tuck * 0.065 + peek * 0.045) * gain;
    pose.offsetY = -tuck * 0.055 * gain;
    pose.rotation = (-tuck * 0.18 + peek * 0.12) * gain;
    pose.scaleX -= tuck * 0.14 * gain;
    pose.scaleY -= tuck * 0.10 * gain;
    pose.centerScale -= tuck * 0.36 * gain;
    pose.stillness = tuck * 0.85 * gain;
    pose.expression = tuck * 0.68 * gain;
  } else if (actionId === "resolute") {
    const gather = beat(0, 0.16, 0.34);
    const commit = hold(0.40, 0.80);
    pose.offsetY = (-gather * 0.03 + commit * 0.045) * gain;
    pose.scaleX += (-gather * 0.07 + commit * 0.06) * gain;
    pose.scaleY += commit * 0.12 * gain;
    pose.centerScale -= (gather * 0.30 + commit * 0.18) * gain;
    pose.radiusScale += commit * 0.06 * gain;
    pose.stillness = commit * gain;
    pose.expression = commit * 0.78 * gain;
  }

  const voiceTarget = talking && enabled
    ? clamp(
        (0.26 + 0.50 * (0.5 + 0.5 * Math.sin(timeSeconds * 8.4 + seed * 9.1)))
          * (0.62 + 0.38 * (0.5 + 0.5 * Math.sin(timeSeconds * 3.0 + seed * 5.7)))
          * (0.72 + 0.28 * (0.5 + 0.5 * Math.sin(timeSeconds * 1.13 + seed * 12.4))),
      )
    : 0;
  // Preserve idle physiology but eliminate every deliberate gesture at zero intensity.
  if (normalizedIntensity === 0 || !enabled || normalizedPhase === 0 || normalizedPhase === 1) resetPose(pose);
  pose.voice = voiceTarget;

  addPhysiology(pose, timeSeconds, seed, enabled && physiology);
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
