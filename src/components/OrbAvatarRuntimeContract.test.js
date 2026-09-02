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

describe("living Metabloom Orb runtime invariants", () => {
  const orb = source("OrbSection.js");
  const avatar = source("MetabloomAvatar.js");
  const avatarCss = source("MetabloomAvatar.css");
  const livingCanvas = source("LivingMetabloomCanvas.js");
  const livingCss = source("LivingMetabloomCanvas.css");
  const livingShader = source("LivingMetabloomShader.js");
  const standalone = source("StandaloneExperiencePage.js");

  test("the Metabloom field is the creature rather than a texture inside one", () => {
    expect(orb).toContain('import MetabloomAvatar from "./MetabloomAvatar";');
    expect(orb).toContain("<MetabloomAvatar");
    expect(orb).not.toContain("BlackHoleCanvas");
    expect(orb).not.toContain("<canvas");
    expect(orb).not.toContain("__ditherSetCD");
    expect(orb).not.toContain("__ditherSetOrb");

    expect(avatar.match(/<LivingMetabloomCanvas/g)).toHaveLength(1);
    expect(avatar).not.toContain("CreatorOSFieldCanvas");
    expect(avatar).not.toContain("<svg");
    expect(avatar).not.toContain("metabloom-avatar__body");
    expect(avatar).not.toContain("metabloom-avatar__material");
    expect(avatar).not.toContain("metabloom-avatar__face");
    expect(avatar).toContain('data-avatar-material="living-metabloom"');

    expect(avatarCss).not.toContain(".metabloom-avatar__body");
    expect(avatarCss).not.toContain(".metabloom-avatar__material");
    expect(avatarCss).not.toContain(".metabloom-avatar__face");
    expect(avatarCss).not.toContain(".metabloom-avatar__petals");
    expect(avatarCss).not.toContain(".metabloom-avatar__orbit");
  });

  test("one bounded transparent draw owns the complete living form", () => {
    expect(livingCanvas).toContain("const RENDER_SCALE = 0.5;");
    expect(livingCanvas).toContain("createDitherCanvasCadence({");
    expect(livingCanvas).toContain('rendererId: "living-metabloom"');
    expect(livingCanvas).toContain('contextType: "webgl2"');
    expect(livingCanvas.match(/gl\.drawArrays/g)).toHaveLength(1);
    expect(livingCanvas).toContain('data-context-recovery="local"');
    expect(livingCanvas).toContain('document.addEventListener("visibilitychange"');
    expect(livingCanvas).toContain('"(prefers-reduced-motion: reduce)"');
    expect(livingCanvas).toContain("gl.deleteBuffer(positionBuffer)");
    expect(livingCanvas).toContain("gl.deleteProgram(program)");

    expect(livingShader).toContain("void addMetaball(");
    expect(livingShader).toContain("for (int index = 0; index < 9; index++)");
    expect(livingShader).toContain("fragColor = vec4(color * alpha, alpha)");
    expect(livingShader).not.toContain("sampler2D");
    expect(livingShader).not.toContain("texture(");
  });

  test("emotion, gaze, speech, and transformation alter the field itself", () => {
    expect(avatar).toContain("expression={normalizedExpression}");
    expect(avatar).toContain("form={normalizedForm}");
    expect(avatar).toContain("talking={talking}");

    expect(livingShader).toContain("uniform int u_expressionA");
    expect(livingShader).toContain("uniform int u_expressionB");
    expect(livingShader).toContain("uniform int u_formA");
    expect(livingShader).toContain("uniform int u_formB");
    expect(livingShader).toContain("uniform float u_talking");
    expect(livingShader).toContain("float droop = sad");
    expect(livingShader).toContain("float tension = focus");
    expect(livingShader).toContain("vec2 gaze = clamp(pointer");
    expect(livingShader).toContain("float faceVoid");
    expect(livingShader).toContain("alpha *= 1.0 - faceVoid");
    expect(livingShader).toContain("float talkOpen = u_talking");
    expect(livingShader).toContain("float heartbeat");
  });

  test("every public pulse enters the creature's existing resonance state", () => {
    expect(orb).toContain("setPulseVersion((value) => value + 1);");
    expect(avatar).toContain("pulseVersion={pulseVersion}");
    expect(livingCanvas).toContain(
      "externalPulseRequestRef.current = normalizePulseVersion(pulseVersion)",
    );
    expect(livingCanvas).toContain("const applyPendingPulse = () => {");
    expect(livingCanvas).toContain("pulseOrigin.x = pointer.x;");
    expect(livingCanvas).toContain("pulseOrigin.y = pointer.y;");
    expect(livingCanvas).toContain("pulseAge = 0;");
    expect(livingCanvas).toContain("energy = 1;");
    expect(livingCanvas).toContain('reportState("resonance")');
    expect(livingCanvas.indexOf("applyPendingPulse();"))
      .toBeGreaterThan(livingCanvas.indexOf("const renderFrame"));
  });

  test("every degraded path uses the same complete fallback creature", () => {
    expect(avatar).toContain("enabled={hasHardwareWebGL}");
    expect(livingCanvas).toContain("enabled = true");
    expect(livingCanvas).toContain("if (!enabled) {");
    expect(livingCanvas).toContain(
      "data-fallback-expression={fallback ? normalizedExpression : undefined}",
    );
    expect(livingCanvas).toContain(
      "data-fallback-talking={fallback ? String(Boolean(talking)) : undefined}",
    );
    expect(livingCanvas).toContain("key={pulseVersion}");
    expect(livingCanvas).toContain(
      'className="living-metabloom-canvas__fallback-pulse"',
    );
    expect(
      livingCanvas.match(/className="living-metabloom-canvas__fallback-blob"/g),
    ).toHaveLength(5);

    [
      "happy",
      "excited",
      "sad",
      "surprised",
      "thinking",
      "sleepy",
      "angry",
    ].forEach((expression) => {
      expect(livingCss).toContain(
        `[data-fallback-expression="${expression}"]`,
      );
    });

    ["bloom", "focus", "drift"].forEach((form) => {
      expect(livingCss).toContain(`[data-avatar-form="${form}"]`);
    });

    expect(livingCss).toContain(
      '[data-fallback-talking="true"]',
    );
    expect(livingCss).toContain("@keyframes livingMetabloomFallbackPulse");
    expect(livingCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("the standalone Orb does not retain a full-screen WebGL background", () => {
    expect(standalone).toContain(
      "const useDitherBackground =\n    !isOrbExperience",
    );
    expect(standalone).toContain("{!isOrbExperience && (");
    expect(standalone).toContain(
      'className="standalone-experience__orb-ambient"',
    );
    expect(standalone).toContain(
      ".standalone-experience--orb .standalone-experience__glass",
    );
  });

  test("legacy public controls survive without legacy renderer modes", () => {
    [
      "__orbPop",
      "__orbExpress",
      "__orbPlaySequence",
      "__orbStop",
      "__orbReset",
      "__orbExpressions",
      "__orbTalk",
      "__orbStopTalk",
    ].forEach((name) => expect(orb).toContain(name));

    expect(orb).not.toContain("bhMounted");
    expect(orb).not.toContain("handleBHPop");
    expect(orb).not.toContain("spawnExplosion");
    expect(orb).not.toContain("stationary CD");
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
