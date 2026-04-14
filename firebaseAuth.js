// Web — uses the standard firebase/auth browser build.
// browserLocalPersistence is the default so no explicit persistence is needed.
import { initializeAuth, getAuth } from 'firebase/auth';

export function createAuth(app) {
  try {
    return initializeAuth(app);
  } catch (e) {
    if (e.code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw e;
  }
}
