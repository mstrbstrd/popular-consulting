import fs from "fs";
import path from "path";

const readSource = (fileName) =>
  fs
    .readFileSync(path.join(__dirname, fileName), "utf8")
    .replace(/\r\n/g, "\n");

const ruleFor = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] || "";
};

describe("Orb final presentation guardrails", () => {
  const css = readSource("OrbPageFinalPolish.css");
  const finishCss = readSource("OrbMetalbloomFinish.css");
  const pageSource = readSource("OrbPage.js");
  const avatarSource = readSource("MetabloomAvatar.js");

  test("loads the finish layer after every other Orb presentation layer", () => {
    const experienceIndex = pageSource.indexOf('import "./OrbPageExperience.css";');
    const polishIndex = pageSource.indexOf('import "./OrbPageFinalPolish.css";');
    const focusIndex = pageSource.indexOf('import "./OrbComposerFocus.css";');
    const finishIndex = pageSource.indexOf('import "./OrbMetalbloomFinish.css";');

    expect(experienceIndex).toBeGreaterThan(-1);
    expect(polishIndex).toBeGreaterThan(experienceIndex);
    expect(focusIndex).toBeGreaterThan(polishIndex);
    expect(finishIndex).toBeGreaterThan(focusIndex);
  });

  test("neutralizes inherited global button geometry", () => {
    const buttonRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button",
    );

    expect(buttonRule).toContain("padding: 0;");
    expect(buttonRule).toContain("margin: 0;");
    expect(buttonRule).toContain("place-items: center;");
    expect(buttonRule).toContain("appearance: none;");
    expect(buttonRule).toContain("-webkit-appearance: none;");
  });

  test("uses the shared rainbow material for the composer border", () => {
    const composerRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer",
    );
    const ringRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer::after",
    );
    const focusRingRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer:focus-within::after",
    );

    expect(composerRule).toContain("border-color: transparent;");
    expect(ringRule).toContain("var(--aetheris-spectral-border-soft)");
    expect(ringRule).toContain("opacity: 1;");
    expect(focusRingRule).toContain("var(--aetheris-spectral)");
  });

  test("uses spectral borders for every suggested prompt", () => {
    const promptRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__suggestions button",
    );
    const hoverRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__suggestions button:hover",
    );
    const focusRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__suggestions button:focus-visible",
    );

    expect(promptRule).toContain("border: 1px solid transparent;");
    expect(promptRule).toContain("var(--aetheris-spectral-border-soft) border-box");
    expect(hoverRule).toContain("var(--aetheris-spectral) border-box");
    expect(focusRule).toContain("var(--aetheris-spectral) border-box");
  });

  test("paints the real inline SVG path instead of a masked replacement", () => {
    const svgRule = ruleFor(
      finishCss,
      ".orb-page .metabloom-chat__composer button svg",
    );
    const pathRule = ruleFor(
      finishCss,
      ".orb-page .metabloom-chat__composer button svg path",
    );
    const retiredMaskRule = ruleFor(
      finishCss,
      ".orb-page .metabloom-chat__composer button::after",
    );

    expect(svgRule).toContain("opacity: 1;");
    expect(pathRule).toContain('stroke: url("#orb-send-gradient");');
    expect(retiredMaskRule).toContain("display: none;");
    expect(retiredMaskRule).toContain("content: none;");
    expect(pageSource).toContain('id="orb-send-gradient"');
    expect(pageSource.match(/orb-page__send-stop--/g)).toHaveLength(4);
    expect(css).not.toContain("send-up.svg");
    expect(css).not.toContain("-webkit-mask:");
    expect(finishCss).not.toContain("send-up.svg");
  });

  test("threads the selected Dither-page material into the existing renderer", () => {
    expect(pageSource).toContain('aria-label="Metabloom material finish"');
    expect(pageSource).toContain('aria-label="Use spectral fluid for Metabloom"');
    expect(pageSource).toContain('aria-label="Use liquid metal for Metabloom"');
    expect(pageSource).toContain("MetabloomPaletteContext.Provider");
    expect(pageSource).toContain("data-metabloom-palette={metabloomPalette}");
    expect(avatarSource).toContain("const metabloomPalette = useMetabloomPalette()");
    expect(avatarSource).toContain("metabloomPalette={metabloomPalette}");
    expect(avatarSource).toContain("data-avatar-finish={metabloomPalette}");
  });

  test("keeps status chrome out of the landing composition", () => {
    const landingRule = ruleFor(
      css,
      '.orb-page[data-conversation-started="false"]\n  .metabloom-chat__presence',
    );
    const activeRule = ruleFor(
      css,
      '.orb-page[data-conversation-started="true"]\n  .metabloom-chat__presence',
    );

    expect(landingRule).toContain("visibility: hidden;");
    expect(landingRule).toContain("opacity: 0;");
    expect(activeRule).toContain("visibility: visible;");
    expect(activeRule).toContain("opacity: 1;");
  });

  test("bounds narrow-screen composer, prompts, and finish controls", () => {
    expect(css).toContain("width: calc(100% - 2.4rem);");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 4.4rem;");
    expect(css).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(css).toContain("grid-column: 1 / -1;");
    expect(css).toContain("@media (max-width: 360px)");
    expect(finishCss).toContain("max-width: calc(100vw - 2.4rem);");
    expect(finishCss).toContain("min-height: 4.4rem;");
  });

  test("preserves reduced-motion and forced-color behavior", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none;");
    expect(finishCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(finishCss).toContain("@media (forced-colors: active)");
    expect(finishCss).toContain("stroke: ButtonText;");
  });
});
