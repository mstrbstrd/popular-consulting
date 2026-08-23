import fs from "fs";
import path from "path";
import { shiftPopcornGameTimeline } from "./PopcornGame";

describe("PopcornGame runtime ownership", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/PopcornGame.js"),
    "utf8",
  );

  test("shifts all wall-clock state when a hidden game resumes", () => {
    const game = {
      startMs: 100,
      lastSpawn: 200,
      lastGolden: 300,
      particles: [{ born: 400 }],
      kernels: [
        {
          spawnedAt: 500,
          popStartMs: 600,
          poppedAt: 700,
          fadeStart: 800,
        },
      ],
    };

    expect(shiftPopcornGameTimeline(game, 250)).toBe(game);
    expect(game).toEqual({
      startMs: 350,
      lastSpawn: 450,
      lastGolden: 550,
      particles: [{ born: 650 }],
      kernels: [
        {
          spawnedAt: 750,
          popStartMs: 850,
          poppedAt: 950,
          fadeStart: 1050,
        },
      ],
    });
  });

  test("does not run an offscreen or hidden canvas loop", () => {
    expect(source).toContain(
      "const runtimeActive = isActive !== false && documentVisible;",
    );
    expect(source).toContain("if (!runtimeActive) {");
    expect(source).toContain("stopLoop();");
    expect(source).toContain("if (!canvas || rafRef.current) return;");
  });

  test("renders the idle canvas once instead of looping forever", () => {
    expect(source).toContain(
      "if (g.running || g.particles.length > 0 || g.kernels.length > 0)",
    );
  });
});
