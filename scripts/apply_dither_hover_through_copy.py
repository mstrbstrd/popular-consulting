from pathlib import Path


def replace_exact(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one source block, found {count}."
        )
    return source.replace(old, new, 1)


field_path = Path("src/components/CreatorOSFieldCanvas.js")
field_source = field_path.read_text(encoding="utf-8")

field_source = replace_exact(
    field_source,
    '''    const pulseOrigin = { x: 0.52, y: 0.52 };
    const page = root.closest(".dither-canvas-page");

    const reportState = (nextState) => {''',
    '''    const pulseOrigin = { x: 0.52, y: 0.52 };
    const page = root.closest(".dither-canvas-page");
    const pointerSurface = page || root;

    const reportState = (nextState) => {''',
    "CreatorOS field pointer surface",
)

field_source = replace_exact(
    field_source,
    '''    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });''',
    '''    pointerSurface.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    pointerSurface.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });''',
    "CreatorOS field pointer listeners",
)

field_source = replace_exact(
    field_source,
    '''      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerleave", handlePointerLeave);''',
    '''      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      pointerSurface.removeEventListener("pointerleave", handlePointerLeave);''',
    "CreatorOS field pointer cleanup",
)

field_path.write_text(field_source, encoding="utf-8")


rupture_path = Path("src/components/RuptureCanvas.js")
rupture_source = rupture_path.read_text(encoding="utf-8")

rupture_source = replace_exact(
    rupture_source,
    '''    const page = root.closest(".dither-canvas-page");

    const reportState = (nextState) => {''',
    '''    const page = root.closest(".dither-canvas-page");
    const pointerSurface = page || root;

    const reportState = (nextState) => {''',
    "Second Surface pointer surface",
)

rupture_source = replace_exact(
    rupture_source,
    '''    const handlePointerMove = (event) => {
      syncPointer(event);
      if (controlledProgressRef.current !== null) return;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const deltaPixels = drag.lastY - event.clientY;
      drag.lastY = event.clientY;
      setTargetProgress(
        targetProgress + deltaPixels / Math.max(height * 2.4, 1),
      );
    };''',
    '''    const handlePointerMove = (event) => {
      syncPointer(event);
    };

    const handlePointerDrag = (event) => {
      if (controlledProgressRef.current !== null) return;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const deltaPixels = drag.lastY - event.clientY;
      drag.lastY = event.clientY;
      setTargetProgress(
        targetProgress + deltaPixels / Math.max(height * 2.4, 1),
      );
    };''',
    "Second Surface hover and drag separation",
)

rupture_source = replace_exact(
    rupture_source,
    '''    window.addEventListener("wheel", handleWheel, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerup", finishPointerDrag, { passive: true });
    root.addEventListener("pointercancel", finishPointerDrag, { passive: true });
    window.addEventListener("keydown", handleKeyDown);''',
    '''    window.addEventListener("wheel", handleWheel, { passive: true });
    pointerSurface.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointermove", handlePointerDrag, { passive: true });
    root.addEventListener("pointerup", finishPointerDrag, { passive: true });
    root.addEventListener("pointercancel", finishPointerDrag, { passive: true });
    window.addEventListener("keydown", handleKeyDown);''',
    "Second Surface pointer listeners",
)

rupture_source = replace_exact(
    rupture_source,
    '''      window.removeEventListener("wheel", handleWheel);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerup", finishPointerDrag);
      root.removeEventListener("pointercancel", finishPointerDrag);''',
    '''      window.removeEventListener("wheel", handleWheel);
      pointerSurface.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointermove", handlePointerDrag);
      root.removeEventListener("pointerup", finishPointerDrag);
      root.removeEventListener("pointercancel", finishPointerDrag);''',
    "Second Surface pointer cleanup",
)

rupture_path.write_text(rupture_source, encoding="utf-8")


test_path = Path("src/components/DitherCanvasPointerCoverage.test.js")
test_path.write_text(
    '''const fs = require("fs");
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
''',
    encoding="utf-8",
)
