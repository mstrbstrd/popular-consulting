import fs from "fs";
import path from "path";

const readSource = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");

describe("Orb chat refinement layer", () => {
  const css = readSource("OrbChatRefinement.css");
  const pageSource = readSource("OrbPage.js");

  test("loads after every other Orb presentation layer", () => {
    const refinement = pageSource.indexOf('import "./OrbChatRefinement.css";');
    ["./OrbMetalbloomFinish.css", "./OrbNovaFinish.css", "./OrbWorkspaceLayout.css", "./MetabloomThreadsPanel.css"]
      .forEach((layer) => {
        const index = Math.max(pageSource.indexOf(`import "${layer}";`), pageSource.indexOf(`import '${layer}';`));
        expect(index).toBeGreaterThan(-1);
        expect(refinement).toBeGreaterThan(index);
      });
  });

  test("fades the transcript edge and restores it for accessibility preferences", () => {
    expect(css).toContain("mask-image: linear-gradient(to bottom, transparent 0, #000 3.2rem);");
    expect(css).toMatch(/prefers-reduced-transparency: reduce\), \(prefers-contrast: more\), \(forced-colors: active\) \{[^}]*mask-image: none;/);
  });

  test("hides redundant speaker labels visually without removing them", () => {
    expect(css).toContain(".orb-page .metabloom-chat__message--user .metabloom-chat__speaker,");
    expect(css).toContain(".metabloom-chat__message--assistant + .metabloom-chat__message--assistant .metabloom-chat__speaker");
    expect(css).toContain("clip-path: inset(50%);");
    expect(css).not.toMatch(/__speaker[^{]*\{[^}]*display: none/);
  });

  test("compacts controls only for fine pointers and never touches the field", () => {
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/);
    expect(css).not.toContain("metabloom-chat__field");
    expect(css).not.toContain("@keyframes");
  });
});

test("phones keep the header and conversation controls compact", () => {
  // New chat is a labelled pill with explicit padding (never the site-wide button padding).
  const sidebar = readSource("./OrbSidebarNavigation.css");
  const newChat = sidebar.slice(sidebar.indexOf(".orb-page .metabloom-threads__mobile-new {"));
  expect(newChat.slice(0, newChat.indexOf("}"))).toMatch(/height: 44px; padding: 0 14px 0 12px;/);
  expect(readSource("./MetabloomThreadsPanel.js")).toContain("<NewChatIcon /><span>New chat</span></button>");
  const layout = readSource("./OrbWorkspaceLayout.css");
  const phone = layout.slice(layout.indexOf("@media (max-width: 560px)"));
  // More shows its plus mark and Deep Research reads "Research"; names stay full.
  expect(phone).toMatch(/:is\(\.metabloom-chat__label-qualifier, \.metabloom-reactions__toggle-label\) \{\s*position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\)/);
  // An open component or briefing keeps only the route back and the message box below it.
  expect(phone).toMatch(/\[data-component-view="expanded"\] \.metabloom-chat__conversation-tools \{ display: none; \}/);
  expect(phone).toMatch(/\.metabloom-chat__component-reply > span \{\s*-webkit-line-clamp: 1;/);
  // More's plus mark is centered; the send circle is centered in its column and
  // keeps an opaque surface when empty so its spectral arrow keeps its colours.
  expect(phone).toMatch(/\.metabloom-reactions__toolbar > button \{\s*display: inline-flex; align-items: center; justify-content: center;/);
  expect(phone).toMatch(/\.metabloom-reactions__toolbar > button > span \{ margin: 0; \}/);
  expect(phone).toMatch(/\.metabloom-chat__composer button \{\s*-webkit-appearance: none; appearance: none; display: grid; place-items: center;/);
  expect(phone).toMatch(/\.metabloom-chat__composer button:disabled \{ opacity: 1; \}/);
  // On phones the send button and New chat use the same clear glass as the controls beside them.
  const glass = readSource("./OrbLiquidGlass.css");
  const phoneGlass = glass.slice(glass.indexOf("@media (max-width: 560px)"));
  expect(phoneGlass).toMatch(/\.orb-page \.metabloom-chat__composer button,\s*\.orb-page \.metabloom-threads__mobile-new \{\s*border-color: transparent !important;\s*background: var\(--lg-clear-fill\) !important;/);
  // The phone composer column and its button use the same pixel size.
  expect(readSource("./OrbPageFinalPolish.css")).toContain("grid-template-columns: minmax(0, 1fr) 44px;");
});

test("the workspace bar is one aligned row of pills", () => {
  const visual = readSource("./MetabloomVisual.css");
  // The picker is a pill with the soft spectral ring and its own chevron.
  expect(visual).toMatch(/\.metabloom-component-workspace__picker \{\s*position: relative;[^}]*border-radius: 999px;[^}]*var\(--aetheris-spectral-border-soft\) border-box;/);
  expect(visual).toMatch(/\.metabloom-component-workspace__picker select \{\s*-webkit-appearance: none; appearance: none;/);
  expect(visual).toContain(".orb-page .metabloom-component-workspace__picker + .metabloom-component-workspace__save-status { padding-inline-start: 15px; }");
  expect(visual).toMatch(/> \[data-workspace-saved\],\s*\.orb-page \.metabloom-component-workspace__toolbar > \[data-workspace-toggle\] \{ border-radius: 999px; \}/);
  // Phones give Saved work's room to the title or picker; it stays in More.
  const phone = readSource("./OrbWorkspaceLayout.css");
  expect(phone.slice(phone.indexOf("@media (max-width: 560px)"))).toContain(".metabloom-component-workspace__toolbar > [data-workspace-saved] { display: none; }");
});
