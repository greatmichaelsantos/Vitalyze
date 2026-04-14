import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../utils/themes';

const THEME_KEY = '@vitalyze:theme';

const ThemeContext = createContext({
  colors:      lightTheme,
  isDark:      false,
  toggleTheme: () => {},
});

export const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  // Hydrate from AsyncStorage on mount — fires before first meaningful render
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

  return (
    <ThemeContext.Provider value={{
      colors:      isDark ? darkTheme : lightTheme,
      isDark,
      toggleTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
