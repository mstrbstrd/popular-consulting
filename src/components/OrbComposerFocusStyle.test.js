import fs from "fs";
import path from "path";

const readSource = (filePath) =>
  fs
    .readFileSync(path.resolve(__dirname, filePath), "utf8")
    .replace(/\r\n/g, "\n");

const ruleFor = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] || "";
};

describe("Orb composite composer focus", () => {
  const css = readSource("OrbComposerFocus.css");
  const experienceCss = readSource("OrbPageExperience.css");
  const pageSource = readSource("OrbPage.js");
  const siteCss = readSource("../aetheris-site.css");

  test("loads after every other Orb presentation layer", () => {
    const finalPolishIndex = pageSource.indexOf(
      'import "./OrbPageFinalPolish.css";',
    );
    const focusPolishIndex = pageSource.indexOf(
      'import "./OrbComposerFocus.css";',
    );

    expect(finalPolishIndex).toBeGreaterThan(-1);
    expect(focusPolishIndex).toBeGreaterThan(finalPolishIndex);
  });

  test("prevents the textarea from drawing a nested rectangular halo", () => {
    const textareaRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer textarea",
    );
    const focusedTextareaRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer textarea:focus,\n.orb-page .metabloom-chat__composer textarea:focus-visible",
    );

    expect(siteCss).toContain(
      ':where(a, button, input, textarea, select, [role="button"]):focus-visible',
    );
    expect(textareaRule).toContain("outline: none;");
    expect(textareaRule).toContain("box-shadow: none;");
    expect(textareaRule).toContain("appearance: none;");
    expect(textareaRule).toContain("-webkit-appearance: none;");
    expect(focusedTextareaRule).toContain("outline: none;");
    expect(focusedTextareaRule).toContain("box-shadow: none;");
  });

  test("keeps the rounded composer as the visible focus owner", () => {
    const composerFocusRule = ruleFor(
      experienceCss,
      ".orb-page .metabloom-chat__composer:focus-within",
    );

    expect(composerFocusRule).toContain("var(--aetheris-focus-halo)");
    expect(css).toContain("outline: 2px solid Highlight;");
    expect(css).toContain("outline-offset: 2px;");
  });

  test("overrides the site-wide important outline in forced-colors mode", () => {
    expect(siteCss).toContain("outline: 3px solid CanvasText !important;");
    expect(css).toContain("outline: none !important;");
    expect(css).toContain("outline-offset: 0 !important;");
    expect(css).toContain("box-shadow: none !important;");
  });
});
