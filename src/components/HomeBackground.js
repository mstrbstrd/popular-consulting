import React, { useEffect, useState } from 'react';
import { useThemeMode } from '../contexts/ThemeContext';
import { hasHardwareWebGL, isMobileTier } from '../utils/deviceTier';
import { GRAPHICS_MODES, graphicsMode, shouldAttemptWebGL } from '../utils/graphicsPolicy';
import { canAttemptHighFidelityMobileGraphics } from '../utils/mobileGraphicsCapability';
import ProductionThemeCanvas from './ProductionThemeCanvas';

export default function HomeBackground({ enabled }) {
  const { isDark } = useThemeMode();
  const [forcedColors, setForcedColors] = useState(() =>
    Boolean(window.matchMedia?.('(forced-colors: active)')?.matches));

  useEffect(() => {
    const query = window.matchMedia?.('(forced-colors: active)');
    const sync = () => setForcedColors(Boolean(query?.matches));
    if (query?.addEventListener) query.addEventListener('change', sync);
    else query?.addListener?.(sync);
    return () => {
      if (query?.removeEventListener) query.removeEventListener('change', sync);
      else query?.removeListener?.(sync);
    };
  }, []);

  const mobileCapable = canAttemptHighFidelityMobileGraphics({
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    saveData: navigator.connection?.saveData === true,
  });
  const live = enabled && !forcedColors && shouldAttemptWebGL
    && (hasHardwareWebGL || graphicsMode === GRAPHICS_MODES.WEBGL)
    && (!isMobileTier || mobileCapable);
  const theme = isDark ? 'dark' : 'light';

  return <div className={`home-background production-theme-${theme}`} aria-hidden="true">
    <div className="production-theme-fallback" />
    {live && <ProductionThemeCanvas key={theme} theme={theme} activeSection={0}
      highFidelityLight={mobileCapable} runtimeScope="home" />}
  </div>;
}
