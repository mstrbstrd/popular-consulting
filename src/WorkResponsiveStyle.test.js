import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("work page responsive styling", () => {
  const css = readRepositoryFile("src/work-responsive.css");
  const indexSource = readRepositoryFile("src/index.js");
  const typographyCss = readRepositoryFile("public/work-typography.css");

  test("loads after the shared visual layers", () => {
    const spectralImport = indexSource.indexOf(
      "import './spectral-icon-colorway.css';",
    );
    const responsiveImport = indexSource.indexOf(
      "import './work-responsive.css';",
    );

    expect(spectralImport).toBeGreaterThanOrEqual(0);
    expect(responsiveImport).toBeGreaterThan(spectralImport);
  });

  test("restores the single-column hero at the component breakpoint", () => {
    expect(typographyCss).toContain(
      "grid-template-columns: minmax(0, 1.36fr) minmax(29rem, 0.64fr);",
    );
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain(
      "html body .work-page .work-page__hero-panel",
    );
    expect(css).toContain("grid-template-columns: minmax(0, 1fr);");
  });

  test("keeps compact navigation behind the menu control", () => {
    expect(css).toContain(".work-page__nav > a");
    expect(css).toContain("display: none;");
    expect(css).toContain(".work-page__menu-toggle");
    expect(css).toContain("display: inline-flex;");
  });

  test("does not restyle authored visuals or content cards", () => {
    [
      ".work-page__backdrop",
      ".work-page__system-card",
      ".work-project",
      ".work-capability",
      "canvas",
    ].forEach((selector) => expect(css).not.toContain(selector));
  });
});
