import {
  IMMERSIVE_MODES,
  resolveImmersivePresentation,
} from "./immersiveMode";

describe("resolveImmersivePresentation", () => {
  test("preserves the original logo-only opening by default", () => {
    expect(resolveImmersivePresentation()).toEqual({
      mode: IMMERSIVE_MODES.ORIGINAL,
      showAnimatedLogo: true,
      showProfessionalHero: false,
    });
  });

  test("uses the professional card without the animated logo in engineering mode", () => {
    expect(
      resolveImmersivePresentation(IMMERSIVE_MODES.ENGINEERING),
    ).toEqual({
      mode: IMMERSIVE_MODES.ENGINEERING,
      showAnimatedLogo: false,
      showProfessionalHero: true,
    });
  });

  test("fails closed to the original experience for unknown modes", () => {
    const presentation = resolveImmersivePresentation("unexpected");

    expect(presentation.mode).toBe(IMMERSIVE_MODES.ORIGINAL);
    expect(presentation.showAnimatedLogo).toBe(true);
    expect(presentation.showProfessionalHero).toBe(false);
  });

  test.each([
    undefined,
    IMMERSIVE_MODES.ORIGINAL,
    IMMERSIVE_MODES.ENGINEERING,
    "unexpected",
  ])("never mounts both opening identities for %p", (requestedMode) => {
    const { showAnimatedLogo, showProfessionalHero } =
      resolveImmersivePresentation(requestedMode);

    expect(showAnimatedLogo && showProfessionalHero).toBe(false);
    expect(showAnimatedLogo || showProfessionalHero).toBe(true);
  });
});
