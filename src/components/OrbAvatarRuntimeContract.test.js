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

describe("intrinsic Metabloom chat runtime invariants", () => {
  const actions = source("metabloomActions.js");
  const responseContract = source("metabloomResponseContract.js");
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
      "uniform vec2 u_avatarOffset",
      "uniform vec2 u_avatarScale",
      "uniform float u_avatarRotation",
      "uniform float u_avatarCenterScale",
      "uniform float u_avatarRadiusScale",
      "uniform float u_avatarBurst",
      "uniform float u_avatarOrbit",
      "uniform float u_avatarTremble",
      "uniform float u_avatarExpression",
      "center *= avatarCenterScale",
      "center += radialDirection",
      "radius *= avatarRadiusScale",
      "p = rotate2(avatarRotation)",
    ].forEach((contract) => expect(fieldShader).toContain(contract));

    expect(fieldShader).toContain("for (int index = 0; index < 7; index++)");
    expect(fieldShader).toContain("float potential = 0.0");
    expect(fieldShader).toContain("vec4 sceneMetabloom(vec2 uv, float time)");
  });

  test("chameleon colour follows the continuous pose expression", () => {
    expect(fieldShader).toContain("vec3 avatarTint");
    expect(fieldShader).toContain("float avatarColorMix = avatarExpression");
    expect(fieldShader).toContain(
      "tint = mix(tint, avatarTint, sat(avatarColorMix))",
    );
    expect(fieldShader).toContain(
      "float avatarExpression = avatarEnabled * sat(u_avatarExpression)",
    );
    expect(fieldShader).not.toContain(
      "float avatarEnvelope = avatarEnabled * sin(PI * avatarPhase)",
    );
    expect(avatar).not.toContain("mixBlendMode");
    expect(avatarCss).not.toContain("colorwash");
  });

  test("the canvas owns a bounded pose-and-velocity transition runtime", () => {
    [
      "metabloomAvatarAction = 0",
      "metabloomAvatarEnabled = false",
      "metabloomAvatarVersion = 0",
      "metabloomAvatarRestartRef",
      "applyMetabloomAvatarRestart",
      "createMetabloomMotionRuntime",
      "metabloomMotionFrame",
      "dampMetabloomValue",
      "dampMetabloomVector",
      '"u_avatarEnabled"',
      '"u_avatarAction"',
      '"u_avatarPhase"',
      '"u_avatarIntensity"',
      '"u_avatarColorA"',
      '"u_avatarColorB"',
      '"u_avatarColorC"',
      '"u_avatarTalking"',
      '"u_avatarOffset"',
      '"u_avatarScale"',
      '"u_avatarRotation"',
      '"u_avatarCenterScale"',
      '"u_avatarRadiusScale"',
      '"u_avatarBurst"',
      '"u_avatarOrbit"',
      '"u_avatarTremble"',
      '"u_avatarExpression"',
      'nextState = "expressing"',
      "frameIntervalMs: resolveFrameIntervalMs",
    ].forEach((contract) => expect(fieldCanvas).toContain(contract));

    expect(fieldCanvas).toContain(
      'data-metabloom-avatar={metabloomAvatarEnabled ? "true" : "false"}',
    );
    expect(fieldCanvas).toContain(
      'data-metabloom-motion-runtime="pose-velocity-inertial"',
    );
  });

  test("model output is limited to response and actionChain before it reaches UI state", () => {
    expect(responseContract).toContain(
      'const TOP_LEVEL_KEYS = new Set(["response", "actionChain"]);',
    );
    expect(responseContract).toContain("additionalProperties: false");
    expect(responseContract).toContain('required: ["response", "actionChain"]');
    expect(responseContract).toContain("MAX_METABLOOM_RESPONSE_CHARS = 4000");
    expect(responseContract).toContain("MAX_METABLOOM_ACTION_STEPS = 12");
    expect(responseContract).toContain(
      "MAX_METABLOOM_CHAIN_DURATION_MS = 24000",
    );
    expect(responseContract).toContain(
      "export const parseMetabloomModelResponse",
    );
    expect(responseContract).toContain(
      'actionChain[actionChain.length - 1].action !== "reform"',
    );
    expect(orb).toContain("parseMetabloomModelResponse(payload)");
    expect(orb).not.toContain("dangerouslySetInnerHTML");
  });

  test("the action language remains explicit, input-bounded, and agent-compatible", () => {
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
    expect(orb).toContain("MAX_METABLOOM_ACTION_STEPS");
    expect(orb).toContain("MAX_METABLOOM_CHAIN_DURATION_MS");
    expect(orb).toContain("MAX_METABLOOM_ACTION_INTENSITY");
    expect(orb).toContain("actionDuration");
    expect(orb).toContain("actionIntensity");
    expect(orb).toContain("window.__metabloomTools");
    expect(orb).toContain("window.__metabloomToolSchemas");
    expect(orb).toContain('version: "1.0.0"');

    [
      "__metabloomTools",
      "__metabloomToolSchemas",
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
      "__orbRespond",
      "__orbResponseSchema",
      "__orbMessages",
    ].forEach((name) => expect(orb).toContain(name));
  });

  test("the Metabloom field fills the route while chat remains an overlay", () => {
    expect(orb).toContain('className="metabloom-chat__field"');
    expect(orb).toContain('className="metabloom-chat__interface"');
    expect(orb).toContain('role="log"');
    expect(orb).toContain("<textarea");
    expect(orb).toContain('data-response-contract="emote+response"');
    expect(orb).not.toContain("<table>");
    expect(orb).not.toContain("orb-avatar-lab__stage");
    expect(orb).not.toContain("Ready for model JSON");
    expect(orb).not.toContain("Model output:");
    expect(orb).not.toContain("metabloom-chat__action-chain");
    expect(orb).not.toContain("metabloom-chat__composer-note");

    expect(orbCss).toContain(".metabloom-chat {");
    expect(orbCss).toContain("position: fixed;");
    expect(orbCss).toContain("height: 100dvh;");
    expect(orbCss).toContain(".metabloom-chat__field");
    expect(orbCss).not.toContain("orb-avatar-lab__table-wrap");

    expect(avatarCss).toContain("inset: 0;");
    expect(avatarCss).toContain("width: 100%;");
    expect(avatarCss).toContain("height: 100%;");
    expect(avatarCss).not.toContain("aspect-ratio: 1");
    expect(avatarCss).not.toContain("56vw");

    expect(standalone).toContain(
      "const useDitherBackground =\n    !isOrbExperience",
    );
    expect(standalone).toContain("{!isOrbExperience && (");
  });

  test("the chat bridge supports direct, event-driven, and adapter-driven model responses", () => {
    expect(orb).toContain(
      'const MODEL_REQUEST_EVENT = "metabloom:user-message";',
    );
    expect(orb).toContain(
      'const MODEL_RESPONSE_EVENT = "metabloom:model-response";',
    );
    expect(orb).toContain("window.__metabloomRequest");
    expect(orb).toContain("new CustomEvent(MODEL_REQUEST_EVENT");
    expect(orb).toContain(
      "window.addEventListener(MODEL_RESPONSE_EVENT",
    );
    expect(orb).toContain("requestTokenRef.current === requestToken");
    expect(orb).toContain("MAX_CHAT_MESSAGES = 24");
    expect(orb).toContain("MAX_USER_MESSAGE_CHARS = 1600");
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
    expect(fieldCanvas).toContain('data-context-recovery="local"');
    expect(fieldCanvas).toContain("metabloomAvatarPhase = 0.5");
    expect(fieldCanvas).toContain("metabloomMotionRuntime.snap({");
    expect(fieldCanvas).toContain("metabloomMotionRuntime.reset()");
    expect(orb).toContain("window.clearTimeout(previewTimerRef.current)");
    expect(orb).toContain("mountedRef.current = false");
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
