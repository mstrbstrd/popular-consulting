import fs from "fs";
import path from "path";

const readRepositoryFile = (relativePath) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("ProfessionalHero Aetheris styling", () => {
  const css = readRepositoryFile("public/engineering-card.css");
  const routeGenerator = readRepositoryFile("scripts/generate-route-html.mjs");

  test("uses the Technical-Humanist pair and structural spectral material", () => {
    expect(css).toContain('font-family: "Hanken Grotesk"');
    expect(css).toContain('font-family: "JetBrains Mono"');
    expect(css).toContain("--professional-hero-spectral:");
    expect(css).toContain("--professional-hero-glass-specular:");
    expect(css).toContain("mask-composite: exclude");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("does not regress to filled gradient text or the previous purple treatment", () => {
    expect(css).not.toContain("background-clip: text");
    expect(css).not.toContain("-webkit-background-clip: text");
    expect(css).not.toContain("#6344f5");
    expect(css).not.toContain("Helvetica Neue");
  });

  test("loads card assets only through generated engineering route HTML", () => {
    expect(routeGenerator).toContain("ENGINEERING_FONTS_HREF");
    expect(routeGenerator).toContain("ENGINEERING_CARD_LINK");
    expect(routeGenerator).toContain('/engineering-card.css?v=20260730a');
    expect(routeGenerator).toContain('if (routeKey === "engineering")');
  });
});
