import fs from "fs";
import path from "path";
import {
  disableWebGLForSession,
  hasHardwareWebGL,
  isMobileTier,
  shaderDPR,
} from "./deviceTier";

/* deviceTier's exports are evaluated VALUES, not factory functions.
   Consumers that call them (`shaderDPR()`) throw "is not a function" at
   runtime, and because these modules are canvas/WebGL heavy they are
   mocked out of most suites, so such a mistake ships silently. This pins
   both the contract and its call sites. */
describe("deviceTier export contract", () => {
  test("exports evaluated values, not functions", () => {
    expect(typeof shaderDPR).toBe("number");
    expect(Number.isFinite(shaderDPR)).toBe(true);
    expect(typeof isMobileTier).toBe("boolean");
    expect(typeof hasHardwareWebGL).toBe("boolean");
    expect(typeof disableWebGLForSession).toBe("function");
  });

  test("consumers use the evaluated capability exports as values", () => {
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

  test("hardware capability requires WebGL 2 and never falls back to WebGL 1", () => {
    const source = fs.readFileSync(path.join(__dirname, "deviceTier.js"), "utf8");

    expect(source).toMatch(/canvas\.getContext\(["']webgl2["']/);
    expect(source).not.toMatch(/getContext\(["']webgl["']\)/);
    expect(source).toContain("gl.COMPILE_STATUS");
    expect(source).toContain("gl.LINK_STATUS");
    expect(source).toContain("failIfMajorPerformanceCaveat: true");
    expect(source).toContain('powerPreference: "high-performance"');
  });

  test("a live WebGL context loss can disable graphics for the session", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem");

    disableWebGLForSession();

    expect(setItem).toHaveBeenCalledWith("popcon-webgl-disabled", "1");
    setItem.mockRestore();
  });
});
