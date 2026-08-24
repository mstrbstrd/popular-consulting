import fs from "fs";
import path from "path";

describe("Dither foreground layer contract", () => {
  const ditherSource = fs.readFileSync(
    path.join(__dirname, "DitherBackground.js"),
    "utf8",
  );
  const managedSource = fs.readFileSync(
    path.join(__dirname, "ManagedDitherBackground.js"),
    "utf8",
  );

  test("decorative canvases cannot intercept foreground controls", () => {
    expect(ditherSource.match(/data-graphics-layer="decorative"/g)).toHaveLength(2);
    expect(ditherSource.match(/pointerEvents: "none"/g).length).toBeGreaterThanOrEqual(2);
    expect(ditherSource.match(/zIndex: -1/g)).toHaveLength(2);
    expect(managedSource).toContain('data-dither-layer-host="true"');
    expect(managedSource).toContain('isolation: "isolate"');
    expect(managedSource).toContain('pointerEvents: "none"');
  });

  test("visual clicks are observed passively and never owned by the canvas", () => {
    expect(ditherSource).toContain(
      'window.addEventListener("click", handleCanvasClick, { passive: true })',
    );
    expect(ditherSource).toContain(
      'window.removeEventListener("click", handleCanvasClick)',
    );
    expect(ditherSource).not.toContain(
      'canvas.addEventListener("click", handleCanvasClick)',
    );
    expect(ditherSource).toContain("isInteractiveClickTarget(event.target)");
    expect(ditherSource).toContain("event.clientX < rect.left");
    expect(ditherSource).toContain("event.clientY > rect.bottom");
  });
});
