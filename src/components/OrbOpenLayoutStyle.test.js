import fs from "fs";
import path from "path";

const readCss = () =>
  fs
    .readFileSync(path.join(__dirname, "OrbPageExperience.css"), "utf8")
    .replace(/\r\n/g, "\n");

const ruleFor = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] || "";
};

describe("Orb open conversation layout", () => {
  const css = readCss();

  test("removes the containing chat panel at every viewport size", () => {
    const shellRule = ruleFor(css, ".orb-page .metabloom-chat__shell");

    expect(shellRule).toContain("width: 100%;");
    expect(shellRule).toContain("height: 100%;");
    expect(shellRule).toContain("overflow: visible;");
    expect(shellRule).toContain("border: 0;");
    expect(shellRule).toContain("border-radius: 0;");
    expect(shellRule).toContain("background: transparent;");
    expect(shellRule).toContain("backdrop-filter: none;");
    expect(shellRule).toContain("box-shadow: none;");
    expect(css).not.toContain("width: min(58rem, 48vw);");
  });

  test("anchors assistant responses left and user messages right", () => {
    const assistantRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__message--assistant",
    );
    const userRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__message--user",
    );

    expect(assistantRule).toContain("align-self: flex-start;");
    expect(assistantRule).toContain("margin-right: auto;");
    expect(userRule).toContain("align-self: flex-end;");
    expect(userRule).toContain("margin-left: auto;");
  });

  test("centers the composer initially and docks it after conversation starts", () => {
    const composerAreaRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer-area",
    );

    expect(composerAreaRule).toContain("position: fixed;");
    expect(composerAreaRule).toContain("top: 50%;");
    expect(composerAreaRule).toContain("left: 50%;");
    expect(composerAreaRule).toContain("transform: translate(-50%, -50%);");
    expect(css).toContain(
      ".metabloom-chat__message-list > article:nth-of-type(2)",
    );
    expect(css).toContain(
      "top: calc(100% - max(1.8rem, env(safe-area-inset-bottom)));",
    );
    expect(css).toContain("transform: translate(-50%, -100%);");
  });

  test("keeps the production composer accessible and touch-safe", () => {
    const composerRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer",
    );
    const textareaRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer textarea",
    );
    const buttonRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button",
    );

    expect(composerRule).toContain("var(--aetheris-spectral-border-soft)");
    expect(composerRule).toContain("backdrop-filter: blur(24px)");
    expect(textareaRule).toContain("font-size: 1.55rem;");
    expect(textareaRule).toContain("caret-color: var(--aetheris-teal);");
    expect(buttonRule).toContain("width: 4.8rem;");
    expect(buttonRule).toContain("height: 4.8rem;");
    expect(buttonRule).toContain("min-width: 4.8rem;");
    expect(buttonRule).toContain("min-height: 4.8rem;");
    expect(css).toContain("box-shadow: var(--aetheris-focus-halo);");
  });

  test("preserves reduced-motion, reduced-transparency, and forced-color paths", () => {
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
