import fs from "fs";
import path from "path";

const cssPath = path.join(__dirname, "WorkPage.css");
const indexPath = path.join(__dirname, "..", "index.js");

describe("WorkPage motion budget", () => {
  const css = fs.readFileSync(cssPath, "utf8");
  const indexSource = fs.readFileSync(indexPath, "utf8");

  test("no longer loads the per-project showcase choreography", () => {
    expect(indexSource).not.toContain("WorkPageProjectMotionV2.css");
    expect(
      fs.existsSync(path.join(__dirname, "WorkPageProjectMotionV2.css")),
    ).toBe(false);
  });

  test("defines exactly one entry animation", () => {
    const keyframes = css.match(/@keyframes\s+[\w-]+/g) || [];
    expect(keyframes).toEqual(["@keyframes work-fade-in"]);

    const infinite = css.match(/animation:[^;]*infinite/g) || [];
    expect(infinite).toEqual([]);
  });

  test("keeps all motion optional for reduced-motion users and print", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("transition: none !important");
    expect(css).toContain("@media print");
  });
});
