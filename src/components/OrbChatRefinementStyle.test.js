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
