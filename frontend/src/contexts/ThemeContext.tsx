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
  // Pick a seasonal default based on month unless a user-selected theme exists
  const getDefaultThemeForMonth = (monthIndex: number): HolidayTheme => {
    // monthIndex: 0=Jan ... 11=Dec
    if (monthIndex === 0) return 'newyear'; // January
    if (monthIndex === 1) return 'valentines'; // February
    if (monthIndex >= 2 && monthIndex <= 7) return 'default'; // March–August
    if (monthIndex >= 8 && monthIndex <= 10) return 'halloween'; // September–November
    return 'christmas'; // December (assumption)
  };

  const [theme, setThemeState] = useState<HolidayTheme>(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem(THEME_STORAGE_KEY) as HolidayTheme | null) : null;
    if (saved) return saved;
    try {
      const month = new Date().getMonth();
      return getDefaultThemeForMonth(month);
    } catch {
      return 'default';
    }
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


