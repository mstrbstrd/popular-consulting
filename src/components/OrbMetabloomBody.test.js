const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "OrbMetabloomBody.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(__dirname, "..", "orb-metabloom-body.css"),
  "utf8",
);

describe("Orb Metabloom physiology", () => {
  test("generates Metabloom topology instead of post-processing the dither framebuffer", () => {
    expect(source).toContain("float metabloomPotential(vec2 p, float time)");
    expect(source).toContain("for (int index = 0; index < 7; index++)");
    expect(source).toContain("float bodyField(vec2 p, float time)");
    expect(source).toContain("float membrane = smoothstep(0.36, 2.65, potential)");
    expect(source).toContain("vec2 bodyGradient(vec2 p, float time)");
    expect(source).not.toContain("sampler2D u_source");
    expect(source).not.toContain("texture(u_source");
    expect(source).not.toContain("sourceChroma");
  });

  test("binds emotional state into body topology and face motion", () => {
    expect(source).toContain("if (u_expressionId == 2) center *=");
    expect(source).toContain("if (u_expressionId == 3) center.y -=");
    expect(source).toContain("if (u_expressionId == 7) center.x *= 0.72");
    expect(source).toContain("if (u_expressionId == 8)");
    expect(source).toContain("mouthWave");
    expect(source).toContain("float faceMask(vec2 p, float time)");
    expect(source).toContain("u_mouthOpen");
  });

  test("keeps the existing orb command contract authoritative", () => {
    [
      "__orbExpress",
      "__orbTalk",
      "__orbStopTalk",
      "__orbStop",
      "__orbReset",
      "__orbPlaySequence",
      "__orbPop",
      "__ditherSetOrb",
      "__ditherSetCD",
    ].forEach((globalName) => {
      expect(source).toContain(`wrapGlobal(\"${globalName}\"`);
    });
    expect(source).toContain("return original(...args)");
    expect(source).toContain("if (window[name] === wrapped) window[name] = original");
  });

  test("hands visual authority back to CD and black-hole modes", () => {
    expect(source).toContain("stateRef.current.bodyTarget = 0");
    expect(source).toContain('sourceCanvas.style.opacity = "1"');
    expect(source).toContain("Boolean(window.__bhModeActive)");
    expect(source).toContain("const target = bhActive ? 0 : state.bodyTarget");
  });

  test("uses Metalbloom material language on generated geometry", () => {
    expect(source).toContain("vec3 fieldNormal = normalize");
    expect(source).toContain("reflect(-view, normal)");
    expect(source).toContain("float fresnel");
    expect(source).toContain("vec3 mercuryShadow");
    expect(source).toContain("vec3 mercuryHighlight");
    expect(source).toContain("vec3 spectrum = spectral(hue)");
    expect(source).toContain("membraneEdge");
  });

  test("keeps the new body non-interactive and preserves mobile/reduced-motion fallbacks", () => {
    expect(styles).toContain(".orb-metabloom-body");
    expect(styles).toContain("pointer-events: none");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("document.hidden");
    expect(source).toContain("1000 / 15");
    expect(source).toContain("1000 / 45");
  });
});
