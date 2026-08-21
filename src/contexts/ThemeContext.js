import React, { createContext, useContext, useState, useEffect } from 'react';
import BlackHoleBackground from '../components/BlackHoleBackground';

const ThemeCtx = createContext({ isDark: false, toggleTheme: () => {} });

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('popcon-theme');
      if (stored) return stored === 'dark';
    } catch {}
    return false;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // Keep mobile browser chrome in step with the Aetheris page surface.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#080809' : '#fff8f7');
    try { localStorage.setItem('popcon-theme', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark]);

  return (
    <ThemeCtx.Provider value={{ isDark, toggleTheme: () => setIsDark(d => !d) }}>
      <BlackHoleBackground isDark={isDark} />
      {children}
    </ThemeCtx.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeCtx);
