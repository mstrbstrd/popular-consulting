const fs = require("fs");
const path = require("path");

const passSource = fs.readFileSync(
  path.join(__dirname, "OrbMetalbloomPass.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(__dirname, "../orb-metalbloom.css"),
  "utf8",
);
const indexSource = fs.readFileSync(
  path.join(__dirname, "../index.js"),
  "utf8",
);

describe("Orb Metalbloom material pass", () => {
  test("uses the live orb canvas as the only topology and behavior source", () => {
    expect(passSource).toContain("ORB_SOURCE_SELECTOR");
    expect(passSource).toContain("standalone-experience__dither > canvas:first-of-type");
    expect(passSource).toContain("uniform sampler2D u_source");
    expect(passSource).toContain("gl.texSubImage2D");
    expect(passSource).not.toContain("__orbExpress =");
    expect(passSource).not.toContain("__orbPop =");
  });

  test("builds a liquid mercury finish with restrained spectral reflections", () => {
    expect(passSource).toContain("vec2 metalSlope = vec2(");
    expect(passSource).toContain("vec3 metalNormal = normalize");
    expect(passSource).toContain("reflect(-viewDirection, metalNormal)");
    expect(passSource).toContain("float horizonStrip");
    expect(passSource).toContain("float innerReflectionBand");
    expect(passSource).toContain("float mirrorLevel = smoothstep(0.04, 0.92, mirrorRaw)");
    expect(passSource).toContain("float metalFresnel");
    expect(passSource).toContain("vec3 mercuryShadow = vec3(0.480, 0.505, 0.545)");
    expect(passSource).toContain("vec3 mercuryMid = vec3(0.655, 0.675, 0.710)");
    expect(passSource).toContain("vec3 mercuryHighlight = vec3(1.520, 1.560, 1.630)");
    expect(passSource).toContain("float reflectionPrismMask = sat(");
    expect(passSource).toContain("vec3 prismaticEdge");
  });

  test("fails closed and releases every GPU and observer resource", () => {
    expect(passSource).toContain("if (isMobileTier) return undefined");
    expect(passSource).toContain("sourceLayer.appendChild(outputCanvas)");
    expect(passSource).toContain("failIfMajorPerformanceCaveat: true");
    expect(passSource).toContain("document.visibilityState === \"hidden\"");
    expect(passSource).toContain("observer.disconnect()");
    expect(passSource).toContain("window.cancelAnimationFrame(animationFrame)");
    expect(passSource).toContain("gl.deleteTexture(sourceTexture)");
    expect(passSource).toContain("gl.deleteBuffer(positionBuffer)");
    expect(passSource).toContain("gl.deleteVertexArray(vertexArray)");
    expect(passSource).toContain("gl.deleteProgram(program)");
  });

  test("themes controls and fallbacks without removing touch or focus affordances", () => {
    expect(styles).toContain("#orb .orb-pill");
    expect(styles).toContain('[aria-label="Orb emotions"]');
    expect(styles).toContain("#orb button:focus-visible");
    expect(styles).toContain('div[style*="border-radius: 50%"]');
    expect(styles).toContain("@media (max-width: 760px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  test("mounts the pass once at the application root", () => {
    expect(indexSource).toContain("import './orb-metalbloom.css'");
    expect(indexSource).toContain("import OrbMetalbloomPass from './components/OrbMetalbloomPass'");
    expect(indexSource).toContain("<OrbMetalbloomPass />");
  });
});
