import fs from "fs";
import path from "path";

const background = fs.readFileSync(path.join(__dirname, "ImmersiveBackground.js"), "utf8");
const mobileRule = background.match(/@media \(max-width: 768px\)\s*\{\s*\[data-theme="dark"\] \.fixed-background\.immersive-background\s*\{([^}]+)\}/)?.[1];

describe("mobile black-hole alignment", () => {
  test("centres only the mobile dark backing surface on the unchanged hero anchor", () => {
    expect(mobileRule).toBeDefined();
    expect(mobileRule).toContain("top: 50%;");
    expect(mobileRule).toContain("transform: translateY(-50%);");
    const hero = fs.readFileSync(path.join(__dirname, "HeroLogo.js"), "utf8");
    expect(hero).toMatch(/top:\s*'50%'/);
    expect(hero).toMatch(/left:\s*'50%'/);
  });

  test("cannot shrink the scene, resize its stable buffer, or animate layout", () => {
    expect(mobileRule).not.toMatch(/scale\(|width:|height:|transition:|animation:/);
    expect(background).toContain("height: 100lvh;");
    expect(background).toContain("bottom: auto;");
  });
});
