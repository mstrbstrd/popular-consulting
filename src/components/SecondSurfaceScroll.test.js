const fs = require("fs");
const path = require("path");

describe("Second Surface scroll opening", () => {
  const canvasSource = fs.readFileSync(
    path.join(__dirname, "RuptureCanvas.js"),
    "utf8",
  );
  const shaderSource = fs.readFileSync(
    path.join(__dirname, "RuptureShader.js"),
    "utf8",
  );

  test("supports page-controlled opening without removing legacy inputs or Heal", () => {
    expect(canvasSource).toContain("const SCROLL_DISTANCE_PX");
    expect(canvasSource).toContain("controlledProgressRef");
    expect(canvasSource).toContain(
      "const resetProgress = controlledProgressRef.current ?? 0",
    );
    expect(canvasSource).toContain("progress = resetProgress");
    expect(canvasSource).toContain("targetProgress = resetProgress");
    expect(canvasSource).toContain(
      'window.addEventListener("wheel", handleWheel, { passive: true })',
    );
    expect(canvasSource).toContain("const pointerSurface = page || root");
    expect(canvasSource).toContain(
      'pointerSurface.addEventListener("pointermove", handlePointerMove',
    );
    expect(canvasSource).toContain(
      'root.addEventListener("pointermove", handlePointerDrag',
    );
    expect(canvasSource).toContain(
      'window.addEventListener("keydown", handleKeyDown)',
    );
    expect(canvasSource).not.toContain("autoBranchSpawned");
    expect(canvasSource).not.toContain("branches.push");
    expect(canvasSource).not.toContain("Math.random");
  });

  test("renders one continuous fault with an explicit fully open terminal state", () => {
    expect(shaderSource).toContain("uniform float u_energy;");
    expect(shaderSource).toContain("float faultY(float x)");
    expect(shaderSource).toContain("float faultSlope(float x)");
    expect(shaderSource).toContain("float fullOpen = smoothstep");
    expect(shaderSource).toContain("inside = mix(inside, 1.0, fullOpen);");
    expect(shaderSource).not.toContain("u_branches");
    expect(shaderSource).not.toContain("u_nodes");
    expect(shaderSource).not.toContain("debrisField");
  });
});