import fs from "fs";
import path from "path";

const css = fs.readFileSync(
  path.join(process.cwd(), "src/components/DitherCanvasVibrance.css"), "utf8",
);
const refinements = css.slice(css.indexOf("/* Field-lab readability refinements."));
const lightCopy = refinements.match(
  /\.dither-canvas-page\[data-theme-mode="light"\] \.rupture-copy \{([^}]+)\}/,
)[1];
const ink = (token) => lightCopy.match(new RegExp(`${token}: (#[a-f0-9]{6})`))[1]
  .slice(1).match(/../g).map((channel) => parseInt(channel, 16));
const wash = lightCopy.match(/--study-copy-wash: rgba\(([^)]+)\)/)[1]
  .split(",").map(Number);
const luminance = (rgb) => rgb.map((channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

describe("Dither copy readability boundaries", () => {
  test("only Metabloom receives one-line, container-bounded title sizing", () => {
    expect(refinements).toContain("white-space: nowrap");
    expect(refinements).toContain("overflow-wrap: normal");
    expect(refinements).toContain("word-break: normal");
    expect(refinements).toContain("container-type: inline-size");
    expect(refinements).toContain("10.5cqi");
    expect(refinements).toContain("calc((100cqi - 2.4rem) * 0.04725)");
    const titleRules = [...refinements.matchAll(/([^{}]+)\{[^{}]*font-size:[^{}]*\}/g)];
    expect(titleRules.length).toBeGreaterThan(0);
    titleRules.forEach((rule) => expect(rule[1]).toContain(".dither-study-metabloom .rupture-copy h1"));
    expect(refinements).not.toMatch(/overflow\s*:\s*(?:hidden|clip)|text-overflow\s*:\s*ellipsis/);
  });

  test.each(["--study-copy-ink", "--study-caption-ink"])(
    "%s maintains at least 4.5:1 against the wash over any sRGB field color", (token) => {
      // Black is the darkest possible underlying pixel. The wash raises every
      // channel monotonically, so other field colors can only increase contrast.
      const darkestBackdrop = wash.slice(0, 3).map((value) => value * wash[3]);
      const ratio = (luminance(darkestBackdrop) + 0.05) / (luminance(ink(token)) + 0.05);
      expect(wash[3]).toBeGreaterThan(0);
      expect(wash[3]).toBeLessThanOrEqual(1);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    },
  );

  test("contrast treatment stays local to light-mode supporting copy", () => {
    const colorRules = [...refinements.matchAll(/([^{}]+)\{[^{}]*(?:color|background|box-shadow):[^{}]*\}/g)];
    colorRules.forEach((rule) => {
      expect(rule[1]).toContain('.dither-canvas-page[data-theme-mode="light"] .rupture-copy');
    });
    expect(refinements).toContain("pointer-events: none");
    expect(refinements).toContain("isolation: isolate");
    expect(refinements).toContain("prefers-reduced-transparency: reduce");
    expect(refinements).toContain("forced-colors: active");
    expect(refinements).not.toMatch(/@keyframes|!important|\.rupture-nav|\.dither-study-scene|\.rupture-glass\s*\{/);
    expect(refinements).not.toMatch(/(?:^|[;{])\s*(?:animation|transition|filter|backdrop-filter|transform|touch-action)\s*:/);
  });
});
