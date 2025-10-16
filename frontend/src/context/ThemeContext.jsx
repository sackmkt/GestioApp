/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo } from 'react';

const ThemeContext = createContext(undefined);

const ENFORCED_THEME = 'light';

export function ThemeProvider({ children }) {
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-theme', ENFORCED_THEME);
    document.documentElement.dataset.theme = ENFORCED_THEME;
  }, []);

  const value = useMemo(
    () => ({
      theme: ENFORCED_THEME,
      setTheme: () => {},
      cycleTheme: () => {},
      themes: [ENFORCED_THEME],
    }),
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme debe utilizarse dentro de un ThemeProvider.');
  }
  return context;
}
