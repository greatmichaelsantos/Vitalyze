// ============================================================
// CHECK-IN SCREEN — 4-Step Wizard
// ============================================================

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, StatusBar, SafeAreaView, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { db } from '../../../firebase';
import { saveCheckIn, queueOfflineCheckIn } from '../../services/firestoreService';
import { notifyForAlerts } from '../../services/notificationService';
import { getScoreColor, getRiskColor, getRiskBgColor } from '../../utils/colors';
import {
  Typography, Spacing, Radius, MIN_TOUCH,
  MOOD_OPTIONS, EXERCISE_TYPES, SYMPTOM_OPTIONS,
  EATING_HABITS, SLEEP_QUALITY,
} from '../../utils/constants';
import HealthScoreRing from '../../components/HealthScoreRing';
import InsightCard from '../../components/InsightCard';
import SuggestionCard from '../../components/SuggestionCard';
import AlertCard from '../../components/AlertCard';

const TOTAL_STEPS = 5;

const DEFAULT_FORM = {
  mood: 3, stress: 3, anxiety: 3, loneliness: 3, motivation: 3,
  sleep: 7, sleepQuality: 3, exercise: 'none', water: 4, symptoms: [],
  meals: 3, coffee: 0, energyDrinks: 0, alcohol: 0, eatingHabits: [],
  mealDetails: [],
};

export default function CheckInScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const reduceMotion       = useReduceMotion();
  const styles             = useMemo(() => makeStyles(colors), [colors]);

  const [step,    setStep]    = useState(1);
  const [form,    setForm]    = useState({ ...DEFAULT_FORM });
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const progress = useRef(new Animated.Value(1 / TOTAL_STEPS)).current;

  // Reset mealDetails every time this screen comes into focus so slots never
  // carry over from a previous check-in session.
  useFocusEffect(
    useCallback(() => {
      setForm((f) => ({ ...f, mealDetails: [] }));
    }, [])
  );

  const animateProgress = (nextStep) => {
    if (reduceMotion) {
      // Instant update — no spring when reduce motion is on
      progress.setValue(nextStep / TOTAL_STEPS);
    } else {
      Animated.spring(progress, { toValue: nextStep / TOTAL_STEPS, useNativeDriver: false }).start();
    }
  };

  const goNext = () => {
    const next = step + 1;
    if (next <= TOTAL_STEPS) { setStep(next); animateProgress(next); }
  };

  const goBack = () => {
    if (step > 1) {
      // Clear meal slots when leaving the meal step so they regenerate fresh
      // if the user changes the meal count in step 3.
      if (step === 4) setForm((f) => ({ ...f, mealDetails: [] }));
      const prev = step - 1;
      setStep(prev);
      animateProgress(prev);
    }
  };

  const handleSubmit = async (overrideMealDetails) => {
    setLoading(true);
    const submitForm = overrideMealDetails !== undefined
      ? { ...form, mealDetails: overrideMealDetails }
      : form;
    try {
      const data = await saveCheckIn(user.uid, submitForm);
      setResult(data.analysis);
      setStep(5);
      animateProgress(5);
      if (data.analysis.alerts?.length > 0) await notifyForAlerts(data.analysis.alerts);
      // Update circle member doc if user is in a circle
      try {
        const circleId = await AsyncStorage.getItem(`circle_id_${user.uid}`);
        if (circleId) {
          const lastCheckInData = {
            mood:         submitForm.mood         ?? null,
            stress:       submitForm.stress       ?? null,
            anxiety:      submitForm.anxiety      ?? null,
            loneliness:   submitForm.loneliness   ?? null,
            motivation:   submitForm.motivation   ?? null,
            sleep:        submitForm.sleep        ?? null,
            sleepQuality: submitForm.sleepQuality ?? null,
            exercise:     submitForm.exercise     ?? null,
            water:        submitForm.water        ?? null,
            coffee:       submitForm.coffee       ?? null,
            energyDrinks: submitForm.energyDrinks ?? null,
            alcohol:      submitForm.alcohol      ?? null,
            eatingHabits: submitForm.eatingHabits ?? null,
            mealDetails:  submitForm.mealDetails  ?? [],
          };
          await setDoc(
            doc(db, 'circleMembers', circleId, 'members', user.uid),
            {
              displayName:     user.displayName || user.email?.split('@')[0] || 'User',
              latestScores: {
                overall:  data.analysis.overallScore,
                physical: data.analysis.physicalScore,
                mental:   data.analysis.mentalScore,
              },
              latestRiskLevel: data.analysis.riskLevel,
              lastCheckedIn:   new Date(),
              lastCheckInData,
            },
            { merge: true }
          );
        }
      } catch (circleErr) {
        console.warn('CheckIn: failed to update circle member doc', circleErr);
      }
    } catch {
      try {
        await queueOfflineCheckIn(form);
        Alert.alert(
          'Saved Offline',
          'You appear to be offline. Your check-in has been saved and will sync when you reconnect.',
          [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
        );
      } catch {
        Alert.alert('Error', 'Could not save your check-in. Please try again.');
      }
    } finally {
      setLoading(false);
      setForm((f) => ({ ...f, mealDetails: [] }));
    }
  };

  const resetCheckIn = () => {
    setForm({ ...DEFAULT_FORM });
    setResult(null);
    setStep(1);
    animateProgress(1);
  };

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        {step < 5 ? (
          <TouchableOpacity onPress={step > 1 ? goBack : () => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.headerTitle}>{step < 5 ? `Step ${step} of 4` : 'Your Insights'}</Text>
        <View style={styles.backBtn} />
      </View>

      {step < 5 && (
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: colors.primary }]} />
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && <Step1 form={form} setForm={setForm} colors={colors} />}
        {step === 2 && <Step2 form={form} setForm={setForm} colors={colors} />}
        {step === 3 && <Step3 form={form} setForm={setForm} colors={colors} />}
        {step === 4 && <MealDetailStep form={form} setForm={setForm} colors={colors} />}
        {step === 5 && <Step5 result={result} onReset={resetCheckIn} navigation={navigation} colors={colors} />}
      </ScrollView>

      {step < 5 && (
        <View style={styles.footer}>
          {step < 4 ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={goNext} accessibilityRole="button">
              <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
            </TouchableOpacity>
          ) : (
            <View style={styles.skipDoneRow}>
              <TouchableOpacity
                style={[styles.skipBtn, { borderColor: colors.border }, loading && styles.btnDisabled]}
                onPress={() => handleSubmit([])}
                disabled={loading}
                accessibilityRole="button"
              >
                <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={() => handleSubmit()}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color={colors.textInverse} />
                  : <>
                      <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Done</Text>
                      <Ionicons name="sparkles" size={18} color={colors.textInverse} />
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Step 1 — Mood & Mental Health ───────────────────────────
function Step1({ form, setForm, colors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.title,    { color: colors.textPrimary }]}>Mood & Mental Health</Text>
      <Text style={[stepStyles.subtitle, { color: colors.textSecondary }]}>How are you feeling today, emotionally and mentally?</Text>

      <SectionLabel label="Overall Mood" colors={colors} />
      <View style={stepStyles.moodRow} accessibilityRole="radiogroup" accessibilityLabel="Select your overall mood">
        {MOOD_OPTIONS.map((m) => {
          const selected = form.mood === m.value;
          return (
            <TouchableOpacity
              key={m.value}
              style={[
                stepStyles.moodBtn,
                { borderColor: colors.border, backgroundColor: colors.surface },
                selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
              ]}
              onPress={() => set('mood', m.value)}
              accessibilityRole="radio"
              accessibilityLabel={`${m.label} mood`}
              accessibilityState={{ checked: selected }}
            >
              <Text style={stepStyles.moodEmoji} importantForAccessibility="no">{m.emoji}</Text>
              <Text
                style={[stepStyles.moodLabel, { color: selected ? colors.primaryContrast : colors.textSecondary },
                  selected && { fontWeight: '600' }]}
                maxFontSizeMultiplier={1.3}
                importantForAccessibility="no"
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Scale label="Stress Level"   sublabel="1 = very calm, 5 = very stressed" value={form.stress}     onChange={(v) => set('stress',     v)} inverted colors={colors} />
      <Scale label="Anxiety Level"  sublabel="1 = none, 5 = severe"             value={form.anxiety}    onChange={(v) => set('anxiety',    v)} inverted colors={colors} />
      <Scale label="Loneliness"     sublabel="1 = connected, 5 = very lonely"   value={form.loneliness} onChange={(v) => set('loneliness', v)} inverted colors={colors} />
      <Scale label="Motivation"     sublabel="1 = very low, 5 = high"           value={form.motivation} onChange={(v) => set('motivation', v)} colors={colors} />
    </View>
  );
}

// ─── Step 2 — Sleep & Physical Activity ──────────────────────
function Step2({ form, setForm, colors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const toggleSymptom = (sym) => setForm((f) => ({
    ...f,
    symptoms: f.symptoms.includes(sym) ? f.symptoms.filter((s) => s !== sym) : [...f.symptoms, sym],
  }));

  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.title,    { color: colors.textPrimary }]}>Sleep & Physical Activity</Text>
      <Text style={[stepStyles.subtitle, { color: colors.textSecondary }]}>Tell us about your sleep and body today.</Text>

      <SectionLabel label="Hours of Sleep" colors={colors} />
      <Stepper value={form.sleep} min={0} max={12} step={0.5} unit="hrs" onChange={(v) => set('sleep', v)} colors={colors} />

      <SectionLabel label="Sleep Quality" colors={colors} />
      <View style={stepStyles.chipRow}>
        {SLEEP_QUALITY.map((q) => (
          <Chip key={q.value} label={q.label} active={form.sleepQuality === q.value} onPress={() => set('sleepQuality', q.value)} colors={colors} />
        ))}
      </View>

      <SectionLabel label="Exercise Today" colors={colors} />
      <View style={stepStyles.chipRow}>
        {EXERCISE_TYPES.map((e) => (
          <Chip key={e.value} label={e.label} active={form.exercise === e.value} onPress={() => set('exercise', e.value)} colors={colors} />
        ))}
      </View>

      <SectionLabel label="Water Intake (glasses)" colors={colors} />
      <Stepper value={form.water} min={0} max={15} step={1} unit="glasses" onChange={(v) => set('water', v)} colors={colors} />

      <SectionLabel label="Physical Symptoms (select all that apply)" colors={colors} />
      <View style={stepStyles.chipRow}>
        {SYMPTOM_OPTIONS.map((s) => (
          <Chip key={s.value} label={s.label} active={form.symptoms.includes(s.value)} onPress={() => toggleSymptom(s.value)} multiSelect colors={colors} />
        ))}
        <Chip label="None" active={form.symptoms.length === 0} onPress={() => set('symptoms', [])} colors={colors} />
      </View>
    </View>
  );
}

// ─── Step 3 — Diet & Substances ──────────────────────────────
function Step3({ form, setForm, colors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const toggleHabit = (h) => setForm((f) => ({
    ...f,
    eatingHabits: f.eatingHabits.includes(h) ? f.eatingHabits.filter((x) => x !== h) : [...f.eatingHabits, h],
  }));

  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.title,    { color: colors.textPrimary }]}>Diet & Substances</Text>
      <Text style={[stepStyles.subtitle, { color: colors.textSecondary }]}>Help us understand your nutrition and substance intake today.</Text>

      <SectionLabel label="Meals Eaten Today"          colors={colors} />
      <Stepper value={form.meals}        min={0} max={6}  step={1} unit="meals"  onChange={(v) => set('meals',        v)} colors={colors} />
      <SectionLabel label="Coffee (cups)"              colors={colors} />
      <Stepper value={form.coffee}       min={0} max={10} step={1} unit="cups"   onChange={(v) => set('coffee',       v)} colors={colors} />
      <SectionLabel label="Energy Drinks (cans)"       colors={colors} />
      <Stepper value={form.energyDrinks} min={0} max={6}  step={1} unit="cans"   onChange={(v) => set('energyDrinks', v)} colors={colors} />
      <SectionLabel label="Alcohol (standard drinks)"  colors={colors} />
      <Stepper value={form.alcohol}      min={0} max={10} step={1} unit="drinks" onChange={(v) => set('alcohol',      v)} colors={colors} />

      <SectionLabel label="Eating Habits (select all that apply)" colors={colors} />
      <View style={stepStyles.chipRow}>
        {EATING_HABITS.map((h) => (
          <Chip key={h.value} label={h.label} active={form.eatingHabits.includes(h.value)} onPress={() => toggleHabit(h.value)} multiSelect colors={colors} />
        ))}
      </View>
    </View>
  );
}

// ─── Step 4 — Meal Detail (optional) ─────────────────────────
const MEAL_TYPES = ['Snack', 'Light', 'Regular', 'Heavy'];

function MealDetailStep({ form, setForm, colors }) {
  const [slots, setSlots] = useState(() => {
    const count = Math.min(Math.max(form.meals, 1), 6);
    return Array.from({ length: count }, (_, i) => ({ slot: i + 1, description: '', type: 'Regular' }));
  });

  const updateSlot = (index, key, value) => {
    const updated = slots.map((s, i) => i === index ? { ...s, [key]: value } : s);
    setSlots(updated);
    setForm((f) => ({ ...f, mealDetails: updated }));
  };

  const addMeal = () => {
    if (slots.length >= 6) return;
    const newSlot = { slot: slots.length + 1, description: '', type: 'Regular' };
    const updated = [...slots, newSlot];
    setSlots(updated);
    setForm((f) => ({ ...f, mealDetails: updated }));
  };

  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.title,    { color: colors.textPrimary }]}>What did you eat today?</Text>
      <Text style={[stepStyles.subtitle, { color: colors.textSecondary }]}>Optional — log your meals for better nutrition insights.</Text>

      {slots.map((slot, index) => (
        <View key={index} style={[mealStyles.slotCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[mealStyles.slotLabel, { color: colors.textSecondary }]}>Meal {slot.slot}</Text>
          <TextInput
            style={[mealStyles.slotInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background }]}
            value={slot.description}
            onChangeText={(v) => updateSlot(index, 'description', v)}
            placeholder="e.g. rice and salad, burger, coffee…"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
          />
          <View style={stepStyles.chipRow}>
            {MEAL_TYPES.map((type) => (
              <Chip key={type} label={type} active={slot.type === type} onPress={() => updateSlot(index, 'type', type)} colors={colors} />
            ))}
          </View>
        </View>
      ))}

      {slots.length < 6 && (
        <TouchableOpacity
          style={[mealStyles.addBtn, { borderColor: colors.border }]}
          onPress={addMeal}
          accessibilityRole="button"
          accessibilityLabel="Add another meal"
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={[mealStyles.addBtnText, { color: colors.primary }]}>Add another meal</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Step 5 — Insights ───────────────────────────────────────
function Step5({ result, onReset, navigation, colors }) {
  if (!result) {
    return (
      <View style={s4Styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[s4Styles.loadingText, { color: colors.textSecondary }]}>Analysing your health data…</Text>
      </View>
    );
  }

  const { overallScore, physicalScore, mentalScore, riskLevel, patterns, suggestions, alerts } = result;

  return (
    <View style={s4Styles.wrap}>
      <Text style={[s4Styles.title,    { color: colors.textPrimary }]}>Your Health Insights</Text>
      <Text style={[s4Styles.subtitle, { color: colors.textSecondary }]}>Here is what the AI detected from today's check-in.</Text>

      <View style={[s4Styles.scoreRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <HealthScoreRing score={overallScore}  label="Overall"  size={110} strokeWidth={11} />
        <HealthScoreRing score={physicalScore} label="Physical" size={90}  strokeWidth={9} />
        <HealthScoreRing score={mentalScore}   label="Mental"   size={90}  strokeWidth={9} />
      </View>

      <View style={[s4Styles.riskBadge, {
        backgroundColor: getRiskBgColor(riskLevel?.toLowerCase(), colors),
        borderColor:     getRiskColor(riskLevel?.toLowerCase()),
      }]}>
        <Text style={[s4Styles.riskText, { color: getRiskColor(riskLevel?.toLowerCase()) }]}>
          {riskLevel} Risk
        </Text>
      </View>

      {alerts?.length > 0 && (
        <>
          <Text style={[s4Styles.sectionTitle, { color: colors.textPrimary }]}>Health Alerts</Text>
          {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
        </>
      )}
      {patterns?.length > 0 && (
        <>
          <Text style={[s4Styles.sectionTitle, { color: colors.textPrimary }]}>Detected Patterns</Text>
          {patterns.map((p) => <InsightCard key={p.id} pattern={p} />)}
        </>
      )}
      {suggestions?.length > 0 && (
        <>
          <Text style={[s4Styles.sectionTitle, { color: colors.textPrimary }]}>Personalised Suggestions</Text>
          {suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
        </>
      )}

      <TouchableOpacity
        style={[s4Styles.homeBtn, { backgroundColor: colors.primary }]}
        onPress={() => navigation.navigate('Home')}
        accessibilityRole="button"
      >
        <Text style={[s4Styles.homeBtnText, { color: colors.textInverse }]}>Go to Dashboard</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s4Styles.resetBtn, { borderColor: colors.border }]}
        onPress={onReset}
        accessibilityRole="button"
      >
        <Text style={[s4Styles.resetBtnText, { color: colors.textSecondary }]}>Start New Check-in</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────
function SectionLabel({ label, colors }) {
  return <Text style={[sharedStyles.sectionLabel, { color: colors.textPrimary }]}>{label}</Text>;
}

function Scale({ label, sublabel, value, onChange, inverted = false, colors }) {
  const options = [1, 2, 3, 4, 5];
  return (
    <View style={sharedStyles.scaleWrap}>
      <View style={sharedStyles.scaleLabelRow}>
        <Text style={[sharedStyles.scaleLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[sharedStyles.scaleSub,   { color: colors.textTertiary }]}>{sublabel}</Text>
      </View>
      <View style={sharedStyles.scaleOptions} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const active      = value === o;
          const activeColor = inverted
            ? (o >= 4 ? '#EF4444' : o === 3 ? '#F59E0B' : '#22C55E')
            : (o <= 2 ? '#EF4444' : o === 3 ? '#F59E0B' : '#22C55E');
          return (
            <TouchableOpacity
              key={o}
              style={[
                sharedStyles.scaleBtn,
                { borderColor: colors.border, backgroundColor: colors.surface },
                active && { backgroundColor: activeColor, borderColor: activeColor },
              ]}
              onPress={() => onChange(o)}
              accessibilityRole="radio"
              accessibilityLabel={`${o} — ${label}`}
              accessibilityState={{ checked: active }}
            >
              <Text
                style={[sharedStyles.scaleBtnText, { color: colors.textSecondary }, active && { color: '#fff' }]}
                maxFontSizeMultiplier={1.3}
              >
                {o}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Stepper({ value, min, max, step = 1, unit, onChange, colors }) {
  const decrement = () => { if (value - step >= min) onChange(+(value - step).toFixed(1)); };
  const increment = () => { if (value + step <= max) onChange(+(value + step).toFixed(1)); };
  return (
    <View style={[sharedStyles.stepperWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity style={sharedStyles.stepperBtn} onPress={decrement} disabled={value <= min}>
        <Ionicons name="remove" size={22} color={value <= min ? colors.textTertiary : colors.primary} />
      </TouchableOpacity>
      <View style={sharedStyles.stepperVal}>
        <Text style={[sharedStyles.stepperNum,  { color: colors.textPrimary }]}>{value}</Text>
        <Text style={[sharedStyles.stepperUnit, { color: colors.textSecondary }]}>{unit}</Text>
      </View>
      <TouchableOpacity style={sharedStyles.stepperBtn} onPress={increment} disabled={value >= max}>
        <Ionicons name="add" size={22} color={value >= max ? colors.textTertiary : colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

function Chip({ label, active, onPress, multiSelect, colors }) {
  return (
    <TouchableOpacity
      style={[
        sharedStyles.chip,
        { borderColor: colors.border, backgroundColor: colors.surface },
        active && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
      ]}
      onPress={onPress}
      accessibilityRole={multiSelect ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
    >
      {active && <Ionicons name="checkmark" size={12} color={colors.primaryContrast} />}
      <Text style={[sharedStyles.chipText, { color: active ? colors.primaryContrast : colors.textSecondary },
        active && { fontWeight: '600' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  headerTitle:   { ...Typography.h4, color: c.textPrimary },
  backBtn:       { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { height: 4, marginHorizontal: Spacing.lg, borderRadius: Radius.full, overflow: 'hidden', marginBottom: Spacing.sm },
  progressFill:  { height: '100%', borderRadius: Radius.full },
  footer:        { padding: Spacing.lg, paddingBottom: Spacing.lg },
  primaryBtn: {
    backgroundColor: c.primary, borderRadius: Radius.full, height: 54,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  btnDisabled:    { opacity: 0.7 },
  primaryBtnText: { ...Typography.button },
  skipDoneRow:  { flexDirection: 'row', gap: Spacing.sm },
  skipBtn:      { flex: 1, borderRadius: Radius.full, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  skipBtnText:  { ...Typography.button },
  doneBtn:      { flex: 2, borderRadius: Radius.full, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
});

const stepStyles = StyleSheet.create({
  wrap:     { gap: Spacing.sm },
  title:    { ...Typography.h2 },
  subtitle: { ...Typography.body, marginBottom: Spacing.sm },
  moodRow:  { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  moodBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 2, gap: 4, minHeight: MIN_TOUCH + 16,
  },
  moodEmoji: { fontSize: 24 },
  moodLabel: { ...Typography.caption, textAlign: 'center' },
  chipRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

const sharedStyles = StyleSheet.create({
  sectionLabel:  { ...Typography.label, marginTop: Spacing.sm },
  scaleWrap:     { gap: Spacing.xs },
  scaleLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scaleLabel:    { ...Typography.label },
  scaleSub:      { ...Typography.caption },
  scaleOptions:  { flexDirection: 'row', gap: 8 },
  scaleBtn: {
    flex: 1, height: MIN_TOUCH, borderRadius: Radius.md, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  scaleBtnText:  { ...Typography.h4 },
  stepperWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.md, borderWidth: 1,
    padding: Spacing.xs, alignSelf: 'flex-start', minWidth: 180,
  },
  stepperBtn:  { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  stepperVal:  { flex: 1, alignItems: 'center', gap: 2 },
  stepperNum:  { ...Typography.h3 },
  stepperUnit: { ...Typography.caption },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full, borderWidth: 1.5,
    minHeight: MIN_TOUCH - 4,
  },
  chipText: { ...Typography.label },
});

const mealStyles = StyleSheet.create({
  slotCard: {
    borderRadius: Radius.md, borderWidth: 1,
    padding: Spacing.md, gap: Spacing.sm,
  },
  slotLabel: { ...Typography.label },
  slotInput: {
    borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    ...Typography.body, minHeight: MIN_TOUCH,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.md,
    height: MIN_TOUCH, borderStyle: 'dashed',
  },
  addBtnText: { ...Typography.label },
});

const s4Styles = StyleSheet.create({
  wrap:         { gap: Spacing.md, paddingBottom: Spacing.xl },
  title:        { ...Typography.h2 },
  subtitle:     { ...Typography.body },
  sectionTitle: { ...Typography.h4, marginTop: Spacing.xs },
  scoreRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1,
  },
  riskBadge: {
    alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  riskText:     { ...Typography.label, fontWeight: '700' },
  homeBtn:      { borderRadius: Radius.full, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  homeBtnText:  { ...Typography.button },
  resetBtn:     { borderRadius: Radius.full, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  resetBtnText: { ...Typography.button },
  loading:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: 80 },
  loadingText:  { ...Typography.body },
});
