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
    "%s has a high-contrast opaque keyline color pair", (token) => {
      // This tests authored ink/keyline colors, not every anti-aliased glyph
      // or moving field pixel. A color-pair pass is not a full WCAG audit.
      const ratio = (luminance(ink("--study-copy-keyline")) + 0.05)
        / (luminance(ink(token)) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(7);
    },
  );

  test("does not paint a wash, panel, mask, blur, or compositing layer", () => {
    const declarations = refinements.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toContain("--study-copy-wash");
    expect(declarations).not.toMatch(/::before|::after/);
    expect(declarations).not.toMatch(/(?:^|[;{])\s*(?:background[\w-]*|box-shadow|(?:-webkit-)?mask[\w-]*|filter|(?:-webkit-)?backdrop-filter|mix-blend-mode|isolation|position|z-index|content|pointer-events)\s*:/);
  });

  test("uses a glyph-only edge without filling over the letterforms", () => {
    expect(refinements).toContain("@supports (-webkit-text-stroke: 2px white) and (paint-order: stroke fill)");
    expect(refinements).toContain("-webkit-text-stroke: 2px var(--study-copy-keyline)");
    expect(refinements).toContain("paint-order: stroke fill");
    // All eight fallback shadows are opaque and have a zero blur radius.
    const fallback = refinements.match(/text-shadow:\s*([^;]+);/)[1];
    const shadows = fallback.split(",");
    expect(shadows).toHaveLength(8);
    shadows.forEach((shadow) => {
      expect(shadow.trim()).toMatch(/^(?:0|-?(?:1|0\.7)px) (?:0|-?(?:1|0\.7)px) 0 var\(--study-copy-keyline\)$/);
    });
  });

  test("contrast stays in light-mode supporting copy and respects user colors", () => {
    const colorRules = [...refinements.matchAll(/([^{}]+)\{[^{}]*(?:color|text-shadow|text-stroke):[^{}]*\}/g)];
    colorRules.forEach((rule) => {
      expect(rule[1]).toContain('.dither-canvas-page[data-theme-mode="light"] .rupture-copy');
    });
    expect(refinements).toContain("prefers-contrast: more");
    expect(refinements).toContain("forced-colors: active");
    expect(refinements).toContain("::selection");
    expect(refinements).toContain("color: CanvasText");
    expect(refinements).toContain("-webkit-text-stroke-width: 0");
    expect(refinements).not.toMatch(/@keyframes|!important|\.rupture-nav|\.dither-study-scene|\.rupture-glass\s*\{/);
    expect(refinements).not.toMatch(/(?:^|[;{])\s*(?:animation|transition|transform|touch-action)\s*:/);
  });
});
