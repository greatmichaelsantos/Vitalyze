import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, Animated, StatusBar, SafeAreaView, ActivityIndicator, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../utils/colors';
import { Typography, Spacing, Radius, MIN_TOUCH, STORAGE_KEYS } from '../../utils/constants';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { useTheme } from '../../context/ThemeContext';

const gcLogo  = require('../../assets/gc-logo.png');
const ccsLogo = require('../../assets/ccs-logo.png');

const { width: SCREEN_W } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: 'pulse',
    iconBg: Colors.primaryLight,
    iconColor: Colors.primary,
    title: 'Welcome to Mend',
    subtitle:
      'Your personal health companion. Track how you feel every day and discover patterns that matter for your long-term wellbeing.',
  },
  {
    id: '2',
    icon: 'analytics',
    iconBg: Colors.physicalLight,
    iconColor: Colors.physical,
    title: 'Your Health Connection Map',
    subtitle:
      'Each check-in builds a personal health map. The app connects your mood, sleep, diet, and activity to spot health patterns before they escalate.',
  },
  {
    id: '3',
    icon: 'notifications',
    iconBg: Colors.mentalLight,
    iconColor: Colors.mental,
    title: 'Real-Time Health Alerts',
    subtitle:
      'Receive personalised wellness alerts and actionable suggestions. Your data is private, secure, and only visible to you.',
  },
];

export default function OnboardingScreen({ navigation }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finishing,    setFinishing]    = useState(false);
  const flatListRef  = useRef(null);
  const scrollX      = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const { isDark }   = useTheme();

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    if (finishing) return; // prevent double-tap
    setFinishing(true);
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
    navigation.replace('Auth');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* Skip button */}
      <View style={styles.skipRow}>
        {currentIndex < SLIDES.length - 1 ? (
          <TouchableOpacity
            onPress={handleFinish}
            style={styles.skipBtn}
            accessibilityLabel="Skip introduction and go to sign in"
            accessibilityRole="button"
            accessibilityHint="Takes you directly to the login screen"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : <View />}
      </View>

      {/* Institutional branding — fixed above slides */}
      <View style={styles.brandRow}>
        <View style={[styles.logoClip, isDark && { backgroundColor: 'white' }]}>
          <Image source={gcLogo}  style={styles.logo} resizeMode="contain" />
        </View>
        <View style={[styles.logoClip, isDark && { backgroundColor: 'white' }]}>
          <Image source={ccsLogo} style={styles.logo} resizeMode="contain" />
        </View>
      </View>
      <Text style={styles.brandText}>Gordon College • College of Computer Studies</Text>

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
          useNativeDriver: false,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: SCREEN_W }]}>
            <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
              <Ionicons name={item.icon} size={64} color={item.iconColor} />
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      {/* Dot indicators */}
      <View style={styles.dots} accessibilityRole="tablist">
        {SLIDES.map((_, i) => {
          const isActive   = i === currentIndex;
          const inputRange = [(i - 1) * SCREEN_W, i * SCREEN_W, (i + 1) * SCREEN_W];

          // When reduce motion is on, skip interpolated width/opacity —
          // use static values so no animation runs at all.
          const dotWidth = reduceMotion
            ? (isActive ? 24 : 8)
            : scrollX.interpolate({
                inputRange,
                outputRange: [8, 24, 8],
                extrapolate: 'clamp',
              });
          const opacity = reduceMotion
            ? (isActive ? 1 : 0.3)
            : scrollX.interpolate({
                inputRange,
                outputRange: [0.3, 1, 0.3],
                extrapolate: 'clamp',
              });

          return (
            <Animated.View
              key={i}
              style={[styles.dot, { width: dotWidth, opacity }]}
              accessible={true}
              accessibilityRole="tab"
              accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}${isActive ? ', active' : ''}`}
              accessibilityState={{ selected: isActive }}
            />
          );
        })}
      </View>

      {/* CTA button */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={[styles.nextBtn, finishing && { opacity: 0.7 }]}
          onPress={handleNext}
          disabled={finishing}
          accessibilityLabel={currentIndex === SLIDES.length - 1 ? 'Get started with Mend' : `Next, slide ${currentIndex + 2} of ${SLIDES.length}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: finishing }}
        >
          {finishing ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <>
              <Text style={styles.nextBtnText}>
                {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
              </Text>
              <Ionicons
                name={currentIndex === SLIDES.length - 1 ? 'checkmark' : 'arrow-forward'}
                size={20}
                color={Colors.textInverse}
              />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  skipRow: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    alignItems: 'flex-end',
    height: 52,
  },
  skipBtn: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  skipText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  slide: {
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.sm,
  },
  logoClip: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  logo: {
    width: 50,
    height: 50,
  },
  brandText: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  slideTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  slideSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  btnRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  nextBtnText: {
    ...Typography.button,
    color: Colors.textInverse,
  },
});
