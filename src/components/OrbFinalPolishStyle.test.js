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

  test("preserves reduced-motion behavior", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none;");
  });
});
