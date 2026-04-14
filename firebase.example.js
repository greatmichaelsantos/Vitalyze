// ============================================================
// FIREBASE CONFIGURATION — EXAMPLE FILE
// Copy this file to firebase.js and replace all placeholder
// values with your own Firebase project config.
// Go to: Firebase Console → Project Settings → Your Apps → Config
// ============================================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { Platform } from 'react-native';
// Metro resolves './firebaseAuth' to:
//   firebaseAuth.native.js  → firebase/auth RN build + AsyncStorage persistence
//   firebaseAuth.js         → firebase/auth browser build (web)
import { createAuth } from './firebaseAuth';

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
  measurementId:     "YOUR_MEASUREMENT_ID",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth = createAuth(app);

const db      = getFirestore(app);
const storage = getStorage(app);

// Messaging (web only; on native use expo-notifications)
let messaging = null;
if (Platform.OS === 'web') {
  try {
    const { getMessaging } = require('firebase/messaging');
    messaging = getMessaging(app);
  } catch {
    // Not supported in this environment
  }
}

export { app, auth, db, storage, messaging, enableNetwork, disableNetwork };
