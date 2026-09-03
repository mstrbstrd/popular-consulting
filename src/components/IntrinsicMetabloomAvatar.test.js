import fs from "fs";
import path from "path";
import { CREATOROS_FIELD_FRAGMENT_SHADER } from "./CreatorOSFieldShader";

const avatarSource = fs.readFileSync(
  path.join(__dirname, "MetabloomAvatar.js"),
  "utf8",
);

const extractMetabloomScene = () => {
  const start = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sceneMetabloom(vec2 uv, float time)",
  );
  const end = CREATOROS_FIELD_FRAGMENT_SHADER.indexOf(
    "vec4 sceneTidalWeave(vec2 uv, float time)",
    start,
  );
  return CREATOROS_FIELD_FRAGMENT_SHADER.slice(start, end);
};

describe("intrinsic Metabloom avatar shader", () => {
  const scene = extractMetabloomScene();

  test("preserves the authored baseline equations", () => {
    [
      "uv = pointerFlow(uv, 0.075)",
      "p = viscousWarp(p, time, 0.08)",
      "for (int index = 0; index < 7; index++)",
      "float potential = 0.0",
      "float membrane = 0.5 + 0.5 * sin",
      "vec4 spectralMaterial = fluidMaterial",
    ].forEach((contract) => expect(scene).toContain(contract));
  });

  test("uses the existing centres and radii as expressive anatomy", () => {
    expect(scene).toContain("center *= avatarCenterScale");
    expect(scene).toContain("center += radialDirection");
    expect(scene).toContain("radius *= avatarRadiusScale");
    expect(scene).toContain("avatarBurst");
    expect(scene).toContain("avatarTremble");
    expect(scene).toContain("avatarOrbit");
  });

  test("keeps all persistent visual layers out of the React wrapper", () => {
    [
      "__blob",
      "__motion",
      "__pose",
      "__colorwash",
      "__burst",
      "__fragment",
    ].forEach((forbidden) => expect(avatarSource).not.toContain(forbidden));
  });
});
