import fs from "fs";
import path from "path";

/* Regression guard: the dvh transform helpers must return STRING literals
   in the supported branch. A careless refactor once replaced the literals
   inside the helpers' own definitions with self-calls — infinite recursion
   on every dvh-capable browser (i.e. production) while jsdom, which
   reports no dvh support, kept taking the safe branch and tests stayed
   green. The site shipped a blank page. */
describe("ParallaxBackground dvh helpers", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "ParallaxBackground.js"),
    "utf8",
  );

  test("supported branch yields dvh string literals, not self-calls", () => {
    expect(source).toContain(
      'SUPPORTS_DVH ? "translateY(100dvh)" : `translateY(${window.innerHeight}px)`',
    );
    expect(source).toContain(
      'SUPPORTS_DVH ? "translateY(-100dvh)" : `translateY(-${window.innerHeight}px)`',
    );
    expect(source).not.toMatch(/SUPPORTS_DVH \? shift(Down|Up)\(\)/);
  });
});
