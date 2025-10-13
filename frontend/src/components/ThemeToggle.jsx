import React, { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';

const THEME_METADATA = {
  light: {
    icon: '🌞',
    label: 'Tema claro',
    description: 'Colores suaves y equilibrados para entornos luminosos.',
  },
  dark: {
    icon: '🌙',
    label: 'Tema oscuro',
    description: 'Mejora el confort visual en ambientes con poca luz.',
  },
  contrast: {
    icon: '⚡',
    label: 'Alto contraste',
    description: 'Mayor diferenciación de colores y contornos para accesibilidad.',
  },
};

function ThemeToggle({ className = '' }) {
  const { theme, cycleTheme, themes } = useTheme();

  const currentTheme = useMemo(() => THEME_METADATA[theme] ?? THEME_METADATA.light, [theme]);
  const nextTheme = useMemo(() => {
    const currentIndex = themes.indexOf(theme);
    const nextKey = themes[(currentIndex + 1) % themes.length];
    return THEME_METADATA[nextKey] ?? THEME_METADATA.light;
  }, [theme, themes]);

  return (
    <button
      type="button"
      className={`btn btn-outline-primary gestio-theme-toggle ${className}`.trim()}
      onClick={cycleTheme}
      aria-live="polite"
      aria-label={`Cambiar al ${nextTheme.label}. Tema actual: ${currentTheme.label}.`}
      title={`${currentTheme.label}. Click para activar ${nextTheme.label}.`}
    >
      <span aria-hidden="true" className="gestio-theme-toggle__icon">
        {currentTheme.icon}
      </span>
      <span className="visually-hidden">{currentTheme.description}</span>
    </button>
  );
}

export default ThemeToggle;
