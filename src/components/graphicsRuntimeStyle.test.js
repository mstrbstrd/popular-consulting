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
});
