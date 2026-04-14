import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOTAL_STEPS = 6;

/**
 * Manages guided tour state for a specific user.
 * Persists the active step in AsyncStorage so the tour survives tab navigation.
 *
 * isTourDone starts as null (unknown) until AsyncStorage has been read.
 * Screens should wait for isTourDone !== null before attempting to start the tour.
 */
export function useGuidedTour(userId) {
  const [tourStep,   setTourStep]   = useState(0);
  const [tourActive, setTourActive] = useState(false);
  const [isTourDone, setIsTourDone] = useState(null); // null = not yet loaded

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const done = await AsyncStorage.getItem(`guided_tour_done_${userId}`);
      if (done === 'true') {
        setIsTourDone(true);
        setTourActive(false);
        setTourStep(0);
        return;
      }
      setIsTourDone(false);
      const stepStr = await AsyncStorage.getItem(`guided_tour_step_${userId}`);
      const step = stepStr ? parseInt(stepStr, 10) : 0;
      setTourStep(step);
      setTourActive(step >= 1 && step <= TOTAL_STEPS);
    } catch {
      // AsyncStorage failure — treat as not done so tour can potentially start
      setIsTourDone(false);
    }
  }, [userId]);

  // Initial load on mount / when userId changes
  useEffect(() => { reload(); }, [reload]);

  const startTour = useCallback(async () => {
    if (!userId) return;
    try {
      await AsyncStorage.setItem(`guided_tour_step_${userId}`, '1');
    } catch {}
    setTourStep(1);
    setTourActive(true);
  }, [userId]);

  const nextStep = useCallback(async () => {
    if (!userId) return;
    const next = tourStep + 1;
    if (next > TOTAL_STEPS) {
      // Tour complete — same as skip
      try {
        await AsyncStorage.setItem(`guided_tour_done_${userId}`, 'true');
        await AsyncStorage.removeItem(`guided_tour_step_${userId}`);
      } catch {}
      setTourActive(false);
      setIsTourDone(true);
      setTourStep(0);
    } else {
      try {
        await AsyncStorage.setItem(`guided_tour_step_${userId}`, String(next));
      } catch {}
      setTourStep(next);
    }
  }, [userId, tourStep]);

  const skipTour = useCallback(async () => {
    if (!userId) return;
    try {
      await AsyncStorage.setItem(`guided_tour_done_${userId}`, 'true');
      await AsyncStorage.removeItem(`guided_tour_step_${userId}`);
    } catch {}
    setTourActive(false);
    setIsTourDone(true);
    setTourStep(0);
  }, [userId]);

  return { tourStep, tourActive, isTourDone, startTour, nextStep, skipTour, reload };
}
