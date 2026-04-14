import { useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns true when the OS "Reduce Motion" accessibility setting is enabled.
 * Components should skip or replace animations when this is true.
 */
export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription?.remove();
  }, []);

  return reduceMotion;
}
