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

describe("faceless Metabloom Orb runtime invariants", () => {
  const actions = source("metabloomActions.js");
  const avatar = source("MetabloomAvatar.js");
  const avatarCss = source("MetabloomAvatar.css");
  const fieldCanvas = source("CreatorOSFieldCanvas.js");
  const fieldShader = source("CreatorOSFieldShader.js");
  const orb = source("OrbSection.js");
  const orbCss = source("OrbSection.css");
  const standalone = source("StandaloneExperiencePage.js");

  test("the exact CreatorOS Metabloom study is the only rendered body", () => {
    expect(avatar).toContain('import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";');
    expect(avatar.match(/<CreatorOSFieldCanvas/g)).toHaveLength(1);
    expect(avatar).toContain('metabloomPalette="spectral"');
    expect(avatar).toContain("mode={0}");
    expect(avatar).toContain('data-avatar-material="creatoros-metabloom"');
    expect(avatar).toContain('data-avatar-faceless="true"');
    expect(avatar).not.toContain("LivingMetabloomCanvas");
    expect(avatar).not.toContain("LivingMetabloomShader");
    expect(orb).not.toContain("<canvas");
    expect(orb).not.toContain("BlackHoleCanvas");

    expect(fieldCanvas).toContain('"sceneMetabloom"');
    expect(fieldShader).toContain("vec4 sceneMetabloom(vec2 uv, float time)");
  });

  test("expression is outside the shader and never adds a face", () => {
    expect(avatar).not.toContain("<svg");
    expect(avatar).not.toContain("metabloom-avatar__eye");
    expect(avatar).not.toContain("metabloom-avatar__mouth");
    expect(avatar).not.toContain("metabloom-avatar__face");
    expect(avatarCss).not.toContain("__eye");
    expect(avatarCss).not.toContain("__mouth");
    expect(avatarCss).not.toContain("__face");
    expect(avatarCss).toContain("overflow: hidden");
    expect(avatarCss).toContain("metabloomAvatarMorph");
    expect(avatarCss).toContain("mix-blend-mode: color");
  });

  test("the action table binds intent, motion, color, and bounded duration", () => {
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
    expect(actions).toContain('motion: "Compresses, explodes, and reforms"');
    expect(actions).toContain('colorway: "Magenta warning"');
    expect(actions).toContain('colorway: "Electric bloom"');
    expect(actions).toContain("duration:");
    expect(orb).toContain("METABLOOM_ACTIONS.map((action) => (");
    expect(orb).toContain("<table>");
    expect(orb).toContain("action.motion");
    expect(orb).toContain("action.colorway");
    expect(orb).toContain("action.intent");
  });

  test("whole-body gestures include nod, shake, burst, reform, and quiet states", () => {
    [
      "metabloomAvatarReform",
      "metabloomAvatarAgree",
      "metabloomAvatarDisagree",
      "metabloomAvatarHappy",
      "metabloomAvatarExcited",
      "metabloomAvatarSad",
      "metabloomAvatarSurprised",
      "metabloomAvatarThinking",
      "metabloomAvatarSleepy",
      "metabloomAvatarAngry",
      "metabloomAvatarBurstRing",
    ].forEach((animation) => expect(avatarCss).toContain(animation));

    expect(avatar).toContain("actionTimerRef");
    expect(avatar).toContain("window.clearTimeout(actionTimerRef.current)");
    expect(avatar).toContain("normalizedAction.duration");
    expect(avatarCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(avatarCss).toContain("animation: none !important");
  });

  test("pause, hidden route state, and pulse stay within the shared renderer lifecycle", () => {
    expect(avatar).toContain("paused={!active}");
    expect(avatar).toContain("externalPulseVersion={pulseVersion}");
    expect(fieldCanvas).toContain("createDitherCanvasCadence({");
    expect(fieldCanvas).toContain('contextType: "webgl2"');
    expect(fieldCanvas).toContain('document.addEventListener("visibilitychange"');
    expect(fieldCanvas).toContain("gl.deleteBuffer(positionBuffer)");
    expect(fieldCanvas).toContain("gl.deleteProgram(displayProgram)");
    expect(fieldCanvas).toContain('data-context-recovery="local"');
  });

  test("the public control surface is compatible, explicit, and input-bounded", () => {
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

    expect(orb).toContain('typeof request !== "object"');
    expect(orb).toContain("Array.isArray(request)");
    expect(orb).toContain("resolveMetabloomAction(");
    expect(orb).toContain(".slice(0, 16)");
    expect(orb).toContain("Math.max(160, Math.min(duration, 8000))");
    expect(orb).not.toContain("spawnExplosion");
    expect(orb).not.toContain("bhMounted");
  });

  test("the action table remains usable inside the fixed standalone route", () => {
    expect(orbCss).toContain("height: 100dvh");
    expect(orbCss).toContain("overflow: auto");
    expect(orbCss).toContain(".orb-avatar-lab__table-wrap");
    expect(orbCss).toContain("overflow-x: auto");
    expect(standalone).toContain("const useDitherBackground =\n    !isOrbExperience");
    expect(standalone).toContain("{!isOrbExperience && (");
  });

  test("the navigation retains its full hit target and smaller hover field", () => {
    const navigation = repositorySource("src/navigation-cohesion.css");
    expect(navigation).toContain("width: 44px !important;");
    expect(navigation).toContain("height: 44px !important;");
    expect(navigation).toContain(
      "radial-gradient(circle at center, var(--aetheris-state-layer) 0 15px, transparent 16px)",
    );
  });
});
