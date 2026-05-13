// ============================================================
// FIREBASE CONFIGURATION
// Replace the values below with your own Firebase project config.
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
  apiKey: "AIzaSyB7p4hGDxl5J3sSHYks0E19Ae2xhLOi_dE",
  authDomain: "vitalyze-c5a0b.firebaseapp.com",
  projectId: "vitalyze-c5a0b",
  storageBucket: "vitalyze-c5a0b.firebasestorage.app",
  messagingSenderId: "698928507545",
  appId: "1:698928507545:web:5d3a6d5c3b739d9b512608",
  measurementId: "G-EDVG0DW7SY"
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
