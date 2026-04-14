import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeToAuthState, reloadCurrentUser } from '../services/authService';
import { syncPendingCheckIns } from '../services/firestoreService';

const AuthContext = createContext(null);

// Keys to preserve across user switches (device-level preferences, not user data)
const CACHE_PRESERVE = new Set(['@vitalyze:onboarding_done', '@vitalyze:theme']);

async function clearUserCache() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter(
      (k) => k.startsWith('@vitalyze:') && !CACHE_PRESERVE.has(k)
    );
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {
    // Non-critical
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const prevUidRef            = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (firebaseUser) => {
      const incomingUid = firebaseUser?.uid ?? null;
      const prevUid     = prevUidRef.current;

      // When a different account signs in, wipe the previous user's cached
      // data before the new user's screens mount and try to read anything.
      if (prevUid !== null && incomingUid !== prevUid) {
        await clearUserCache();
      }

      prevUidRef.current = incomingUid;
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        try {
          await syncPendingCheckIns(firebaseUser.uid);
        } catch {
          // Non-critical — ignore sync errors
        }
      }
    });

    return unsubscribe;
  }, []);

  // Forces a React re-render with the latest auth.currentUser properties.
  // Call this after updateProfile / updateDisplayName since those mutate
  // the user object in-place without firing a new onAuthStateChanged event.
  const refreshUser = useCallback(() => {
    const fresh = reloadCurrentUser();
    if (fresh) setUser(fresh);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
