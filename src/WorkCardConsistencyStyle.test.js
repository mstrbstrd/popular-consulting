import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const stripCssComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

describe("work page card consistency styling", () => {
  const css = readRepositoryFile("src/work-card-consistency.css");
  const cssWithoutComments = stripCssComments(css);
  const workPageCss = readRepositoryFile("src/components/WorkPage.css");
  const indexSource = readRepositoryFile("src/index.js");

  test("loads after the existing work-page refinements", () => {
    const navigationImport = indexSource.indexOf(
      "import './work-navigation-refinement.css';",
    );
    const cardImport = indexSource.indexOf(
      "import './work-card-consistency.css';",
    );

    expect(navigationImport).toBeGreaterThanOrEqual(0);
    expect(cardImport).toBeGreaterThan(navigationImport);
  });

  test("uses the shared masked ring without the contact-only top rule", () => {
    expect(workPageCss).toContain(
      ".work-page__hero-panel::after,\n.work-project::after,\n.work-page__contact::after",
    );
    expect(cssWithoutComments).toContain(
      "html body .work-page .work-page__contact::before",
    );
    expect(cssWithoutComments).toContain("content: none;");
  });

  test("does not alter the other work-page cards", () => {
    [
      ".work-project",
      ".work-capability",
      ".work-page__principle-grid",
      ".work-page__hero-panel",
    ].forEach((selector) =>
      expect(cssWithoutComments).not.toContain(selector),
    );
  });
});
