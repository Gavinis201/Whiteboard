import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type HolidayTheme = 'default' | 'christmas' | 'halloween' | 'newyear' | 'valentines';

type ThemeContextType = {
  theme: HolidayTheme;
  setTheme: (t: HolidayTheme) => void;
  themes: { value: HolidayTheme; label: string }[];
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'wb_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<HolidayTheme>(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem(THEME_STORAGE_KEY) as HolidayTheme | null) : null;
    return saved || 'default';
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = (t: HolidayTheme) => setThemeState(t);

  const themes = useMemo<{ value: HolidayTheme; label: string }[]>(
    () => [
      { value: 'default', label: 'Classic' },
      { value: 'christmas', label: 'Christmas' },
      { value: 'halloween', label: 'Halloween' },
      { value: 'newyear', label: "New Year's" },
      { value: 'valentines', label: "Valentine's" },
    ],
    []
  );

  const value = useMemo(() => ({ theme, setTheme, themes }), [theme, themes]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};


