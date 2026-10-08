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
  test("restricts the rainbow to exposed flame tips and wisps without changing alpha", () => {
    expect(prism).toContain("clamp(fwidth(liftedSignal) * 0.72, 0.010, 0.045)");
    expect(prism).toContain("abs(liftedSignal - 0.90)");
    expect(prism).toContain("exposedFlame * distalFlame * max(outline, wisps)");
    expect(prism).toContain("mix(0.48, 0.42, u_light)");
    expect(prism).toContain("mix(0.70, 0.78, u_light)");
    expect(prism).toContain("fire.a);");
    expect(prism).not.toMatch(/fire\.a\s*[-+*/]?=|atan\(|fwidth\(fire\.a\)/);
  });
  test("reuses the native metal optics without its all-around rainbow rim", () => {
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("novaMetalFinish(novaMaterial, novaMetalCore, spectralMaterial.a, novaFlameSurface)");
    expect(CREATOROS_FIELD_FRAGMENT_SHADER).toContain("vec4 novaMetalCore = metalMaterial;");
    expect(METABLOOM_NOVA_SHADER).toContain("float heat = flameSurface.x;");
    expect(METABLOOM_NOVA_SHADER).toContain("mix(fire.rgb, metalColor, metalMix), fire.a");
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).not.toContain("novaPrismaticEdges");
    expect(METABLOOM_NOVA_SHADER).not.toMatch(/sampler2D|requestAnimationFrame|setInterval/);
  });
});
