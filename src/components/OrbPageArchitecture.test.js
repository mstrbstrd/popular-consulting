import fs from "fs";
import path from "path";

const pageSource = fs.readFileSync(
  path.join(__dirname, "OrbPage.js"),
  "utf8",
);
const pageStyles = fs.readFileSync(
  path.join(__dirname, "OrbPage.css"),
  "utf8",
);

describe("OrbPage architecture", () => {
  test("uses one shared application shell and one Metabloom experience", () => {
    expect(pageSource).toContain('import NavMenu from "./NavMenu";');
    expect(pageSource).toContain("<ThemeProvider>");
    expect(pageSource.match(/<NavMenu/g)).toHaveLength(1);
    expect(pageSource.match(/<OrbSection/g)).toHaveLength(1);
    expect(pageSource).toContain("alwaysVisible");
    expect(pageSource).toContain("sectionHrefs={ORB_SECTION_HREFS}");
  });

  test("does not add another graphics renderer or avatar presentation layer", () => {
    [
      "ManagedDitherBackground",
      "BlackHoleCanvas",
      "CreatorOSFieldCanvas",
      "LivingMetabloomCanvas",
      "metabloom-avatar__blob",
      "orb-avatar-lab",
    ].forEach((forbiddenToken) => {
      expect(pageSource).not.toContain(forbiddenToken);
    });
  });

  test("keeps the route atmosphere static and applies the shared UI tokens locally", () => {
    const atmosphereBlock = pageStyles.match(
      /\.orb-page__atmosphere\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(atmosphereBlock).toBeDefined();
    expect(atmosphereBlock).not.toContain("backdrop-filter");
    expect(pageStyles).not.toContain("@keyframes");
    expect(pageStyles).not.toContain("animation:");
    expect(pageStyles).toContain(".orb-page .metabloom-chat__composer");
    expect(pageStyles).toContain("var(--aetheris-spectral-border-soft)");
    expect(pageStyles).toContain("var(--aetheris-glass-panel-raised)");
  });
});
