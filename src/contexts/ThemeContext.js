import React, { createContext, useContext, useState, useEffect } from 'react';

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
    // Keep mobile browser chrome in step with the active theme.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark ? '#0b0b18' : '#ffffff');
    try { localStorage.setItem('popcon-theme', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark]);

  return (
    <ThemeCtx.Provider value={{ isDark, toggleTheme: () => setIsDark(d => !d) }}>
      {children}
    </ThemeCtx.Provider>
  );
};

export const useThemeMode = () => useContext(ThemeCtx);
