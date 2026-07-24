export const IMMERSIVE_MODES = Object.freeze({
  ORIGINAL: "original",
  ENGINEERING: "engineering",
});

export const resolveImmersivePresentation = (requestedMode) => {
  const mode =
    requestedMode === IMMERSIVE_MODES.ENGINEERING
      ? IMMERSIVE_MODES.ENGINEERING
      : IMMERSIVE_MODES.ORIGINAL;

  return {
    mode,
    showAnimatedLogo: mode === IMMERSIVE_MODES.ORIGINAL,
    showProfessionalHero: mode === IMMERSIVE_MODES.ENGINEERING,
  };
};
