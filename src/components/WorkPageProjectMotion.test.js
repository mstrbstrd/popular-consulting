import fs from "fs";
import path from "path";

const motionCssPath = path.join(__dirname, "WorkPageProjectMotion.css");
const indexPath = path.join(__dirname, "..", "index.js");

describe("WorkPage project motion", () => {
  const css = fs.readFileSync(motionCssPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");

  test("loads the project motion stylesheet after the work-page mode overrides", () => {
    const modesImport = indexSource.indexOf("./components/WorkPageModes.css");
    const motionImport = indexSource.indexOf("./components/WorkPageProjectMotion.css");

    expect(modesImport).toBeGreaterThan(-1);
    expect(motionImport).toBeGreaterThan(modesImport);
  });

  test("defines a distinct motion language for every showcase project", () => {
    expect(css).toContain("commerce-route-packets");
    expect(css).toContain("creator-tenant-orbit");
    expect(css).toContain("spectrafy-playhead");
    expect(css).toContain("popcon-morph-core");

    [1, 2, 3, 4].forEach((projectIndex) => {
      expect(css).toContain(`.work-project:nth-child(${projectIndex})`);
    });
  });

  test("keeps motion optional for reduced-motion users and print", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("@media print");
  });
});
