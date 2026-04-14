import React, { useEffect, useState, useRef } from 'react';
import { Platform, Animated, View, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { STORAGE_KEYS } from '../utils/constants';
import { getUserProfile } from '../services/firestoreService';

// Auth screens
import LoginScreen               from '../screens/auth/LoginScreen';
import RegisterScreen            from '../screens/auth/RegisterScreen';
import TermsAndConditionsScreen  from '../screens/legal/TermsAndConditionsScreen';

// Onboarding
import OnboardingScreen    from '../screens/onboarding/OnboardingScreen';
import TutorialScreen      from '../screens/onboarding/TutorialScreen';
import ProfileSetupScreen  from '../screens/onboarding/ProfileSetupScreen';

// Main screens
import HomeScreen     from '../screens/main/HomeScreen';
import CheckInScreen  from '../screens/main/CheckInScreen';
import InsightsScreen from '../screens/main/InsightsScreen';
import ProgressScreen from '../screens/main/ProgressScreen';
import ProfileScreen  from '../screens/main/ProfileScreen';
import FAQScreen         from '../screens/main/FAQScreen';
import CircleScreen      from '../screens/main/CircleScreen';
import EditProfileScreen from '../screens/main/EditProfileScreen';

import LoadingSpinner from '../components/LoadingSpinner';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const TAB_ICONS = {
  Home:     { active: 'home',           inactive: 'home-outline' },
  CheckIn:  { active: 'add-circle',     inactive: 'add-circle-outline' },
  Insights: { active: 'bulb',           inactive: 'bulb-outline' },
  Progress: { active: 'bar-chart',      inactive: 'bar-chart-outline' },
  Profile:  { active: 'person-circle',  inactive: 'person-circle-outline' },
};

function AnimatedTabButton({ children, accessibilityState, onPress, onLongPress, style }) {
  const { colors } = useTheme();
  const focused   = accessibilityState?.selected ?? false;
  const bgOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(bgOpacity, {
      toValue:  focused ? 1 : 0,
      duration: focused ? 160 : 120,
      useNativeDriver: true,
    }).start();
  }, [focused]);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      style={[style, tabBtnStyles.btn]}
      activeOpacity={1}
    >
      <Animated.View
        style={[tabBtnStyles.highlight, { backgroundColor: colors.primaryLight, opacity: bgOpacity }]}
      />
      {children}
    </TouchableOpacity>
  );
}

const tabBtnStyles = StyleSheet.create({
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: 2,
    marginVertical: -4,
    borderRadius: 10,
  },
});

const makeTabBarButton = (props) => <AnimatedTabButton {...props} />;

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor:   colors.primaryContrast,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.border,
          borderTopWidth: 1,
          paddingBottom: 24,
          paddingTop: 14,
          height: 80,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name];
          return <Ionicons name={focused ? icons.active : icons.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen}     options={{ title: 'Home',     tabBarButton: makeTabBarButton }} />
      <Tab.Screen name="Insights" component={InsightsScreen} options={{ title: 'Insights', tabBarButton: makeTabBarButton }} />
      <Tab.Screen name="CheckIn"  component={CheckInScreen}  options={{ title: 'Check-in', tabBarButton: makeTabBarButton }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ title: 'Progress', tabBarButton: makeTabBarButton }} />
      <Tab.Screen name="Profile"  component={ProfileScreen}  options={{ title: 'Profile',  tabBarButton: makeTabBarButton }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"    component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen
        name="TermsAndConditions"
        component={TermsAndConditionsScreen}
        options={{
          presentation: Platform.OS === 'ios' ? 'modal' : 'card',
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading }  = useAuth();
  const { colors, isDark } = useTheme();
  const [onboardingDone,       setOnboardingDone]       = useState(null);
  const [tutorialSeen,         setTutorialSeen]         = useState(null);
  const [profileSetupComplete, setProfileSetupComplete] = useState(null);

  useEffect(() => {
    (async () => {
      const done = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE);
      setOnboardingDone(done === 'true');
    })();
  }, []);

  // Check per-user tutorial and profile-setup flags whenever the logged-in user changes
  useEffect(() => {
    if (!user) {
      setTutorialSeen(null);
      setProfileSetupComplete(null);
      return;
    }
    Promise.all([
      AsyncStorage.getItem(`tutorial_seen_${user.uid}`),
      getUserProfile(user.uid),
    ])
      .then(([tv, profile]) => {
        setTutorialSeen(tv === 'true');
        setProfileSetupComplete(profile?.profileSetupComplete === true);
      })
      .catch(() => {
        setTutorialSeen(true);
        setProfileSetupComplete(false);
      });
  }, [user]);

  // Wait for onboarding check; also wait for per-user flags when user is logged in
  if (loading || onboardingDone === null || (user && (tutorialSeen === null || profileSetupComplete === null))) {
    return <LoadingSpinner fullScreen />;
  }

  // React Navigation container theme — keeps screen backgrounds in sync
  const navTheme = {
    dark: isDark,
    colors: {
      primary:    colors.primary,
      background: colors.background,
      card:       colors.surface,
      text:       colors.textPrimary,
      border:     colors.border,
      notification: colors.primary,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            {!onboardingDone && (
              <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            )}
            <Stack.Screen name="Auth" component={AuthStack} />
          </>
        ) : (
          <>
            {!tutorialSeen && (
              <Stack.Screen name="Tutorial"     component={TutorialScreen} />
            )}
            {!profileSetupComplete && (
              <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            )}
            <Stack.Screen name="Main"         component={MainTabs} />
            <Stack.Screen name="FAQ"         component={FAQScreen} />
            <Stack.Screen name="Circle"      component={CircleScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
