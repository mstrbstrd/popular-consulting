import fs from "fs";
import path from "path";
import { METABLOOM_NOVA_SHADER } from "./MetabloomNovaShader";
import { CREATOROS_FIELD_FRAGMENT_SHADER, CREATOROS_FIELD_PAINT_FRAGMENT_SHADER } from "./CreatorOSFieldShader";
import { METABLOOM_PALETTES } from "../contexts/MetabloomPaletteContext";

const prism = METABLOOM_NOVA_SHADER.split("vec4 novaPrismaticEdges")[1]?.split("vec4 novaMetalFinish")[0];

describe("MetalNova and prismatic Nova", () => {
  test("adds a distinct palette while retaining the authored flame balance", () => {
    expect(METABLOOM_PALETTES.METALNOVA).toBe("metalnova");
    expect(METABLOOM_NOVA_SHADER).toContain("const float NOVA_FIRE_BALANCE = 0.5;");
    const canvas = fs.readFileSync(path.join(__dirname, "CreatorOSFieldCanvas.js"), "utf8");
    expect(canvas).toContain('["metalbloom", "metalnova"].includes');
    expect(canvas).toContain('palette === "nova" || palette === "metalnova" ? 1 : 0');
  });
  test("restricts the rainbow to a narrow contour without changing alpha", () => {
    expect(prism).toContain("clamp(fwidth(fire.a) * 0.72, 0.010, 0.045)");
    expect(prism).toContain("abs(fire.a - 0.46)");
    expect(prism).toContain("mix(0.48, 0.42, u_light)");
    expect(prism).toContain("mix(0.70, 0.78, u_light)");
    expect(prism).toContain("fire.a);");
    expect(prism).not.toMatch(/fire\.a\s*[-+*/]?=|atan\(/);
  });
  test("reuses the native metal optics while preserving the fire silhouette", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("novaMetalFinish(novaMaterial, metalMaterial, spectralMaterial.a)");
    expect(METABLOOM_NOVA_SHADER).toContain("mix(metalMaterial.rgb, silverFlame, exterior)");
    expect(METABLOOM_NOVA_SHADER).toContain("mix(fire.rgb, metalColor, metalMix), fire.a");
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).not.toContain("novaPrismaticEdges");
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/sampler2D|requestAnimationFrame|setInterval/);
  });
});
