import fs from "fs";
import path from "path";

const motionCssPath = path.join(__dirname, "WorkPageProjectMotionV2.css");
const indexPath = path.join(__dirname, "..", "index.js");

describe("WorkPage project showcase visuals", () => {
  const css = fs.readFileSync(motionCssPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");

  test("loads the replacement showcase stylesheet after work-page mode overrides", () => {
    const modesImport = indexSource.indexOf("./components/WorkPageModes.css");
    const motionImport = indexSource.indexOf("./components/WorkPageProjectMotionV2.css");

    expect(modesImport).toBeGreaterThan(-1);
    expect(motionImport).toBeGreaterThan(modesImport);
    expect(indexSource).not.toContain("./components/WorkPageProjectMotion.css");
  });

  test("builds four genuinely different visual compositions", () => {
    expect(css).toContain("staged transaction pipeline");
    expect(css).toContain("multi-tenant orchestration constellation");
    expect(css).toContain("browser player, waveform and equalizer");
    expect(css).toContain("generative shader canvas");

    expect(css).toContain("grid-template-columns: repeat(4, 1fr)");
    expect(css).toContain("creator-queue-orbit");
    expect(css).toContain("spectrafy-equalizer");
    expect(css).toContain("popcon-field-warp");
  });

  test("scopes every construction to its own showcase project", () => {
    [1, 2, 3, 4].forEach((projectIndex) => {
      expect(css).toContain(`.work-project:nth-child(${projectIndex})`);
    });
  });

  test("keeps all visual motion optional for reduced-motion users and print", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("@media print");
  });
});
