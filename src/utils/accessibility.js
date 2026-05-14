import { useAccessibility } from '../context/AccessibilityContext';
import { Typography } from './constants';

export const useFontSize = () => {
  const { fontSizeMultiplier } = useAccessibility();
  return fontSizeMultiplier;
};

export const useHighContrast = () => {
  const { highContrast } = useAccessibility();
  return highContrast;
};

// Returns a Typography scale with font sizes adjusted by the user's font-size
// preference. Import this instead of the raw Typography constant in screens
// that opt in to accessibility font scaling.
export const useTypography = () => {
  const multiplier = useFontSize();
  if (multiplier === 1.0) return Typography;
  return Object.fromEntries(
    Object.entries(Typography).map(([key, style]) => [
      key,
      { ...style, fontSize: Math.round(style.fontSize * multiplier) },
    ])
  );
};
