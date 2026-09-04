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

  test("matches submit and prompt fills to the neutral text box surface", () => {
    const composerRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer",
    );
    const submitRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button",
    );
    const enabledSubmitRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button:not(:disabled)",
    );
    const promptRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__suggestions button",
    );

    [composerRule, submitRule, enabledSubmitRule, promptRule].forEach((rule) => {
      expect(rule).toContain("background: var(--orb-control-surface);");
    });
    [submitRule, enabledSubmitRule, promptRule].forEach((rule) => {
      expect(rule).not.toContain("linear-gradient(");
    });
  });

  test("keeps spectral borders without using them as button fills", () => {
    const sharedRingRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button::before,\n.orb-page .metabloom-chat__suggestions button::before",
    );
    const hoverRingRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button:hover:not(:disabled)::before,\n  .orb-page .metabloom-chat__suggestions button:hover::before",
    );
    const focusRingRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__suggestions button:focus-visible::before",
    );

    expect(sharedRingRule).toContain("var(--aetheris-spectral-border-soft)");
    expect(sharedRingRule).toContain("-webkit-mask:");
    expect(sharedRingRule).toContain("mask-composite: exclude;");
    expect(hoverRingRule).toContain("var(--aetheris-spectral)");
    expect(focusRingRule).toContain("var(--aetheris-spectral)");
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
    expect(css).not.toContain("-webkit-mask: url");
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

  test("keeps keyboard focus visible above active finish styling", () => {
    const focusRule = ruleFor(
      finishCss,
      ".orb-page .orb-page__finish-option:focus-visible,\n.orb-page .orb-page__finish-option.is-active:focus-visible",
    );

    expect(focusRule).toContain(
      "outline: 2px solid var(--aetheris-focus-line);",
    );
    expect(focusRule).toContain("box-shadow: var(--aetheris-focus-halo);");
    expect(finishCss).toContain("outline: 2px solid Highlight !important;");
    expect(finishCss).toContain("box-shadow: none !important;");
  });

  test("preserves reduced-motion, transparency, and forced-color behavior", () => {
    const reducedMotionRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__presence,\n  .orb-page .metabloom-chat__composer button,\n  .orb-page .metabloom-chat__suggestions button,\n  .orb-page .metabloom-chat__composer button::before,\n  .orb-page .metabloom-chat__suggestions button::before",
    );

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reducedMotionRule).toContain("transition: none;");
    expect(css).toContain(
      ".orb-page .metabloom-chat__composer button:hover:not(:disabled),\n  .orb-page .metabloom-chat__suggestions button:hover {\n    transform: none;",
    );
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("background: var(--aetheris-panel-raised);");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("button::before");
    expect(finishCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(finishCss).toContain("@media (forced-colors: active)");
    expect(finishCss).toContain("stroke: ButtonText;");
  });
});
