import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(__dirname, "../..");

// Updating an SVG must update every simple-logo surface, not leave a PNG in use.
describe("Simple PopCon logo asset wiring", () => {
  test.each([
    "HeroLogo.js",
    "LoadingOverlay.js",
    "WorkPage.js",
    "BusinessSystemsVisual.js",
  ])("%s imports the scalable logo instead of the legacy bitmap", (filename) => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, "src/components", filename),
      "utf8",
    );

    expect(source).toMatch(
      /import (?:logo|nodeLogo) from ["']\.\.\/assets\/icons\/popcon_svg\.svg["'];/,
    );
    expect(source).not.toContain("popcon_png.png");
  });

  test("public and bundled SVG copies cannot drift apart", () => {
    const bundled = fs.readFileSync(
      path.join(repositoryRoot, "src/assets/icons/popcon_svg.svg"),
      "utf8",
    );
    const publicLogo = fs.readFileSync(
      path.join(repositoryRoot, "public/popcon_svg.svg"),
      "utf8",
    );

    expect(bundled).toBe(publicLogo);
  });

  test("the logo retains its viewport, colour, and vector cutouts without raster content", () => {
    const source = fs.readFileSync(
      path.join(repositoryRoot, "src/assets/icons/popcon_svg.svg"),
      "utf8",
    );
    const document = new DOMParser().parseFromString(source, "image/svg+xml");
    const svg = document.documentElement;
    const mark = svg.querySelector("path");

    expect(document.querySelector("parsererror")).toBeNull();
    expect(svg.getAttribute("viewBox")).toBe("0 0 200 200");
    expect(mark).not.toBeNull();
    expect(mark.getAttribute("fill")).toBe("#fbfca9");
    expect(mark.getAttribute("fill-rule")).toBe("evenodd");
    expect(svg.querySelector("image, script, foreignObject, filter, mask, rect")).toBeNull();
  });
});
