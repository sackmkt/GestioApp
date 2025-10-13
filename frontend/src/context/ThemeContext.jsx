import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(undefined);

const THEME_STORAGE_KEY = 'gestio:theme-preference';
const SUPPORTED_THEMES = ['light', 'dark', 'contrast'];

const getSystemTheme = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && SUPPORTED_THEMES.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn('No se pudo recuperar la preferencia de tema almacenada.', error);
  }

  return getSystemTheme();
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getInitialTheme());

  const applyThemeToDocument = useCallback((nextTheme) => {
    if (typeof document === 'undefined') {
      return;
    }

    const validTheme = SUPPORTED_THEMES.includes(nextTheme) ? nextTheme : 'light';
    document.documentElement.setAttribute('data-theme', validTheme);
    document.documentElement.dataset.theme = validTheme;
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.warn('No se pudo persistir la preferencia de tema.', error);
    }
  }, [applyThemeToDocument, theme]);

  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (event) => {
        setTheme((currentTheme) => {
          const storedPreference = (() => {
            try {
              return localStorage.getItem(THEME_STORAGE_KEY);
            } catch (error) {
              console.warn('No se pudo acceder al almacenamiento para el tema.', error);
              return null;
            }
          })();

          if (storedPreference && SUPPORTED_THEMES.includes(storedPreference)) {
            return currentTheme;
          }

          return event.matches ? 'dark' : 'light';
        });
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    return undefined;
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme((current) => {
      const currentIndex = SUPPORTED_THEMES.indexOf(current);
      if (currentIndex === -1) {
        return 'light';
      }
      const nextIndex = (currentIndex + 1) % SUPPORTED_THEMES.length;
      return SUPPORTED_THEMES[nextIndex];
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      cycleTheme,
      themes: SUPPORTED_THEMES,
    }),
    [theme, cycleTheme],
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
