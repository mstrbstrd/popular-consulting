import fs from "fs";
import path from "path";

const readSource = (name) =>
  fs
    .readFileSync(path.join(__dirname, name), "utf8")
    .replace(/\r\n/g, "\n");

const ruleFor = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] || "";
};

describe("Orb production presentation", () => {
  const css = readSource("OrbPageExperience.css");
  const pageCss = readSource("OrbPage.css");
  const pageSource = readSource("OrbPage.js");

  test("keeps the conversation open across the full viewport", () => {
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

  test("uses explicit application state instead of DOM-position inference", () => {
    expect(pageSource).toContain(
      'data-conversation-started={conversationStarted ? "true" : "false"}',
    );
    expect(pageSource).toContain(
      "onConversationStateChange={setConversationStarted}",
    );
    expect(css).toContain(
      '.orb-page[data-conversation-started="true"]\n  .metabloom-chat__composer-area',
    );
    expect(css).toContain(
      '.orb-page[data-conversation-started="true"] .orb-page__identity',
    );
    expect(css).not.toContain(":has(");
    expect(css).not.toContain("nth-of-type");
  });

  test("keeps status chrome quiet and removes duplicate landing labels", () => {
    const presenceRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__presence",
    );
    const presenceAfterRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__presence::after",
    );

    expect(presenceRule).toContain(
      "border: 1px solid var(--aetheris-line-strong);",
    );
    expect(presenceRule).toContain("pointer-events: none;");
    expect(presenceAfterRule).toContain("display: none;");
    expect(pageSource).not.toContain("Interactive interface study");
    expect(pageSource).not.toContain("orb-page__principles");
  });

  test("makes the composer calm at rest and explicit on focus", () => {
    const composerRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer",
    );
    const ringRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer::after",
    );
    const focusRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer:focus-within",
    );
    const textareaRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer textarea",
    );
    const buttonRule = ruleFor(
      css,
      ".orb-page .metabloom-chat__composer button",
    );

    expect(composerRule).toContain(
      "border: 1px solid var(--aetheris-line-strong);",
    );
    expect(composerRule).toContain(
      "border-radius: var(--aetheris-radius-pill);",
    );
    expect(composerRule).toContain("backdrop-filter: blur(22px)");
    expect(ringRule).toContain("var(--aetheris-spectral-border-soft)");
    expect(ringRule).toContain("opacity: 0.28;");
    expect(focusRule).toContain("var(--aetheris-focus-halo)");
    expect(textareaRule).toContain("font-size: 1.5rem;");
    expect(textareaRule).toContain("caret-color: var(--aetheris-teal);");
    expect(buttonRule).toContain("width: 4.6rem;");
    expect(buttonRule).toContain("height: 4.6rem;");
    expect(buttonRule).toContain("border-radius: 50%;");
    expect(css).toContain(".metabloom-chat__composer button svg");
  });

  test("keeps the mobile composition inside the visual viewport", () => {
    expect(css).toContain(
      "--orb-composer-width: calc(100vw - 2.4rem);",
    );
    expect(css).toContain("max-width: calc(100vw - 2.4rem);");
    expect(css).toContain("width: calc(100vw - 4rem);");
    expect(css).toContain("overflow-wrap: anywhere;");
    expect(pageCss).toContain("box-sizing: border-box;");
  });

  test("loads the route presentation once and preserves accessibility modes", () => {
    expect(pageSource.match(/OrbPageExperience\.css/g)).toHaveLength(1);
    expect(pageCss).not.toContain('@import "./OrbPageExperience.css";');
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });
});
