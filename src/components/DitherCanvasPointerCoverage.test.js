const fs = require("fs");
const path = require("path");

const fieldSource = fs.readFileSync(
  path.join(__dirname, "CreatorOSFieldCanvas.js"),
  "utf8",
);
const ruptureSource = fs.readFileSync(
  path.join(__dirname, "RuptureCanvas.js"),
  "utf8",
);

describe("Dither canvas pointer coverage", () => {
  test("tracks CreatorOS field hover through page-level copy overlays", () => {
    expect(fieldSource).toContain("const pointerSurface = page || root");
    expect(fieldSource).toContain(
      'pointerSurface.addEventListener("pointermove", handlePointerMove',
    );
    expect(fieldSource).toContain(
      'pointerSurface.addEventListener("pointerleave", handlePointerLeave',
    );
    expect(fieldSource).toContain(
      'pointerSurface.removeEventListener("pointermove", handlePointerMove)',
    );
    expect(fieldSource).toContain(
      'pointerSurface.removeEventListener("pointerleave", handlePointerLeave)',
    );
    expect(fieldSource).toContain(
      'root.addEventListener("pointerdown", handlePointerDown',
    );
    expect(fieldSource).not.toContain(
      'root.addEventListener("pointermove", handlePointerMove',
    );
  });

  test("tracks Second Surface hover through overlays without moving drag controls", () => {
    expect(ruptureSource).toContain("const pointerSurface = page || root");
    expect(ruptureSource).toContain(
      'pointerSurface.addEventListener("pointermove", handlePointerMove',
    );
    expect(ruptureSource).toContain(
      'pointerSurface.removeEventListener("pointermove", handlePointerMove)',
    );
    expect(ruptureSource).toContain("const handlePointerDrag = (event) =>");
    expect(ruptureSource).toContain(
      'root.addEventListener("pointermove", handlePointerDrag',
    );
    expect(ruptureSource).toContain(
      'root.removeEventListener("pointermove", handlePointerDrag)',
    );
    expect(ruptureSource).toContain(
      'root.addEventListener("pointerdown", handlePointerDown',
    );
    expect(ruptureSource).not.toContain(
      'root.addEventListener("pointermove", handlePointerMove',
    );
  });
});
