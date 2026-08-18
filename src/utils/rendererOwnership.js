export const ORB_BLACK_HOLE_MODE_EVENT = "orbBlackHoleModeChange";

export const isOrbBlackHoleModeActive = () =>
  Boolean(typeof window !== "undefined" && window.__bhModeActive);

export const setOrbBlackHoleModeActive = (active) => {
  if (typeof window === "undefined") return;

  const nextActive = Boolean(active);
  window.__bhModeActive = nextActive;
  window.dispatchEvent(
    new CustomEvent(ORB_BLACK_HOLE_MODE_EVENT, {
      detail: { active: nextActive },
    }),
  );
};
