import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, NOTIFICATION_TYPES } from '../utils/constants';

// Configure how notifications behave when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request permission and register for push notifications.
 * Returns the Expo push token, or null if not granted.
 */
export const registerForPushNotifications = async () => {
  if (!Device.isDevice) {
    // Simulators don't support push notifications
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('health-alerts', {
      name: 'Health Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C47FF',
    });
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Daily Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
};

/**
 * Send a local push notification for a high-risk health alert.
 */
export const sendHighRiskAlert = async (patternName, description) => {
  const prefs = await getNotificationPrefs();
  if (!prefs.highRiskAlerts) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `⚠️ Health Alert: ${patternName}`,
      body: description,
      data: { type: NOTIFICATION_TYPES.HIGH_RISK_ALERT },
      sound: true,
    },
    trigger: null, // immediate
  });
};

/**
 * Schedule a daily check-in reminder at a given hour (default 9 AM).
 */
export const scheduleDailyReminder = async (hour = 9, minute = 0) => {
  const prefs = await getNotificationPrefs();
  if (!prefs.dailyReminder) return;

  // Cancel existing reminders first
  await cancelDailyReminder();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📋 Time for your daily check-in',
      body: 'Take 2 minutes to log how you are feeling today. Your health insights are waiting.',
      data: { type: NOTIFICATION_TYPES.DAILY_CHECKIN_REMINDER },
    },
    trigger: {
      hour,
      minute,
      repeats: true,
    },
  });
};

/**
 * Cancel all scheduled daily reminders.
 */
export const cancelDailyReminder = async () => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const reminders = scheduled.filter(
    (n) => n.content.data?.type === NOTIFICATION_TYPES.DAILY_CHECKIN_REMINDER
  );
  for (const n of reminders) {
    await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
};

/**
 * Get notification preferences from AsyncStorage.
 */
export const getNotificationPrefs = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATION_PREFS);
  if (raw) return JSON.parse(raw);
  // Defaults
  return {
    highRiskAlerts: true,
    dailyReminder: true,
    reminderHour: 9,
    reminderMinute: 0,
    weeklySummary: true,
  };
};

/**
 * Save notification preferences and reschedule as needed.
 */
export const saveNotificationPrefs = async (prefs) => {
  await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_PREFS, JSON.stringify(prefs));

  if (prefs.dailyReminder) {
    await scheduleDailyReminder(prefs.reminderHour, prefs.reminderMinute);
  } else {
    await cancelDailyReminder();
  }
};

/**
 * Send notifications for all high-risk alerts in an analysis result.
 */
export const notifyForAlerts = async (alerts) => {
  for (const alert of alerts) {
    if (alert.severity === 'high') {
      await sendHighRiskAlert(alert.title, alert.body);
    }
  }
};
