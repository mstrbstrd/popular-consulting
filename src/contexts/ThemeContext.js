import React, { createContext, useContext, useState, useEffect } from 'react';
import BlackHoleBackground from '../components/BlackHoleBackground';

export const ThemeCtx = createContext(null);
const defaultTheme = { isDark: false, toggleTheme: () => {} };

export const ThemeProvider = ({ children, enableBackground = true }) => {
  const inherited = useContext(ThemeCtx);
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('popcon-theme');
      if (stored) return stored === 'dark';
    } catch {}
    return false;
  });

  useEffect(() => {
    if (inherited) return;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // Keep mobile browser chrome in step with the Aetheris page surface.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#080809' : '#fff8f7');
    try { localStorage.setItem('popcon-theme', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark, inherited]);

  const value = inherited || { isDark, toggleTheme: () => setIsDark(d => !d) };

  return (
    <ThemeCtx.Provider value={value}>
      {enableBackground && <BlackHoleBackground isDark={value.isDark} />}
      {children}
    </ThemeCtx.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeCtx) || defaultTheme;
