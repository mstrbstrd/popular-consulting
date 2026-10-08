import fs from "fs";
import path from "path";
import { METABLOOM_NOVA_SHADER } from "./MetabloomNovaShader";
import { CREATOROS_FIELD_FRAGMENT_SHADER, CREATOROS_FIELD_PAINT_FRAGMENT_SHADER } from "./CreatorOSFieldShader";

const scene = CREATOROS_FIELD_FRAGMENT_SHADER.split("vec4 sceneMetabloom(vec2 uv, float time) {")[1].split("vec4 sceneTidalWeave")[0];
const prism = METABLOOM_NOVA_SHADER.split("vec4 novaPrismaticEdges")[1].split("vec4 novaMetalFinish")[0];

describe("Nova flame surface corrections", () => {
  test("lowers only fire avatars inside the existing canvas with matching fallback", () => {
    expect(METABLOOM_NOVA_SHADER).toContain("const float NOVA_VERTICAL_OFFSET = 0.10;");
    expect(scene).toContain("NOVA_VERTICAL_OFFSET * step(0.5, u_avatarEnabled)");
    expect(scene).toContain("smoothstep(0.0, 1.0, sat(u_metabloomNovaMix))");
    expect(scene).toContain("uv.y += novaPlacementY");
    expect(scene).toContain("pulseField(uv - vec2(0.0, novaPlacementY))");
    expect(CREATOROS_FIELD_PAINT_FRAGMENT_SHADER).not.toContain("novaPlacementY");
    const css = fs.readFileSync(path.join(__dirname, "MetabloomAvatar.css"), "utf8");
    expect(css).toContain('data-avatar-finish="metalnova"');
    expect(css).toContain('data-avatar-theme="metabloom"');
    expect(css).toContain("translateY(10%) var(--avatar-fallback-transform, none)");
  });
  test("shares dark flame roots and measures brightness outward rather than by opacity", () => {
    expect(METABLOOM_NOVA_SHADER).toContain("rootDistance / max(rootDistance + tipDistance, 0.0001)");
    expect(METABLOOM_NOVA_SHADER).toContain("color = mix(rootColor, color, smoothstep(0.90, 1.75, materialField))");
    expect(METABLOOM_NOVA_SHADER).toContain("mix(rootHeat, 0.92, flameProgress)");
    expect(METABLOOM_NOVA_SHADER).toContain("flameSurface = vec4(flameProgress, flame, ember, materialField)");
    expect(METABLOOM_NOVA_SHADER).toContain("float heat = flameSurface.x");
    expect(METABLOOM_NOVA_SHADER).not.toContain("dot(fire.rgb");
  });
  test("continues rainbow colour through fading wisps, not a ring or added opacity", () => {
    expect(prism).toContain("1.0 - smoothstep(0.72, 1.20, flameSurface.w)");
    expect(prism).toContain("liftedSignal - flameSurface.w");
    expect(prism).toContain("float wisps = 1.0 - smoothstep(0.78, 0.91, liftedSignal)");
    expect(prism).toContain("max(outline, wisps)");
    expect(prism).not.toMatch(/abs\(fire\.a|fire\.a\s*[-+*/]?=/);
  });
});
