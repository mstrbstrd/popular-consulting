// BlackHoleCanvas.js
// Original psychedelic geodesic black hole with adaptive tiled scheduling.
import React from "react";
import { useBlackHoleRenderer } from "./blackHoleRenderer";

export * from "./blackHoleSchedule";
export * from "./blackHoleShader";

const BlackHoleCanvas = ({
  isDark = true,
  visible = true,
  onFadeOutEnd,
  zoomRef,
  currentZoomRef,
}) => {
  const {
    canvasRef,
    failed,
    onFadeOutEndRef,
    rendererGeneration,
  } = useBlackHoleRenderer({
    isDark,
    visible,
    onFadeOutEnd,
    zoomRef,
    currentZoomRef,
  });

  if (failed) return null;

  return (
    <canvas
      key={rendererGeneration}
      ref={canvasRef}
      data-renderer-id="black-hole-orb"
      data-context-recovery="local"
      onTransitionEnd={() => {
        if (!visible) onFadeOutEndRef.current?.();
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        zIndex: 5,
        display: "block",
        opacity: visible ? 1 : 0,
        transition: "opacity 1.2s ease",
        touchAction: "none",
      }}
    />
  );
};

export default BlackHoleCanvas;
