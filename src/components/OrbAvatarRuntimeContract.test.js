import fs from "fs";
import path from "path";

const source = (name) =>
  fs
    .readFileSync(path.join(__dirname, name), "utf8")
    .replace(/\r\n/g, "\n");

const repositorySource = (relativePath) =>
  fs
    .readFileSync(path.join(process.cwd(), relativePath), "utf8")
    .replace(/\r\n/g, "\n");

describe("intrinsic Metabloom Orb runtime invariants", () => {
  const actions = source("metabloomActions.js");
  const avatar = source("MetabloomAvatar.js");
  const avatarCss = source("MetabloomAvatar.css");
  const fieldCanvas = source("CreatorOSFieldCanvas.js");
  const fieldShader = source("CreatorOSFieldShader.js");
  const orb = source("OrbSection.js");
  const orbCss = source("OrbSection.css");
  const standalone = source("StandaloneExperiencePage.js");

  test("the existing Metabloom field is the avatar instead of content inside a second blob", () => {
    expect(avatar).toContain(
      'import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";',
    );
    expect(avatar.match(/<CreatorOSFieldCanvas/g)).toHaveLength(1);
    expect(avatar).toContain("metabloomAvatarEnabled");
    expect(avatar).toContain('data-avatar-engine="intrinsic-shader"');
    [
      "metabloom-avatar__blob",
      "metabloom-avatar__motion",
      "metabloom-avatar__pose",
      "metabloom-avatar__colorwash",
      "metabloom-avatar__burst",
      "metabloom-avatar__fragment",
      "<svg",
    ].forEach((forbidden) => expect(avatar).not.toContain(forbidden));

    expect(avatarCss).not.toContain("overflow: hidden");
    expect(avatarCss).not.toContain("mix-blend-mode: color");
    expect(avatarCss).not.toContain("@keyframes metabloomAvatar");
    expect(avatarCss).not.toContain("metabloom-avatar__blob");
    expect(avatarCss).not.toContain("metabloom-avatar__fragment");
  });

  test("expression deforms the authored seven-body field before material resolution", () => {
    [
      "uniform float u_avatarEnabled",
      "uniform int u_avatarAction",
      "uniform float u_avatarPhase",
      "uniform float u_avatarIntensity",
      "uniform vec3 u_avatarColorA",
      "uniform vec3 u_avatarColorB",
      "uniform vec3 u_avatarColorC",
      "uniform float u_avatarTalking",
      "center *= avatarCenterScale",
      "center += radialDirection",
      "radius *= avatarRadiusScale",
      "p = rotate2(avatarRotation)",
    ].forEach((contract) => expect(fieldShader).toContain(contract));

    expect(fieldShader).toContain("for (int index = 0; index < 7; index++)");
    expect(fieldShader).toContain("float potential = 0.0");
    expect(fieldShader).toContain("vec4 sceneMetabloom(vec2 uv, float time)");
  });

  test("chameleon colour is resolved inside Metabloom and returns to native spectrum", () => {
    expect(fieldShader).toContain("vec3 avatarTint");
    expect(fieldShader).toContain("float avatarColorMix = avatarEnvelope");
    expect(fieldShader).toContain(
      "tint = mix(tint, avatarTint, sat(avatarColorMix))",
    );
    expect(fieldShader).toContain(
      "float avatarEnvelope = avatarEnabled * sin(PI * avatarPhase)",
    );
    expect(avatar).not.toContain("mixBlendMode");
    expect(avatarCss).not.toContain("colorwash");
  });

  test("the canvas owns the bounded action clock and uploads optional uniforms", () => {
    [
      "metabloomAvatarAction = 0",
      "metabloomAvatarEnabled = false",
      "metabloomAvatarVersion = 0",
      "metabloomAvatarRestartRef",
      "applyMetabloomAvatarRestart",
      '"u_avatarEnabled"',
      '"u_avatarAction"',
      '"u_avatarPhase"',
      '"u_avatarIntensity"',
      '"u_avatarColorA"',
      '"u_avatarColorB"',
      '"u_avatarColorC"',
      '"u_avatarTalking"',
      'nextState = "expressing"',
    ].forEach((contract) => expect(fieldCanvas).toContain(contract));

    expect(fieldCanvas).toContain(
      'data-metabloom-avatar={metabloomAvatarEnabled ? "true" : "false"}',
    );
  });

  test("the action table remains explicit, input-bounded, and agent-compatible", () => {
    [
      "reform",
      "agree",
      "disagree",
      "happy",
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ].forEach((action) => expect(actions).toContain(`id: "${action}"`));

    expect(actions).toContain('motion: "Shakes side to side"');
    expect(actions).toContain('motion: "Nods down and up twice"');
    expect(actions).toContain(
      'motion: "Compresses, explodes, and reforms"',
    );
    expect(orb).toContain("METABLOOM_ACTIONS.map((action) => (");
    expect(orb).toContain("<table>");
    expect(orb).toContain(".slice(0, 16)");
    expect(orb).toContain(
      "Math.max(160, Math.min(duration, 8000))",
    );

    [
      "__orbPop",
      "__orbExpress",
      "__orbTransform",
      "__orbReact",
      "__orbPlaySequence",
      "__orbStop",
      "__orbReset",
      "__orbActions",
      "__orbExpressions",
      "__orbForms",
      "__orbState",
      "__orbTalk",
      "__orbStopTalk",
    ].forEach((name) => expect(orb).toContain(name));
  });

  test("pause, reduced motion, and cleanup remain inside the shared renderer lifecycle", () => {
    expect(avatar).toContain("paused={!active}");
    expect(avatar).toContain("externalPulseVersion={pulseVersion}");
    expect(fieldCanvas).toContain("createDitherCanvasCadence({");
    expect(fieldCanvas).toContain('contextType: "webgl2"');
    expect(fieldCanvas).toContain(
      'document.addEventListener("visibilitychange"',
    );
    expect(fieldCanvas).toContain("gl.deleteBuffer(positionBuffer)");
    expect(fieldCanvas).toContain("gl.deleteProgram(displayProgram)");
    expect(fieldCanvas).toContain(
      'data-context-recovery="local"',
    );
    expect(fieldCanvas).toContain(
      "metabloomAvatarPhase = 0.5",
    );
  });

  test("the action table remains usable inside the fixed standalone route", () => {
    expect(orbCss).toContain("height: 100dvh");
    expect(orbCss).toContain("overflow: auto");
    expect(orbCss).toContain(".orb-avatar-lab__table-wrap");
    expect(orbCss).toContain("overflow-x: auto");
    expect(standalone).toContain(
      "const useDitherBackground =\n    !isOrbExperience",
    );
    expect(standalone).toContain("{!isOrbExperience && (");
  });

  test("the navigation retains its full target and smaller hover field", () => {
    const navigation = repositorySource("src/navigation-cohesion.css");
    expect(navigation).toContain("width: 44px !important;");
    expect(navigation).toContain("height: 44px !important;");
    expect(navigation).toContain(
      "radial-gradient(circle at center, var(--aetheris-state-layer) 0 15px, transparent 16px)",
    );
  });
});
