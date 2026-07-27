import fs from "fs";
import path from "path";

const motionCssPath = path.join(__dirname, "WorkPageProjectMotionV2.css");
const indexPath = path.join(__dirname, "..", "index.js");

describe("WorkPage project showcase visuals", () => {
  const css = fs.readFileSync(motionCssPath, "utf8");
  const normalizedCss = css.toLowerCase();
  const indexSource = fs.readFileSync(indexPath, "utf8");

  test("loads the report-grounded showcase stylesheet after work-page mode overrides", () => {
    const modesImport = indexSource.indexOf("./components/WorkPageModes.css");
    const motionImport = indexSource.indexOf("./components/WorkPageProjectMotionV2.css");

    expect(modesImport).toBeGreaterThan(-1);
    expect(motionImport).toBeGreaterThan(modesImport);
    expect(indexSource).not.toContain("./components/WorkPageProjectMotion.css");
  });

  test("visualizes the technical concepts documented for every project", () => {
    [
      "market isolation",
      "payment provider",
      "nav commit",
      "verified stripe webhook",
      "postgresql source of truth",
      "audit + retry jobs",
      "one audio engine",
      "authorized redirect",
      "private object",
      "capability detection",
      "css fallback",
      "telemetry + a11y",
    ].forEach((concept) => {
      expect(normalizedCss).toContain(concept);
    });
  });

  test("uses separate operational timelines instead of one generic animation", () => {
    expect(css).toContain("commerce-ca-transaction");
    expect(css).toContain("creator-verified-write");
    expect(css).toContain("spectrafy-request-trace");
    expect(css).toContain("popcon-route-fallback");

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