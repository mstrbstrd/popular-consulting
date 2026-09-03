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
  const pageSource = readSource("OrbPage.js");
  const sendIconSource = readSource("../assets/icons/send-up.svg");

  test("loads after the route experience layer", () => {
    const experienceIndex = pageSource.indexOf('import "./OrbPageExperience.css";');
    const polishIndex = pageSource.indexOf('import "./OrbPageFinalPolish.css";');

    expect(experienceIndex).toBeGreaterThan(-1);
    expect(polishIndex).toBeGreaterThan(experienceIndex);
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

  test("renders the send arrow with the shared spectral icon colorway", () => {
    const svgRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button svg",
    );
    const iconRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button::after",
    );

    expect(svgRule).toContain("opacity: 0;");
    expect(iconRule).toContain("var(--spectral-icon-colorway");
    expect(iconRule).toContain('url("../assets/icons/send-up.svg")');
    expect(iconRule).toContain("drop-shadow");
    expect(sendIconSource).toContain('viewBox="0 0 24 24"');
    expect(sendIconSource).toContain('stroke="#000"');
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

  test("bounds narrow-screen composer and prompt geometry", () => {
    expect(css).toContain("width: calc(100% - 2.4rem);");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) 4.4rem;");
    expect(css).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(css).toContain("grid-column: 1 / -1;");
    expect(css).toContain("@media (max-width: 360px)");
  });

  test("preserves reduced-motion and forced-color behavior", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none;");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("button svg");
    expect(css).toContain("opacity: 1;");
  });
});
