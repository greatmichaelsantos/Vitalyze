// ============================================================
// APP-WIDE CONSTANTS
// ============================================================

export const APP_NAME = 'Mend';
export const APP_TAGLINE = 'Heal from within';

// Typography scale — hardcoded pixel values so layout is identical
// on every platform (iOS, Android, Expo web, tablets).
// Dynamic scaling is intentionally NOT applied here to prevent the
// layout-breaking font blowout that occurs on wide screens.
// Per-component maxFontSizeMultiplier props (already in place) handle
// the OS-level accessibility font-size preference safely.
export const Typography = {
  h1:        { fontSize: 28, fontWeight: '700', lineHeight: 36 },
  h2:        { fontSize: 22, fontWeight: '700', lineHeight: 30 },
  h3:        { fontSize: 18, fontWeight: '600', lineHeight: 26 },
  h4:        { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  body:      { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption:   { fontSize: 12, fontWeight: '400', lineHeight: 18 },
  label:     { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  button:    { fontSize: 16, fontWeight: '600', lineHeight: 22 },
};

// Spacing system (8-point grid)
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Border radii
export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
};

// Minimum touch target (Fitts's Law: 44×44 pts)
export const MIN_TOUCH = 44;

// Mood options
export const MOOD_OPTIONS = [
  { value: 1, emoji: '😔', label: 'Very Low' },
  { value: 2, emoji: '😕', label: 'Low' },
  { value: 3, emoji: '😐', label: 'Neutral' },
  { value: 4, emoji: '🙂', label: 'Good' },
  { value: 5, emoji: '😄', label: 'Great' },
];

// Exercise types
export const EXERCISE_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'walk', label: 'Walk' },
  { value: 'run', label: 'Run' },
  { value: 'gym', label: 'Gym' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'swim', label: 'Swim' },
  { value: 'cycle', label: 'Cycle' },
  { value: 'other', label: 'Other' },
];

// Physical symptoms
export const SYMPTOM_OPTIONS = [
  { value: 'headache', label: 'Headache' },
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'nausea', label: 'Nausea' },
  { value: 'back_pain', label: 'Back Pain' },
  { value: 'chest_tightness', label: 'Chest Tightness' },
  { value: 'dizziness', label: 'Dizziness' },
  { value: 'muscle_soreness', label: 'Muscle Soreness' },
  { value: 'eye_strain', label: 'Eye Strain' },
];

// Eating habit options
export const EATING_HABITS = [
  { value: 'regular', label: 'Regular meals' },
  { value: 'skipped', label: 'Skipped meals' },
  { value: 'late_night', label: 'Late-night eating' },
  { value: 'overate', label: 'Overate' },
  { value: 'healthy', label: 'Healthy choices' },
  { value: 'junk', label: 'Mostly junk food' },
];

// Sleep quality labels
export const SLEEP_QUALITY = [
  { value: 1, label: 'Very Poor' },
  { value: 2, label: 'Poor' },
  { value: 3, label: 'Fair' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' },
];

// Risk levels
export const RISK_LEVELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

// Score thresholds
export const SCORE_THRESHOLDS = {
  LOW_RISK: 70,
  MEDIUM_RISK: 40,
};

// Firestore collection names
export const COLLECTIONS = {
  USERS: 'users',
  HEALTH_LOGS: 'healthLogs',
  KNOWLEDGE_GRAPH: 'knowledgeGraph',
  INSIGHTS: 'insights',
};

// Async storage keys
export const STORAGE_KEYS = {
  ONBOARDING_DONE: '@vitalyze:onboarding_done',
  PENDING_CHECKINS: '@vitalyze:pending_checkins',
  NOTIFICATION_PREFS: '@vitalyze:notification_prefs',
  CACHED_INSIGHTS: '@vitalyze:cached_insights',
};

// Notification types
export const NOTIFICATION_TYPES = {
  HIGH_RISK_ALERT: 'high_risk_alert',
  DAILY_CHECKIN_REMINDER: 'daily_checkin_reminder',
  WEEKLY_SUMMARY: 'weekly_summary',
};
