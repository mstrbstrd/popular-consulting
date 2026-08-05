import React, { useEffect, useState } from "react";
import DitherBackground from "./DitherBackground";
import "./DitherCanvasPage.css";

const SCENES = [
  {
    name: "Rain Study",
    description: "Quiet circular weather moving across a nearly monochrome field.",
    section: 0,
    tone: "cool",
  },
  {
    name: "Distant Hills",
    description: "Layered wave motion that reads like a horizon without drawing one literally.",
    section: 1,
    tone: "mist",
  },
  {
    name: "Garden Geometry",
    description: "A restrained radial composition for meditative, architectural moments.",
    section: 2,
    tone: "green",
  },
  {
    name: "Ember Field",
    description: "Slow organic movement with warm light, useful behind intimate copy or calls to action.",
    section: 3,
    tone: "warm",
  },
  {
    name: "Signal Object",
    description: "A single dimensional form that can become a mascot, product, planet, or interface guide.",
    section: 4,
    tone: "night",
  },
];

const DitherCanvasPage = () => {
  const [sceneIndex, setSceneIndex] = useState(0);
  const scene = SCENES[sceneIndex];

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Dither Canvas | Popular Consulting";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const addRipple = (event) => {
    if (scene.section !== 0) return;
    window.__addDitherRipple?.(event.clientX, event.clientY);
  };

  return (
    <main className={`dither-canvas-page tone-${scene.tone}`} onPointerDown={addRipple}>
      <div className="dither-canvas-stage" aria-hidden="true">
        <DitherBackground activeSection={scene.section} isDark />
      </div>

      <div className="dither-canvas-vignette" aria-hidden="true" />

      <section className="dither-canvas-content" aria-labelledby="dither-canvas-title">
        <p className="dither-canvas-kicker">Shader studies</p>
        <h1 id="dither-canvas-title">A general-purpose dither canvas.</h1>
        <p className="dither-canvas-intro">
          The same shader language can suggest weather, terrain, light, material, motion, and character without becoming visually loud.
        </p>

        <div className="dither-canvas-scene-copy" aria-live="polite">
          <span>{String(sceneIndex + 1).padStart(2, "0")}</span>
          <div>
            <h2>{scene.name}</h2>
            <p>{scene.description}</p>
          </div>
        </div>

        <div className="dither-canvas-controls" aria-label="Shader scene presets">
          {SCENES.map((item, index) => (
            <button
              key={item.name}
              type="button"
              className={index === sceneIndex ? "is-active" : ""}
              onClick={(event) => {
                event.stopPropagation();
                setSceneIndex(index);
              }}
              aria-pressed={index === sceneIndex}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.name}
            </button>
          ))}
        </div>

        <p className="dither-canvas-note">
          Tap the Rain Study to place ripples. This page is intentionally not linked in site navigation.
        </p>
      </section>
    </main>
  );
};

export default DitherCanvasPage;
