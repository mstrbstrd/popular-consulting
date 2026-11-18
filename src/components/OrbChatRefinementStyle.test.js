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
  // The site-wide button padding must not widen the New chat icon button.
  const sidebar = readSource("./OrbSidebarNavigation.css");
  const newChat = sidebar.slice(sidebar.indexOf(".orb-page .metabloom-threads__mobile-new {"));
  expect(newChat.slice(0, newChat.indexOf("}"))).toMatch(/width: 44px; height: 44px; padding: 0;/);
  const layout = readSource("./OrbWorkspaceLayout.css");
  const phone = layout.slice(layout.indexOf("@media (max-width: 560px)"));
  // More shows its plus mark and Deep Research reads "Research"; names stay full.
  expect(phone).toMatch(/:is\(\.metabloom-chat__label-qualifier, \.metabloom-reactions__toggle-label\) \{\s*position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\)/);
  // An open component or briefing keeps only the route back and the message box below it.
  expect(phone).toMatch(/\[data-component-view="expanded"\] \.metabloom-chat__conversation-tools \{ display: none; \}/);
  expect(phone).toMatch(/\.metabloom-chat__component-reply > span \{\s*-webkit-line-clamp: 1;/);
});
