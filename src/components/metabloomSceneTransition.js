export const METABLOOM_SCENE_MODES = Object.freeze([0, 1, 3]);
export const METABLOOM_SCENE_TRANSITION_SECONDS = 1.2;

// Three fixed scenes, one bounded blend. Retarget from the visible mixture.
export const createMetabloomSceneTransition = (initialMode = 0) => {
  const targetFor = (mode) => METABLOOM_SCENE_MODES.map((id) => Number(id === mode));
  let targetMode = METABLOOM_SCENE_MODES.includes(initialMode) ? initialMode : 0;
  let weights = targetFor(targetMode);
  let origin = [...weights];
  let elapsed = METABLOOM_SCENE_TRANSITION_SECONDS;
  return {
    get weights() { return [...weights]; },
    get active() { return elapsed < METABLOOM_SCENE_TRANSITION_SECONDS; },
    target(mode, immediate = false) {
      if (!METABLOOM_SCENE_MODES.includes(mode)) return false;
      if (immediate) {
        targetMode = mode;
        weights = targetFor(mode);
        origin = [...weights];
        elapsed = METABLOOM_SCENE_TRANSITION_SECONDS;
      } else if (mode !== targetMode) {
        targetMode = mode;
        origin = [...weights];
        elapsed = 0;
      }
      return true;
    },
    advance(delta) {
      if (!Number.isFinite(delta) || delta < 0 || elapsed >= METABLOOM_SCENE_TRANSITION_SECONDS) return;
      elapsed = Math.min(METABLOOM_SCENE_TRANSITION_SECONDS, elapsed + delta);
      const t = elapsed / METABLOOM_SCENE_TRANSITION_SECONDS;
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      const target = targetFor(targetMode);
      weights = origin.map((value, index) => value + (target[index] - value) * eased);
    },
  };
};
