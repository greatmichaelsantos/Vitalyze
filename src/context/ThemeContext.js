import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../utils/themes';
import { useAccessibility } from './AccessibilityContext';

const THEME_KEY = '@vitalyze:theme';

const ThemeContext = createContext({
  colors:          lightTheme,
  isDark:          false,
  toggleTheme:     () => {},
  cardBorderWidth: 1,
});

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);
  const { highContrast } = useAccessibility();

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => { if (stored === 'dark') setIsDark(true); })
      .catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light').catch(() => {});
      return next;
    });
  }, []);

  const base   = isDark ? darkTheme : lightTheme;
  const colors = highContrast ? {
    ...base,
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    border:      isDark ? '#5E5E7E' : '#9CA3AF',
  } : base;

  return (
    <ThemeContext.Provider value={{
      colors,
      isDark,
      toggleTheme,
      cardBorderWidth: highContrast ? 1.5 : 1,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
