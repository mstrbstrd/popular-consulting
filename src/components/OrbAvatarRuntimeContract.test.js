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
  const livingPolish = source("LivingMetabloomPolish.css");
  const livingShader = source("LivingMetabloomShader.js");
  const orbPolish = source("OrbSectionPolish.css");
  const standalone = source("StandaloneExperiencePage.js");

  test("the field is the creature rather than a texture inside an avatar shell", () => {
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

  test("one bounded transparent draw owns the complete high-fidelity organism", () => {
    expect(livingCanvas).toContain("const RENDER_SCALE_BY_PROFILE");
    expect(livingCanvas).toContain("desktop: 0.9");
    expect(livingCanvas).toContain("mobile: 0.72");
    expect(livingCanvas).toContain("windows: 0.78");
    expect(livingCanvas).toContain("createDitherCanvasCadence({");
    expect(livingCanvas).toContain('rendererId: "living-metabloom"');
    expect(livingCanvas).toContain('contextType: "webgl2"');
    expect(livingCanvas.match(/gl\.drawArrays/g)).toHaveLength(1);
    expect(livingCanvas).toContain('data-context-recovery="local"');
    expect(livingCanvas).toContain('document.addEventListener("visibilitychange"');
    expect(livingCanvas).toContain('"(prefers-reduced-motion: reduce)"');
    expect(livingCanvas).toContain("gl.deleteBuffer(positionBuffer)");
    expect(livingCanvas).toContain("gl.deleteProgram(program)");

    expect(livingShader).toContain("float ellipseSdf(");
    expect(livingShader).toContain("float smin(");
    expect(livingShader).toContain("for(int i=0;i<7;i++)");
    expect(livingShader).toContain("if(shape>.14)");
    expect(livingShader).toContain("fragColor=vec4(0.0)");
    expect(livingShader).toContain("fragColor=vec4(color*alpha,alpha)");
    expect(livingShader).not.toContain("sampler2D");
    expect(livingShader).not.toContain("texture(");
    expect(livingPolish).toContain("image-rendering: auto");
  });

  test("the face is grown as material relief instead of painted over the body", () => {
    expect(livingShader).toContain("float eyeSocket");
    expect(livingShader).toContain("float mouthCavity");
    expect(livingShader).toContain("float browRidge");
    expect(livingShader).toContain("float surfaceHeight=innerDepth");
    expect(livingShader).toContain("-eyeSocket*.095");
    expect(livingShader).toContain("-mouthCavity*.105");
    expect(livingShader).toContain(
      "vec2 grad=vec2(dFdx(surfaceHeight),dFdy(surfaceHeight))",
    );
    expect(livingShader).toContain("vec3 normal=normalize(");
    expect(livingShader).not.toContain("faceVoid");
    expect(livingShader).not.toContain("alpha *= 1.0 - faceVoid");
  });

  test("emotion changes topology and color before the native spectrum returns", () => {
    expect(avatar).toContain("emotionVersion={emotionVersion}");
    expect(orb).toContain("const [emotionVersion, setEmotionVersion]");
    expect(orb).toContain("setEmotionVersion((value) => value + 1)");
    expect(livingCanvas).toContain(
      "const EMOTION_COLOR_DURATION_SECONDS = 6.4",
    );
    expect(livingCanvas).toContain("const applyPendingEmotionResponse = () => {");
    expect(livingCanvas).toContain("emotionAge = 0");
    expect(livingCanvas).toContain("gl.uniform1f(uniforms.u_emotionAge, emotionAge)");
    expect(livingCanvas).toContain('data-emotion-color-response="transient"');

    expect(livingShader).toContain("uniform float u_emotionAge");
    expect(livingShader).toContain("float happy=stateWeight(0");
    expect(livingShader).toContain("float excited=stateWeight(1");
    expect(livingShader).toContain("float sad=stateWeight(2");
    expect(livingShader).toContain("float surprised=stateWeight(3");
    expect(livingShader).toContain("float thinking=stateWeight(4");
    expect(livingShader).toContain("float sleepy=stateWeight(5");
    expect(livingShader).toContain("float angry=stateWeight(6");
    expect(livingShader).toContain("vec3 moodPrimary");
    expect(livingShader).toContain("vec3 moodSecondary");
    expect(livingShader).toContain("float emotionEnvelope=smoothstep(0.0,.20");
    expect(livingShader).toContain("1.0-smoothstep(2.1,6.4,u_emotionAge)");
  });

  test("gaze, touch, speech, pulse, and form changes deform the same organism", () => {
    expect(avatar).toContain("expression={normalizedExpression}");
    expect(avatar).toContain("form={normalizedForm}");
    expect(avatar).toContain("talking={talking}");

    expect(livingShader).toContain("uniform int u_expressionA");
    expect(livingShader).toContain("uniform int u_expressionB");
    expect(livingShader).toContain("uniform int u_formA");
    expect(livingShader).toContain("uniform int u_formB");
    expect(livingShader).toContain("uniform float u_talking");
    expect(livingShader).toContain("vec2 gaze=clamp(pointer*.18+idleGaze");
    expect(livingShader).toContain("float pointerPresence");
    expect(livingShader).toContain("float attention=sat(u_energy*pointerPresence)");
    expect(livingShader).toContain("shape=smin(shape,reach,.07+.08*attention)");
    expect(livingShader).toContain("float talkCycle");
    expect(livingShader).toContain("float heartbeat");
    expect(livingShader).toContain("vec3 color=mix(gel,metal,focus)");
  });

  test("every public pulse enters the existing resonance state", () => {
    const renderFrameStart = livingCanvas.indexOf("const renderFrame");
    const renderFramePulse = livingCanvas.indexOf(
      "applyPendingPulse();",
      renderFrameStart,
    );

    expect(orb).toContain("setPulseVersion((value) => value + 1)");
    expect(avatar).toContain("pulseVersion={pulseVersion}");
    expect(livingCanvas).toContain(
      "externalPulseRequestRef.current = normalizePulseVersion(pulseVersion)",
    );
    expect(livingCanvas).toContain("const applyPendingPulse = () => {");
    expect(livingCanvas).toContain("pulseOrigin.x = pointer.x");
    expect(livingCanvas).toContain("pulseOrigin.y = pointer.y");
    expect(livingCanvas).toContain("pulseAge = 0");
    expect(livingCanvas).toContain("energy = 1");
    expect(livingCanvas).toContain('reportState("resonance")');
    expect(renderFrameStart).toBeGreaterThan(-1);
    expect(renderFramePulse).toBeGreaterThan(renderFrameStart);
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
    expect(livingCanvas).toContain(
      'className="living-metabloom-canvas__fallback-emotion"',
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
      expect(livingPolish).toContain(
        `[data-fallback-expression="${expression}"]`,
      );
    });

    ["bloom", "focus", "drift"].forEach((form) => {
      expect(livingCss).toContain(`[data-avatar-form="${form}"]`);
    });

    expect(livingCss).toContain('[data-fallback-talking="true"]');
    expect(livingCss).toContain("@keyframes livingMetabloomFallbackPulse");
    expect(livingPolish).toContain(
      "@keyframes livingMetabloomFallbackEmotion",
    );
    expect(livingPolish).toContain(
      "@media (prefers-reduced-motion: reduce)",
    );
  });

  test("the agent-facing control surface is explicit and input-bounded", () => {
    [
      "__orbPop",
      "__orbExpress",
      "__orbTransform",
      "__orbReact",
      "__orbPlaySequence",
      "__orbStop",
      "__orbReset",
      "__orbExpressions",
      "__orbForms",
      "__orbState",
      "__orbTalk",
      "__orbStopTalk",
    ].forEach((name) => expect(orb).toContain(name));

    expect(orb).toContain('typeof request !== "object"');
    expect(orb).toContain("Array.isArray(request)");
    expect(orb).toContain("VALID_EXPRESSIONS.has(request.expression)");
    expect(orb).toContain("VALID_FORMS.has(request.form)");
    expect(orb).toContain(".slice(0, 16)");
    expect(orb).toContain("Math.max(160, Math.min(duration, 8000))");
    expect(orb).not.toContain("bhMounted");
    expect(orb).not.toContain("handleBHPop");
    expect(orb).not.toContain("spawnExplosion");
    expect(orb).not.toContain("stationary CD");
  });

  test("mobile controls form complete grids instead of clipping choices", () => {
    expect(orb).toContain("orb-avatar-lab__form-row");
    expect(orb).toContain("orb-avatar-lab__sequence-row");
    expect(orbPolish).toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))",
    );
    expect(orbPolish).toContain(
      "grid-template-columns: 0.72fr repeat(4, minmax(0, 1fr))",
    );
    expect(orbPolish).toContain("overflow: visible");
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

  test("the navigation retains its full hit target and smaller hover field", () => {
    const navigation = repositorySource("src/navigation-cohesion.css");
    expect(navigation).toContain("width: 44px !important;");
    expect(navigation).toContain("height: 44px !important;");
    expect(navigation).toContain(
      "radial-gradient(circle at center, var(--aetheris-state-layer) 0 15px, transparent 16px)",
    );
  });
});
