import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../firebase';
import { COLLECTIONS, STORAGE_KEYS } from '../utils/constants';

/**
 * Register a new user with email and password.
 * Also creates a user document in Firestore.
 */
export const register = async (email, password) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  await setDoc(doc(db, COLLECTIONS.USERS, user.uid), {
    userId: user.uid,
    email: user.email,
    createdAt: serverTimestamp(),
  });

  return user;
};

/**
 * Sign in an existing user with email and password.
 */
export const login = async (email, password) => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
};

/**
 * Sign out the current user and clear all locally cached data.
 * Clearing the cache ensures a subsequent login starts with fresh data
 * and that no stale insights from the previous user are ever displayed.
 */
export const logout = async () => {
  // Clear ALL user-data cache before signing out so the next user who
  // logs in on the same device never sees stale data from this session.
  // Device-level preferences (onboarding flag, theme choice) are preserved.
  try {
    const PRESERVE = new Set(['@vitalyze:onboarding_done', '@vitalyze:theme']);
    const allKeys = await AsyncStorage.getAllKeys();
    const keysToRemove = allKeys.filter(
      (k) => k.startsWith('@vitalyze:') && !PRESERVE.has(k)
    );
    if (keysToRemove.length > 0) {
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch {
    // Non-critical — proceed with sign-out even if cache clear fails
  }
  await signOut(auth);
  // onAuthStateChanged fires with null → AuthContext sets user to null
  // → AppNavigator replaces MainTabs with AuthStack automatically.
};

/**
 * Subscribe to auth state changes.
 * @param {function} callback - Called with the user object (or null on logout)
 * @returns Unsubscribe function
 */
export const subscribeToAuthState = (callback) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Return a plain-object snapshot of the current Firebase Auth user.
 * Used by AuthContext.refreshUser to trigger a React re-render after
 * in-place mutations like updateProfile (which don't fire onAuthStateChanged).
 */
export const reloadCurrentUser = () => {
  const u = auth.currentUser;
  return u ? { ...u } : null;
};

/**
 * Update the displayName on the Firebase Auth profile.
 */
export const updateDisplayName = async (displayName) => {
  await updateProfile(auth.currentUser, { displayName: displayName.trim() });
};

/**
 * Re-authenticate the current user with their email + password.
 * Firebase requires this before sensitive operations (password change,
 * account deletion) if the session is older than a few minutes.
 */
export const reauthenticate = async (currentPassword) => {
  const credential = EmailAuthProvider.credential(
    auth.currentUser.email,
    currentPassword
  );
  await reauthenticateWithCredential(auth.currentUser, credential);
};

/**
 * Change the current user's password.
 * Re-authenticates first to satisfy Firebase's security requirement.
 */
export const changePassword = async (currentPassword, newPassword) => {
  await reauthenticate(currentPassword);
  await updatePassword(auth.currentUser, newPassword);
};

/**
 * Permanently delete the Firebase Auth account.
 * Re-authenticates first. Caller is responsible for deleting Firestore
 * data before calling this.
 */
export const deleteAccount = async (currentPassword) => {
  await reauthenticate(currentPassword);
  await deleteUser(auth.currentUser);
};

/**
 * Map Firebase Auth error codes to friendly messages.
 */
export const getFriendlyAuthError = (errorCode) => {
  switch (errorCode) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please try again.';
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try logging in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    default:
      return 'Something went wrong. Please try again.';
  }
};
