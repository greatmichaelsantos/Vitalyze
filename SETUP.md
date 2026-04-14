# Vitalyze — Setup Guide

## 1. Install dependencies

```bash
cd Vitalyze
npm install
```

## 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project named **Vitalyze**
3. Enable **Authentication** → Email/Password
4. Enable **Firestore Database** → Start in production mode
5. Enable **Cloud Messaging** (for push notifications)
6. Go to Project Settings → Your Apps → Add Web App
7. Copy the `firebaseConfig` object and paste it into `firebase.js`:

```js
const firebaseConfig = {
  apiKey: "your-real-api-key",
  authDomain: "your-app.firebaseapp.com",
  projectId: "your-app",
  storageBucket: "your-app.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123...",
};
```

### Firestore Security Rules

Paste these rules in Firebase Console → Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /healthLogs/{logId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
    match /knowledgeGraph/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /insights/{insightId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## 3. Add App Assets

Place these image files in `src/assets/`:
- `icon.png` — 1024×1024 app icon
- `splash.png` — 1242×2436 splash screen
- `adaptive-icon.png` — 1024×1024 Android adaptive icon
- `favicon.png` — 48×48 web favicon

Generate icons at: https://www.appicon.co/

## 4. Run the App

```bash
# Start Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run in web browser
npm run web
```

## 5. Build for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

## Firestore Database Structure

```
users/
  {userId}/
    userId: string
    email: string
    createdAt: timestamp

healthLogs/
  {logId}/
    userId: string
    date: string (YYYY-MM-DD)
    mood, stress, anxiety, loneliness, motivation: number (1-5)
    sleep: number (hours)
    sleepQuality: number (1-5)
    exercise: string
    water: number (glasses)
    symptoms: string[]
    meals: number
    coffee, energyDrinks, alcohol: number
    eatingHabits: string[]
    createdAt: timestamp

knowledgeGraph/
  {userId}/
    userId: string
    current: { nodes, edges, nodeWeights, date }
    history: array (last 30 graphs)
    lastUpdated: string

insights/
  {insightId}/
    userId: string
    date: string
    logId: string
    overallScore, physicalScore, mentalScore, dietScore: number (0-100)
    riskLevel: "Low" | "Medium" | "High"
    patterns: array
    suggestions: array
    alerts: array
    analyzedAt: string
    createdAt: timestamp
```
