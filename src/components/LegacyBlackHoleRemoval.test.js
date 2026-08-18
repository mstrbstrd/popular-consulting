import fs from "fs";
import path from "path";

const componentsDirectory = path.join(process.cwd(), "src/components");

describe("legacy black-hole renderer removal", () => {
  test("the persistent RK4 background renderer no longer exists", () => {
    expect(
      fs.existsSync(path.join(componentsDirectory, "BlackHoleBackground.js")),
    ).toBe(false);
  });

  test("components cannot import the removed persistent renderer", () => {
    const offenders = fs
      .readdirSync(componentsDirectory)
      .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"))
      .filter((file) => {
        const source = fs.readFileSync(
          path.join(componentsDirectory, file),
          "utf8",
        );
        return source.includes("BlackHoleBackground");
      });

    expect(offenders).toEqual([]);
  });

  test("the only black-hole implementation is the bounded Orb renderer", () => {
    const source = fs.readFileSync(
      path.join(componentsDirectory, "BlackHoleCanvas.js"),
      "utf8",
    );

    expect(source).toContain("BLACK_HOLE_MAX_PIXELS");
    expect(source).toContain("BLACK_HOLE_FRAME_INTERVAL_MS");
    expect(source).not.toContain("NUM_STEPS");
    expect(source).not.toContain("rk4Step");
  });
});
