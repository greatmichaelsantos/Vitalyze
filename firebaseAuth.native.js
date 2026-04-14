// Native (iOS / Android) — Metro resolves 'firebase/auth' to @firebase/auth's
// react-native build (dist/rn/index.js) thanks to unstable_enablePackageExports
// + the 'react-native' condition in metro.config.js.
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function createAuth(app) {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    if (e.code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw e;
  }
}
