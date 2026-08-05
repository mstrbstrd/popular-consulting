import React, { useCallback, useEffect, useRef, useState } from "react";
import DitherWorldCanvas from "./DitherWorldCanvas";
import "./DitherCanvasPage.css";

const SCENES = Object.freeze([
  {
    id: "alpine",
    category: "Landscape",
    name: "Alpine Dawn",
    description:
      "Ridgelines emerge from ten glyphs while fog moves through the valleys and the first light follows your motion.",
    useCase: "Hero imagery, chapter openings, and place-led storytelling.",
    interaction: "Move to shift the horizon. Tap to wake the light.",
  },
  {
    id: "moonwater",
    category: "Atmosphere",
    name: "Moonwater",
    description:
      "Moonlight breaks across an ASCII tide, turning a quiet field of characters into depth, distance, and reflection.",
    useCase: "Music, editorial stories, and contemplative product states.",
    interaction: "Tap the water to send a ring through the reflection.",
  },
  {
    id: "desert",
    category: "Terrain",
    name: "Desert Wind",
    description:
      "Warm dune bands drift beneath a cool sky as fine wind lines move independently across the landscape.",
    useCase: "Section transitions, campaign moments, and calm calls to action.",
    interaction: "Move across the field. Tap to release a gust.",
  },
  {
    id: "gate",
    category: "Architecture",
    name: "Luminous Gate",
    description:
      "A single impossible doorway turns geometry, fog, and reflected light into a restrained cinematic reveal.",
    useCase: "Product launches, future-facing brands, and threshold moments.",
    interaction: "Tap the gate to intensify its pulse.",
  },
  {
    id: "bloom",
    category: "Living form",
    name: "Night Bloom",
    description:
      "An organic form opens inside a dark field, proving the same dither language can feel alive rather than merely abstract.",
    useCase: "Identity systems, creative tools, and expressive loading states.",
    interaction: "Move to guide the bloom. Tap to make it open.",
  },
]);

const wrapSceneIndex = (index) =>
  (index + SCENES.length) % SCENES.length;

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
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      mediaQuery.addListener?.(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        mediaQuery.removeListener?.(handleChange);
      }
    };
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
    }, 14000);
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
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return;
    }
    if (deltaX < 0) showNextScene();
    else showPreviousScene();
  };

  return (
    <main
      className={`dither-canvas-page scene-${scene.id}${
        interfaceVisible ? "" : " is-immersive"
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-label="Dither Worlds generative art studies"
    >
      <DitherWorldCanvas sceneIndex={sceneIndex} paused={paused} />
      <div className="dither-canvas-atmosphere" aria-hidden="true" />
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
          <button
            type="button"
            onClick={() => setTouring((current) => !current)}
            aria-pressed={touring}
          >
            {touring ? "Auto on" : "Auto off"}
          </button>
          <button type="button" onClick={() => setPaused((current) => !current)}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => setInterfaceVisible(false)}>
            Hide UI
          </button>
        </div>
      </header>

      <section
        className="dither-canvas-scene-copy dither-canvas-chrome"
        aria-labelledby="dither-world-title"
      >
        <p className="dither-canvas-eyebrow">
          <span>{String(sceneIndex + 1).padStart(2, "0")}</span>
          {scene.category}
        </p>
        <h1 id="dither-world-title">{scene.name}</h1>
        <p className="dither-canvas-description">{scene.description}</p>
        <p className="dither-canvas-use-case">
          <span>Use case</span>
          {scene.useCase}
        </p>
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
          <button type="button" onClick={showPreviousScene} aria-label="Previous world">
            <span aria-hidden="true">←</span>
          </button>
          <span>{String(sceneIndex + 1).padStart(2, "0")} / 05</span>
          <button type="button" onClick={showNextScene} aria-label="Next world">
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </nav>

      <p className="dither-canvas-interaction dither-canvas-chrome">
        <span aria-hidden="true" />
        {scene.interaction}
      </p>

      <button
        type="button"
        className="dither-canvas-show-interface"
        onClick={() => setInterfaceVisible(true)}
        aria-hidden={interfaceVisible}
        tabIndex={interfaceVisible ? -1 : 0}
      >
        Show interface
      </button>

      <p className="visually-hidden" aria-live="polite">
        Showing {scene.name}. {scene.description}
      </p>
    </main>
  );
};

export default DitherCanvasPage;
