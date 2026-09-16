import React, { memo, useEffect, useState } from "react";
import { useThemeMode } from "../contexts/ThemeContext";
import { hasHardwareWebGL } from "../utils/deviceTier";
import { GRAPHICS_MODES, graphicsMode, shouldAttemptWebGL } from "../utils/graphicsPolicy";
import CreatorOSFieldCanvas from "./CreatorOSFieldCanvas";
import "./CreatorOSFieldCanvas.css";

// Reuse the lab's Contour Drift renderer. No invoice data enters the scene,
// and editing a field must not rebuild a WebGL context or restart its clock.
const InvoiceGeneratorBackground = memo(() => {
  const { isDark } = useThemeMode();
  const [paused, setPaused] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const [forcedColors, setForcedColors] = useState(() =>
    Boolean(window.matchMedia?.("(forced-colors: active)").matches));
  const [failed, setFailed] = useState(false);
  const enabled = !forcedColors && shouldAttemptWebGL && (hasHardwareWebGL || graphicsMode === GRAPHICS_MODES.WEBGL);

  useEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(Boolean(motion?.matches));
    const colors = window.matchMedia?.("(forced-colors: active)");
    const syncColors = () => setForcedColors(Boolean(colors?.matches));
    const beforePrint = () => setPrinting(true);
    const afterPrint = () => setPrinting(false);
    if (motion?.addEventListener) motion.addEventListener("change", syncMotion);
    else motion?.addListener?.(syncMotion);
    if (colors?.addEventListener) colors.addEventListener("change", syncColors);
    else colors?.addListener?.(syncColors);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      if (motion?.removeEventListener) motion.removeEventListener("change", syncMotion);
      else motion?.removeListener?.(syncMotion);
      if (colors?.removeEventListener) colors.removeEventListener("change", syncColors);
      else colors?.removeListener?.(syncColors);
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);

  return (
    <>
      <div className="invoice-scene invoice-no-print" aria-hidden="true" data-study="contour-drift"
        data-motion={reducedMotion || !enabled || failed ? "static" : paused || printing ? "paused" : "running"}>
        {enabled && !failed ? <CreatorOSFieldCanvas mode={3} contourPalette="spectral" isDark={isDark}
          paused={paused || printing || reducedMotion} onFieldStateChange={(state) => setFailed(state === "fallback")} />
          : <div className="creatoros-field-shell creatoros-field-mode-3 creatoros-field-contour-palette-spectral is-fallback">
            <div className="creatoros-field-fallback" />
          </div>}
      </div>
      <div className="invoice-scene-options">
        <span>Contour Drift</span>
        {enabled && !reducedMotion && !failed ? <button type="button" aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}>{paused ? "Resume background" : "Pause background"}</button>
          : <span className="invoice-scene-static">Static background</span>}
      </div>
    </>
  );
});

export default InvoiceGeneratorBackground;
