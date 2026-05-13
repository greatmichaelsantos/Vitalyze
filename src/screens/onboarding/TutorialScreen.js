import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  Animated, StatusBar, SafeAreaView, ActivityIndicator, Platform, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';

const SLIDES = [
  {
    id: '1',
    icon: '👋',
    title: 'Welcome to Mend',
    body: "Your personal AI health companion. We'll help you track your daily wellness and detect patterns that matter.",
  },
  {
    id: '2',
    icon: '➕',
    title: 'Check in every day',
    body: 'Answer a few quick questions about your mood, sleep, diet, and activity. It only takes 2 minutes.',
  },
  {
    id: '3',
    icon: '📊',
    title: 'See your health scores',
    body: 'After each check-in, your AI generates Overall, Physical, and Mental health scores based on your responses.',
  },
  {
    id: '4',
    icon: '🔗',
    title: 'Explore your Health Map',
    body: 'See how your habits connect. Your Health Connection Map shows which factors influence each other over time.',
  },
  {
    id: '5',
    icon: '💡',
    title: 'Get personalised suggestions',
    body: 'Mend detects patterns and gives you actionable suggestions tailored to your data — not generic advice.',
  },
];

const SWIPE_THRESHOLD = 50;

export default function TutorialScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const reduceMotion       = useReduceMotion();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing,    setFinishing]    = useState(false);

  const isLast = currentIndex === SLIDES.length - 1;
  const slide  = SLIDES[currentIndex] ?? SLIDES[0];

  const markSeen = async () => {
    if (user?.uid) {
      await AsyncStorage.setItem(`tutorial_seen_${user.uid}`, 'true');
    }
  };

  const goToIndex = (index) => {
    if (index < 0 || index >= SLIDES.length) return;
    setCurrentIndex(index);
  };

  const handleNext = () => {
    if (!isLast) {
      goToIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    if (finishing) return;
    setFinishing(true);
    markSeen().catch(() => {});
    navigation.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
  };

  // PanResponder for swipe left/right
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Claim the responder only for clearly horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
               Math.abs(gestureState.dx) > 10;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe left → next
          setCurrentIndex((prev) => Math.min(prev + 1, SLIDES.length - 1));
        } else if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe right → previous
          setCurrentIndex((prev) => Math.max(prev - 1, 0));
        }
      },
    })
  ).current;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Progress dots — top */}
      <View style={styles.dotsRow} accessibilityRole="tablist">
        {SLIDES.map((_, i) => {
          const isActive = i === currentIndex;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: isActive ? 20 : 8,
                  opacity: isActive ? 1 : 0.3,
                  backgroundColor: colors.primary,
                },
              ]}
              accessible={true}
              accessibilityRole="tab"
              accessibilityLabel={`Step ${i + 1} of ${SLIDES.length}${isActive ? ', current' : ''}`}
              accessibilityState={{ selected: isActive }}
            />
          );
        })}
      </View>

      {/* Slide content — index-based, no FlatList */}
      {/* On web, PanResponder blocks pointer events across the whole node;   */}
      {/* use pointerEvents="box-none" so the View itself never consumes      */}
      {/* clicks while children (text) remain interactive.                   */}
      <View
        style={styles.slideArea}
        {...(reduceMotion || Platform.OS === 'web' ? {} : panResponder.panHandlers)}
        pointerEvents={Platform.OS === 'web' ? 'box-none' : 'auto'}
        accessible={false}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          {currentIndex === 0
            ? <Image
                source={require('../../assets/icon.png')}
                style={{ width: 80, height: 80, borderRadius: 20 }}
                accessibilityElementsHidden={true}
              />
            : <Text style={styles.slideEmoji} accessibilityElementsHidden={true}>
                {slide.icon}
              </Text>
          }
        </View>
        <Text
          style={[styles.slideTitle, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={1.3}
          accessibilityRole="header"
        >
          {slide.title}
        </Text>
        <Text
          style={[styles.slideBody, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.3}
        >
          {slide.body}
        </Text>
      </View>

      {/* Bottom buttons */}
      <View style={styles.btnArea}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }, finishing && styles.btnDisabled]}
          onPress={handleNext}
          disabled={finishing}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started with Mend' : `Next, step ${currentIndex + 2} of ${SLIDES.length}`}
          accessibilityState={{ disabled: finishing, busy: finishing }}
        >
          {finishing
            ? <ActivityIndicator color={colors.textInverse} />
            : <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>
                {isLast ? 'Get Started' : 'Next'}
              </Text>
          }
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={handleFinish}
            disabled={finishing}
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial and go to the app"
          >
            <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    height: 48,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  slideArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  slideEmoji: {
    fontSize: 64,
    lineHeight: 76,
  },
  slideTitle: {
    ...Typography.h1,
    textAlign: 'center',
    maxWidth: 300,
  },
  slideBody: {
    ...Typography.body,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 24,
  },
  btnArea: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  primaryBtn: {
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    ...Typography.button,
  },
  skipBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH,
  },
  skipText: {
    ...Typography.body,
  },
});
