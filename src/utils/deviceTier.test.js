import fs from "fs";
import path from "path";
import { hasHardwareWebGL, isMobileTier, shaderDPR } from "./deviceTier";

/* deviceTier's exports are evaluated VALUES, not factory functions.
   Consumers that call them (`shaderDPR()`) throw "is not a function" at
   runtime — and because these modules are canvas/WebGL heavy they are
   mocked out of most suites, so such a mistake ships silently. This pins
   both the contract and its call sites. */
describe("deviceTier export contract", () => {
  test("exports evaluated values, not functions", () => {
    expect(typeof shaderDPR).toBe("number");
    expect(Number.isFinite(shaderDPR)).toBe(true);
    expect(typeof isMobileTier).toBe("boolean");
    expect(typeof hasHardwareWebGL).toBe("boolean");
  });

  test("consumers use the exports as values", () => {
    const componentsDir = path.join(__dirname, "..", "components");
    const offenders = [];

    for (const file of fs.readdirSync(componentsDir)) {
      if (!file.endsWith(".js") || file.endsWith(".test.js")) continue;
      const source = fs.readFileSync(path.join(componentsDir, file), "utf8");
      if (/\b(shaderDPR|isMobileTier|hasHardwareWebGL)\s*\(/.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
