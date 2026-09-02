import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import LivingMetabloomCanvas from "./LivingMetabloomCanvas";
import { LIVING_METABLOOM_FRAGMENT_SHADER } from "./LivingMetabloomShader";

describe("LivingMetabloomCanvas", () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test("degrades locally to the same living organism when WebGL2 is unavailable", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const { container, unmount } = render(
      <LivingMetabloomCanvas
        emotionVersion={3}
        expression="excited"
        form="bloom"
        onFieldStateChange={() => {}}
      />,
    );

    const shell = container.querySelector(".living-metabloom-canvas");
    await waitFor(() => expect(shell).toHaveClass("is-fallback"));
    expect(
      container.querySelector(".living-metabloom-canvas__fallback"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".living-metabloom-canvas__fallback-emotion"),
    ).toBeInTheDocument();
    expect(shell).toHaveAttribute("data-context-recovery", "local");
    expect(shell).toHaveAttribute("data-emotion-color-response", "transient");
    expect(() => unmount()).not.toThrow();
  });

  test("keeps one bounded draw with a profile-aware high-fidelity budget", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomCanvas.js"),
      "utf8",
    );
    const polish = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomPolish.css"),
      "utf8",
    );

    expect(source).toContain("const RENDER_SCALE_BY_PROFILE");
    expect(source).toContain("desktop: 0.9");
    expect(source).toContain("mobile: 0.72");
    expect(source).toContain("windows: 0.78");
    expect(source).toContain("getDitherCanvasFrameInterval(");
    expect(source).toContain("createDitherCanvasCadence({");
    expect(source).toContain('rendererId: "living-metabloom"');
    expect(source).toContain('contextType: "webgl2"');
    expect(source.match(/gl\.drawArrays/g)).toHaveLength(1);
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain('"(prefers-reduced-motion: reduce)"');
    expect(source).toContain('"webglcontextlost"');
    expect(source).toContain('"webglcontextrestored"');
    expect(source).toContain("gl.deleteBuffer(positionBuffer)");
    expect(source).toContain("gl.deleteProgram(program)");
    expect(polish).toContain("image-rendering: pixelated");
    expect(polish).toContain(
      ".living-metabloom-canvas.is-fallback .living-metabloom-canvas__surface",
    );
  });

  test("constructs a bounded asymmetric organism rather than a textured rectangle", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("float ellipseSdf(");
    expect(shader).toContain("float smin(");
    expect(shader).toContain("for(int i=0;i<7;i++)");
    expect(shader).toContain("shape=smin(shape,lobe,unionK)");
    expect(shader).toContain("if(shape>.14)");
    expect(shader).toContain("fragColor=vec4(0.0)");
    expect(shader).toContain("float pointerPresence");
    expect(shader).toContain("float attention=sat(u_energy*pointerPresence)");
    expect(shader).toContain("shape=smin(shape,reach,.07+.08*attention)");
    expect(shader).not.toContain("sampler2D");
    expect(shader).not.toContain("texture(");
  });

  test("grows the face as relief and cavities in the same material", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("float eyeSocket");
    expect(shader).toContain("float mouthCavity");
    expect(shader).toContain("float browRidge");
    expect(shader).toContain("float surfaceHeight=innerDepth");
    expect(shader).toContain("-eyeSocket*.078");
    expect(shader).toContain("+ocularDome*.052");
    expect(shader).toContain("-mouthCavity*.100");
    expect(shader).toContain("+lipRidge*.022");
    expect(shader).toContain(
      "vec2 grad=vec2(dFdx(surfaceHeight),dFdy(surfaceHeight))",
    );
    expect(shader).toContain("vec3 normal=normalize(");
    expect(shader).not.toContain("faceVoid");
    expect(shader).not.toContain("alpha *= 1.0 - faceVoid");
  });

  test("changes color with emotion and then resolves to the native spectrum", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.join(__dirname, "LivingMetabloomCanvas.js"),
      "utf8",
    );
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(source).toContain("const EMOTION_COLOR_DURATION_SECONDS = 6.4");
    expect(source).toContain("const expressionResponseRequestRef = useRef(0)");
    expect(source).toContain("const applyPendingEmotionResponse = () => {");
    expect(source).toContain("emotionAge = 0");
    expect(source).toContain("gl.uniform1f(uniforms.u_emotionAge, emotionAge)");
    expect(source).toContain('data-emotion-color-response="transient"');

    expect(shader).toContain("uniform float u_emotionAge");
    expect(shader).toContain("vec3 moodPrimary");
    expect(shader).toContain("vec3 moodSecondary");
    expect(shader).toContain("float emotionEnvelope=smoothstep(0.0,.20");
    expect(shader).toContain("1.0-smoothstep(2.1,6.4,u_emotionAge)");
    expect(shader).toContain(
      "vec3 materialTint=mix(baseTint,moodTint,emotionEnvelope*.78)",
    );
  });

  test("inherits Metabloom iridescence, fluid lighting, Metalbloom, and premultiplied output", () => {
    const shader = LIVING_METABLOOM_FRAGMENT_SHADER;

    expect(shader).toContain("#define bayer8");
    expect(shader).toContain("vec3(0.0,.933,1.0)");
    expect(shader).toContain("vec3(1,0,1)");
    expect(shader).toContain("vec3(1,.933,0)");
    expect(shader).toContain("vec3(.616,0,1)");
    expect(shader).toContain("float membrane");
    expect(shader).toContain("float cellular");
    expect(shader).toContain("float broadHighlight");
    expect(shader).toContain("float ocularDome");
    expect(shader).toContain("float secondaryEyeSpark");
    expect(shader).toContain("float permanentBlush");
    expect(shader).toContain("float orderedDither=bayer8");
    expect(shader).toContain("float colorLevels=18.0");
    expect(shader).toContain("mix(color,ditheredColor,.90)");
    expect(shader).toContain("float mirror=sat(");
    expect(shader).toContain("vec3 color=mix(gel,metal,focus)");
    expect(shader).toContain("fragColor=vec4(color*alpha,alpha)");
  });
});
