import React, { useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  SafeAreaView, StatusBar, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';

// ── Content ──────────────────────────────────────────────────────────────────

const LAST_UPDATED = 'April 2026';
const VERSION      = '1.0';

const SUMMARY_POINTS = [
  'We collect health info like your mood, sleep, and activity during daily check-ins.',
  'Your data is kept private and is never sold or shared with anyone.',
  'The AI health scores and tips are not medical advice — always see a real doctor for health concerns.',
  'You can delete your account and all your data at any time from the Profile screen.',
  'Mend is completely free to use.',
];

const SECTIONS = [
  {
    title: 'What is Mend?',
    body: `Mend is a free app that helps you keep track of how you are feeling every day. You do a quick check-in and the app shows you a health score along with simple tips to feel better. It was built as a school project to help people learn more about their own wellbeing.`,
  },
  {
    title: 'What information do we collect?',
    body: `When you do a daily check-in, we collect:\n\n• Your mood\n• How many hours you slept and how well you slept\n• Whether you exercised and what type\n• What you ate and how much water you drank\n• Any physical symptoms like headaches or tiredness\n\nWe only collect what you choose to enter. You are always in control.`,
  },
  {
    title: 'How do we use your information?',
    body: `We use your check-in answers to calculate your personal health score and to suggest small things you can do to feel better. That is the only reason we collect your data. We never use it for ads, research, or anything else.`,
  },
  {
    title: 'Is my data private?',
    body: `Yes. Your data belongs to you and only you. We store it securely using Google Firebase (a trusted cloud storage service). We will never sell, share, or give your data to any other person or company. Only you can see your health information when you are logged in.`,
  },
  {
    title: 'About the AI health insights',
    body: `The health scores and tips in Mend are made by a computer program (an algorithm). They are based only on what you tell the app each day.\n\nThey are NOT medical advice. Please do not use them to treat, diagnose, or manage any illness. If you are worried about your health, talk to a real doctor. In an emergency, call your local emergency number right away — do not rely on this app.`,
  },
  {
    title: 'Your rights',
    body: `You are always in control of your account. You can:\n\n• Edit your name and change your password at any time from the Profile screen\n• Delete your account at any time — this will permanently erase all of your data, with no way to recover it\n• Stop using the app at any time with no penalty\n\nWe do not lock you in. Leaving is always easy.`,
  },
  {
    title: 'Changes to these terms',
    body: `Sometimes we may update these terms. When we do, the new version will appear in the app straight away. We will let you know when something important changes. If you keep using the app after a change, that means you are okay with the new terms.`,
  },
  {
    title: 'Questions?',
    body: `If you have any questions about these terms or your data, please email us at support@vitalyze.app. We are happy to help.\n\nThese terms are effective as of ${LAST_UPDATED} (Version ${VERSION}).`,
  },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TermsAndConditionsScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef(null);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} accessibilityRole="header">
          Terms and Conditions
        </Text>
        {/* Right spacer keeps title centred */}
        <View style={styles.backBtn} />
      </View>

      {/* ── Body ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro banner */}
        <View style={[styles.introBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primaryContrast} />
          <Text style={[styles.introText, { color: colors.primaryContrast }]} maxFontSizeMultiplier={1.5}>
            These terms explain how Mend works and what you are agreeing to.
          </Text>
        </View>

        {/* Plain-English summary card */}
        <View style={[styles.summaryCard, { backgroundColor: isDark ? '#2D1F66' : '#EDE9FF', borderColor: '#6C47FF' }]}>
          <Text style={[styles.summaryHeading, { color: isDark ? '#C4B5FD' : '#4B2EC1' }]} maxFontSizeMultiplier={1.3}>
            Here is what you are agreeing to — in plain English
          </Text>
          {SUMMARY_POINTS.map((point) => (
            <View key={point} style={styles.summaryRow}>
              <Text style={[styles.summaryBullet, { color: '#6C47FF' }]}>•</Text>
              <Text style={[styles.summaryPoint, { color: isDark ? '#DDD6FE' : '#3B2496' }]} maxFontSizeMultiplier={1.4}>
                {point}
              </Text>
            </View>
          ))}
        </View>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
              {section.title}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.5}>
              {section.body}
            </Text>
          </View>
        ))}

        {/* Last updated */}
        <Text style={[styles.meta, { color: colors.textTertiary }]}>
          Last updated: {LAST_UPDATED} · Version {VERSION}
        </Text>
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Close Terms and Conditions and return to registration"
        >
          <Text style={[styles.closeBtnText, { color: colors.textInverse }]}>
            Close
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn:     { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h4, flex: 1, textAlign: 'center' },

  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg },

  introBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  introText: {
    ...Typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },

  section:      { gap: Spacing.sm },
  sectionTitle: { ...Typography.h4 },
  sectionBody:  { ...Typography.body, lineHeight: 24 },

  meta: {
    ...Typography.caption,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  closeBtn: {
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { ...Typography.button },

  summaryCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryHeading: { ...Typography.h4, marginBottom: Spacing.xs },
  summaryRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
  summaryBullet:  { ...Typography.body, lineHeight: 22, fontWeight: '700' },
  summaryPoint:   { ...Typography.bodySmall, flex: 1, lineHeight: 20 },
});
