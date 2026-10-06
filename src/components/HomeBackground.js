import React, { useEffect, useState } from 'react';
import { useThemeMode } from '../contexts/ThemeContext';
import { hasHardwareWebGL, isMobileTier } from '../utils/deviceTier';
import { shouldAttemptWebGL } from '../utils/graphicsPolicy';
import { shouldUseHighFidelityMobileLight } from '../utils/mobileGraphicsCapability';
import ProductionThemeCanvas from './ProductionThemeCanvas';
import ManagedDitherBackground from './ManagedDitherBackground';
import BlackHoleBackground from './BlackHoleBackground';

export default function HomeBackground({ enabled }) {
  const { isDark } = useThemeMode();
  const [forcedColors, setForcedColors] = useState(() =>
    Boolean(window.matchMedia?.('(forced-colors: active)')?.matches));
  const [mobileLightFailed, setMobileLightFailed] = useState(false);
  const handleMobileLightState = React.useCallback(state => {
    if (state === 'fallback') setMobileLightFailed(true);
  }, []);

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

  const live = enabled && !forcedColors && shouldAttemptWebGL && hasHardwareWebGL;
  const mobileLight = live && !mobileLightFailed && shouldUseHighFidelityMobileLight({
    isDark,
    hardwareWebGL: hasHardwareWebGL,
    mobile: isMobileTier,
    pathname: window.location.pathname,
    navigatorObject: navigator,
  });
  const theme = isDark ? 'dark' : 'light';

  return <div className={`home-background fixed-background production-theme-${theme}`} aria-hidden="true">
    <div className="production-theme-fallback" />
    {live && isDark && <BlackHoleBackground isDark />}
    {mobileLight && <ProductionThemeCanvas theme="light" activeSection={0}
      highFidelityLight runtimeScope="home-mobile" onFieldStateChange={handleMobileLightState} />}
    {live && !isDark && !mobileLight && <div className="home-background__dither">
      <ManagedDitherBackground activeSection={0} isDark={false} rendererId="home-dither" />
    </div>}
  </div>;
}
