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

describe("Metabloom Orb runtime invariants", () => {
  const orb = source("OrbSection.js");
  const avatar = source("MetabloomAvatar.js");
  const field = source("CreatorOSFieldCanvas.js");
  const standalone = source("StandaloneExperiencePage.js");

  test("the Orb owns one localized Dither Field Lab renderer", () => {
    expect(orb).toContain('import MetabloomAvatar from "./MetabloomAvatar";');
    expect(orb).toContain("<MetabloomAvatar");
    expect(orb).not.toContain("BlackHoleCanvas");
    expect(orb).not.toContain("<canvas");
    expect(orb).not.toContain("__ditherSetCD");
    expect(orb).not.toContain("__ditherSetOrb");
    expect(orb).not.toContain("Math.random");

    expect(avatar.match(/<CreatorOSFieldCanvas/g)).toHaveLength(1);
    expect(avatar).toContain("mode={0}");
    expect(avatar).toContain('metabloomPalette={materialPalette}');
    expect(avatar).toContain("externalPulseVersion={pulseVersion}");
    expect(avatar).toContain("paused={!isActive || paused}");
    expect(field).toContain("const RENDER_SCALE = 0.5;");
    expect(field).toContain("externalPulseVersion = 0");
    expect(field).toContain("createDitherCanvasCadence({");
    expect(field).toContain('data-context-recovery="local"');
  });

  test("every public pulse mutates the existing Metabloom resonance state", () => {
    expect(orb).toContain("setPulseVersion((value) => value + 1);");
    expect(avatar).toContain("externalPulseVersion={pulseVersion}");
    expect(field).toContain(
      "triggerExternalPulseRef.current = triggerExternalPulse",
    );
    expect(field).toContain("pulseOrigin.x = pointer.x;");
    expect(field).toContain("pulseOrigin.y = pointer.y;");
    expect(field).toContain("pulseAge = 0;");
    expect(field).toContain("energy = 1;");
    expect(field).toContain('reportState("resonance")');
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

  test("moods and forms change uniforms or lightweight presentation, not renderer count", () => {
    expect(orb).toContain("const EMOTIONS = Object.freeze([");
    expect(orb).toContain("const FORMS = Object.freeze([");
    expect(orb).toContain("const SEQUENCES = Object.freeze([");
    expect(avatar).toContain(
      'const materialPalette = normalizedForm === "focus" ? "metalbloom" : "spectral";',
    );
    expect(avatar).toContain("data-avatar-expression={normalizedExpression}");
    expect(avatar).toContain("data-avatar-form={normalizedForm}");
  });

  test("legacy public controls are preserved but legacy renderer modes are not", () => {
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

  test("the navigation keeps a full hit target with a smaller visual hover field", () => {
    const navigation = repositorySource("src/navigation-cohesion.css");
    expect(navigation).toContain("width: 44px !important;");
    expect(navigation).toContain("height: 44px !important;");
    expect(navigation).toContain(
      "radial-gradient(circle at center, var(--aetheris-state-layer) 0 15px, transparent 16px)",
    );
  });
});
