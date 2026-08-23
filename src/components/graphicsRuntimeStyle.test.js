import { GRAPHICS_RUNTIME_CSS } from "./graphicsRuntimeStyle";

describe("graphics runtime styles", () => {
  test("pauses CSS fallback motion while a live background owns the frame", () => {
    expect(GRAPHICS_RUNTIME_CSS).toContain(
      "html[data-live-background-renderer] .background-css-orb",
    );
    expect(GRAPHICS_RUNTIME_CSS).toContain(
      "html[data-live-background-renderer] .standalone-experience__fallback > span",
    );
    expect(GRAPHICS_RUNTIME_CSS).toContain(
      "animation-play-state: paused !important",
    );
  });

  test("keeps immersive backgrounds flush with the visual viewport", () => {
    [
      "html[data-live-background-renderer] body",
      "html[data-live-background-renderer] #root",
      "scrollbar-width: none",
      "scrollbar-gutter: auto",
      "html[data-live-background-renderer]::-webkit-scrollbar",
      "html[data-live-background-renderer] #root::-webkit-scrollbar",
      ".parallax-wrapper .background-css-fallback",
      ".parallax-wrapper .background-dither-live",
      ".parallax-wrapper .glass-overlay",
      ".parallax-wrapper .glass-gradient",
      "inset: -2px !important",
    ].forEach((invariant) =>
      expect(GRAPHICS_RUNTIME_CSS).toContain(invariant),
    );
  });
});
