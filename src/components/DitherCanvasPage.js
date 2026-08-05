import React, { useCallback, useEffect, useRef, useState } from "react";
import DitherWorldCanvas from "./DitherWorldCanvas";
import "./DitherCanvasPage.css";

const SCENES = Object.freeze([
  {
    id: "alpine",
    category: "Landscape",
    name: "Alpine Dawn",
    description:
      "A layered mountain basin with snow catches, tree lines, birds, moving cloud strata, valley fog, and a sunrise that drifts with your position.",
    useCase: "Hero imagery, chapter openings, destination brands, and place-led storytelling.",
    interaction: "Move to shift the horizon. Tap to send first light through the valley.",
  },
  {
    id: "moonwater",
    category: "Atmosphere",
    name: "Moonwater",
    description:
      "Moonlight fractures across deep water while stars, shoreline silhouettes, suspended mist, and layered wave bands create genuine depth.",
    useCase: "Music, editorial stories, cinematic product states, and reflective interludes.",
    interaction: "Tap the water to send rings through the reflected moon.",
  },
  {
    id: "desert",
    category: "Terrain",
    name: "Desert Wind",
    description:
      "Sculpted dune faces, wind-carved ridges, dust veils, heat shimmer, and a distant sun build a dry landscape from luminous type.",
    useCase: "Campaign transitions, fashion, hospitality, and calm calls to action.",
    interaction: "Move across the field. Tap to release a travelling gust.",
  },
  {
    id: "gate",
    category: "Architecture",
    name: "Luminous Gate",
    description:
      "An impossible monolith stands inside reflected fog, with engraved seams, interior depth, orbiting particles, and light spilling across the floor.",
    useCase: "Product launches, future-facing brands, onboarding, and threshold moments.",
    interaction: "Tap the gate to charge its inner geometry.",
  },
  {
    id: "bloom",
    category: "Living form",
    name: "Night Bloom",
    description:
      "A responsive botanical organism opens in darkness, revealing veins, pollen motes, nested petals, bioluminescent edges, and a living core.",
    useCase: "Identity systems, creative tools, wellness, and expressive loading states.",
    interaction: "Move to guide the bloom. Tap to make it unfurl.",
  },
  {
    id: "topography",
    category: "Data landscape",
    name: "Living Topography",
    description:
      "Contour lines behave like a breathing terrain map, with elevation wells, survey markers, shifting pressure, and a luminous route finding its way through.",
    useCase: "Data storytelling, logistics, civic systems, maps, and operational dashboards.",
    interaction: "Move to bend elevation. Tap to establish a new destination.",
  },
  {
    id: "cathedral",
    category: "Spatial light",
    name: "Glass Cathedral",
    description:
      "Vaults, columns, rose-window geometry, suspended dust, and refracted bands of light form a sacred interior without using a single texture.",
    useCase: "Luxury, cultural institutions, editorial features, and immersive brand moments.",
    interaction: "Move the light source. Tap to ring the architecture.",
  },
  {
    id: "signal",
    category: "Information",
    name: "Signal Garden",
    description:
      "Packets become fireflies, branching paths become stems, and live pulses travel through a dark network that feels grown rather than engineered.",
    useCase: "AI systems, network health, infrastructure, and ambient status displays.",
    interaction: "Move to attract signals. Tap to inject a pulse.",
  },
  {
    id: "eclipse",
    category: "Celestial",
    name: "Event Horizon",
    description:
      "A gravitational lens bends a star field around a dark centre while accretion light, orbital debris, and time-like ripples distort the dither grid.",
    useCase: "Research, deep-tech, keynote openings, and high-concept product reveals.",
    interaction: "Move to alter the lens. Tap to disturb the orbit.",
  },
  {
    id: "city",
    category: "Urban system",
    name: "Rain City",
    description:
      "A nocturnal skyline reflects into wet streets while window rhythms, passing lights, rain curtains, steam, and distant transit animate the scene.",
    useCase: "Architecture, mobility, nightlife, real estate, and narrative interfaces.",
    interaction: "Move through the street. Tap to send a light across the city.",
  },
]);

const wrapSceneIndex = (index) => (index + SCENES.length) % SCENES.length;

const DitherCanvasPage = () => {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touring, setTouring] = useState(true);
  const [interfaceVisible, setInterfaceVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() =>
    Boolean(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
    ),
  );
  const touchStartRef = useRef({ x: 0, y: 0 });
  const scene = SCENES[sceneIndex];

  const selectScene = useCallback((index, stopTour = true) => {
    setSceneIndex(wrapSceneIndex(index));
    if (stopTour) setTouring(false);
  }, []);

  const showPreviousScene = useCallback(() => {
    setSceneIndex((current) => wrapSceneIndex(current - 1));
    setTouring(false);
  }, []);

  const showNextScene = useCallback(() => {
    setSceneIndex((current) => wrapSceneIndex(current + 1));
    setTouring(false);
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Dither Worlds | Popular Consulting";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const handleChange = (event) => setReducedMotion(event.matches);
    mediaQuery.addEventListener?.("change", handleChange);
    return () => mediaQuery.removeEventListener?.("change", handleChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = document.activeElement?.tagName?.toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        showNextScene();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        showPreviousScene();
      } else if (event.key === " ") {
        event.preventDefault();
        setPaused((current) => !current);
      } else if (event.key.toLowerCase() === "a") {
        setTouring((current) => !current);
      } else if (event.key.toLowerCase() === "h") {
        setInterfaceVisible((current) => !current);
      } else if (event.key === "Escape") {
        setInterfaceVisible(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNextScene, showPreviousScene]);

  useEffect(() => {
    if (!touring || paused || reducedMotion) return undefined;
    const timer = window.setInterval(() => {
      setSceneIndex((current) => wrapSceneIndex(current + 1));
    }, 16000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, touring]);

  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    if (deltaX < 0) showNextScene();
    else showPreviousScene();
  };

  return (
    <main
      className={`dither-canvas-page scene-${scene.id}${interfaceVisible ? "" : " is-immersive"}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-label="Dither Worlds generative art studies"
    >
      <div className="dither-canvas-render-stack" aria-hidden="true">
        <div className="dither-canvas-blur-layer">
          <DitherWorldCanvas sceneIndex={sceneIndex} paused={paused} passive />
        </div>
        <div className="dither-canvas-crisp-layer">
          <DitherWorldCanvas sceneIndex={sceneIndex} paused={paused} />
        </div>
      </div>
      <div className="dither-canvas-atmosphere" aria-hidden="true" />
      <div className="dither-canvas-glass" aria-hidden="true" />
      <div className="dither-canvas-frame" aria-hidden="true" />

      <header className="dither-canvas-header dither-canvas-chrome">
        <a className="dither-canvas-brand" href="/">
          <span className="dither-canvas-brand-mark" aria-hidden="true" />
          <span>Popular Consulting</span>
        </a>
        <div className="dither-canvas-series" aria-label="Experience title">
          <span>Generative systems</span>
          <strong>Dither Worlds</strong>
        </div>
        <div className="dither-canvas-actions" aria-label="Canvas controls">
          <button type="button" onClick={() => setTouring((current) => !current)} aria-pressed={touring}>
            {touring ? "Auto on" : "Auto off"}
          </button>
          <button type="button" onClick={() => setPaused((current) => !current)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => setInterfaceVisible(false)}>Hide UI</button>
        </div>
      </header>

      <section className="dither-canvas-scene-copy dither-canvas-chrome" aria-labelledby="dither-world-title">
        <p className="dither-canvas-eyebrow">
          <span>{String(sceneIndex + 1).padStart(2, "0")}</span>
          {scene.category}
        </p>
        <h1 id="dither-world-title">{scene.name}</h1>
        <p className="dither-canvas-description">{scene.description}</p>
        <p className="dither-canvas-use-case"><span>Use case</span>{scene.useCase}</p>
      </section>

      <nav
        className="dither-canvas-navigation dither-canvas-chrome"
        aria-label="Dither worlds"
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
      >
        <ol>
          {SCENES.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={index === sceneIndex ? "is-active" : ""}
                onClick={() => selectScene(index)}
                aria-current={index === sceneIndex ? "true" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <i aria-hidden="true" />
                <strong>{item.name}</strong>
              </button>
            </li>
          ))}
        </ol>
        <div className="dither-canvas-step-controls">
          <button type="button" onClick={showPreviousScene} aria-label="Previous world"><span aria-hidden="true">←</span></button>
          <span>{String(sceneIndex + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")}</span>
          <button type="button" onClick={showNextScene} aria-label="Next world"><span aria-hidden="true">→</span></button>
        </div>
      </nav>

      <p className="dither-canvas-interaction dither-canvas-chrome"><span aria-hidden="true" />{scene.interaction}</p>
      <button
        type="button"
        className="dither-canvas-show-interface"
        onClick={() => setInterfaceVisible(true)}
        aria-hidden={interfaceVisible}
        tabIndex={interfaceVisible ? -1 : 0}
      >
        Show interface
      </button>
      <p className="visually-hidden" aria-live="polite">Showing {scene.name}. {scene.description}</p>
    </main>
  );
};

export default DitherCanvasPage;
