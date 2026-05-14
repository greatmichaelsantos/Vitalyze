import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FONT_SIZE_KEY    = 'accessibility_font_size';
const HIGH_CONTRAST_KEY = 'accessibility_high_contrast';

export const FONT_SIZE_MULTIPLIERS = {
  small:      0.85,
  default:    1.0,
  large:      1.15,
  extraLarge: 1.3,
};

const AccessibilityContext = createContext({
  fontSizeKey:        'default',
  fontSizeMultiplier: 1.0,
  highContrast:       false,
  setFontSize:        () => {},
  setHighContrast:    () => {},
});

export const AccessibilityProvider = ({ children }) => {
  const [fontSizeKey,  setFontSizeKey]      = useState('default');
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FONT_SIZE_KEY),
      AsyncStorage.getItem(HIGH_CONTRAST_KEY),
    ]).then(([fs, hc]) => {
      if (fs && FONT_SIZE_MULTIPLIERS[fs] !== undefined) setFontSizeKey(fs);
      if (hc === 'true') setHighContrastState(true);
    }).catch(() => {});
  }, []);

  const setFontSize = useCallback((key) => {
    setFontSizeKey(key);
    AsyncStorage.setItem(FONT_SIZE_KEY, key).catch(() => {});
  }, []);

  const setHighContrast = useCallback((value) => {
    setHighContrastState(value);
    AsyncStorage.setItem(HIGH_CONTRAST_KEY, value ? 'true' : 'false').catch(() => {});
  }, []);

  return (
    <AccessibilityContext.Provider value={{
      fontSizeKey,
      fontSizeMultiplier: FONT_SIZE_MULTIPLIERS[fontSizeKey] ?? 1.0,
      highContrast,
      setFontSize,
      setHighContrast,
    }}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = () => useContext(AccessibilityContext);
