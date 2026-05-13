import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Typography, Spacing, Radius, MIN_TOUCH, COLLECTIONS } from '../../utils/constants';

const SERIOUSNESS_OPTIONS = [
  'Just exploring',
  'Casually',
  'Seriously',
  'This is a priority for me',
];

const CHALLENGE_OPTIONS = [
  'Sleep',
  'Stress',
  'Physical Health',
  'Mental Health',
];

export default function WellnessIntentScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [wellnessIntent,   setWellnessIntent]   = useState('');
  const [seriousnessLevel, setSeriousnessLevel] = useState(null);
  const [biggestChallenge, setBiggestChallenge] = useState(null);
  const [loading,          setLoading]          = useState(false);

  const goToMain = () => navigation.replace('Main');

  const handleContinue = async () => {
    setLoading(true);
    try {
      const data = {};
      if (wellnessIntent.trim())  data.wellnessIntent   = wellnessIntent.trim();
      if (seriousnessLevel)       data.seriousnessLevel = seriousnessLevel;
      if (biggestChallenge)       data.biggestChallenge = biggestChallenge;

      if (Object.keys(data).length > 0) {
        await setDoc(doc(db, COLLECTIONS.USERS, user.uid), data, { merge: true });
      }
    } catch (_) {
      // non-fatal — navigate regardless
    } finally {
      setLoading(false);
      goToMain();
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerWrap}>
            <Text style={styles.screenTitle}>One Last Thing</Text>
            <Text style={styles.screenSubtitle}>Help us personalize your experience</Text>
          </View>

          <View style={styles.card}>
            {/* Q1 — open text */}
            <View style={styles.fieldGroup}>
              <TextInput
                style={[
                  styles.textArea,
                  { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.borderLight },
                ]}
                placeholder="What brings you to Mend? Tell us a little about your wellness goals and what you hope to achieve."
                placeholderTextColor={colors.textTertiary}
                value={wellnessIntent}
                onChangeText={setWellnessIntent}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            {/* Q2 — seriousness level */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>How seriously are you planning to use Mend?</Text>
              <View style={styles.pillRow}>
                {SERIOUSNESS_OPTIONS.map((opt) => {
                  const active = seriousnessLevel === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.pill,
                        active
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: 'transparent', borderColor: colors.border },
                      ]}
                      onPress={() => setSeriousnessLevel(active ? null : opt)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.pillText, { color: active ? colors.textInverse : colors.textSecondary }]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Q3 — biggest challenge */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>What is your biggest wellness challenge right now?</Text>
              <View style={styles.pillRow}>
                {CHALLENGE_OPTIONS.map((opt) => {
                  const active = biggestChallenge === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.pill,
                        active
                          ? { backgroundColor: colors.primary, borderColor: colors.primary }
                          : { backgroundColor: 'transparent', borderColor: colors.border },
                      ]}
                      onPress={() => setBiggestChallenge(active ? null : opt)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.pillText, { color: active ? colors.textInverse : colors.textSecondary }]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
            onPress={handleContinue}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Save and continue to the app"
          >
            {loading
              ? <ActivityIndicator color={colors.textInverse} />
              : <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Continue</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipBtn}
            onPress={goToMain}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
          >
            <Text style={[styles.skipText, { color: colors.textTertiary }]}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c) => StyleSheet.create({
  safe:  { flex: 1, backgroundColor: c.background },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  headerWrap:     { gap: Spacing.xs },
  screenTitle:    { ...Typography.h1, color: c.textPrimary },
  screenSubtitle: { ...Typography.body, color: c.textSecondary },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.lg,
  },
  fieldGroup: { gap: Spacing.sm },
  label:      { ...Typography.label, color: c.textPrimary },
  textArea: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    ...Typography.body,
    minHeight: 120,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  pillText:       { ...Typography.bodySmall, fontWeight: '500' },
  primaryBtn: {
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { ...Typography.button },
  skipBtn: {
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  skipText: { ...Typography.body },
});
