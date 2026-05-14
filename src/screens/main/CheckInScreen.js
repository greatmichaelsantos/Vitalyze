// ============================================================
// CHECK-IN SCREEN — 5-Step Wizard
// ============================================================

import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, StatusBar, SafeAreaView, ActivityIndicator, Alert, TextInput,
  Modal, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useReduceMotion } from '../../hooks/useReduceMotion';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc } from 'firebase/firestore';
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

const CRISIS_HOTLINES = [
  { label: 'Hopeline PH',         number: '8804-4673' },
  { label: 'NCMH Crisis Hotline', number: '1553' },
  { label: 'In Touch Crisis Line', number: '0917-800-8654' },
  { label: 'Text HELLO to',       number: '4673' },
];

const DEFAULT_FORM = {
  mood: 3, stress: 3, anxiety: 3, loneliness: 3, motivation: 3,
  sleep: 7, sleepQuality: 3, exercise: 'none', water: 4, symptoms: [],
  meals: 3, coffee: 0, energyDrinks: 0, alcohol: 0, eatingHabits: [],
  mealDetails: [],
  everythingStop: 'Never', betterWithout: 'Never', feelEmpty: 'Never', reasonsToKeepGoing: 'Never',
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
  const [showCrisisModal,    setShowCrisisModal]    = useState(false);
  const [openEndedResponses, setOpenEndedResponses] = useState({});
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
    if (next <= 7) {
      setStep(next);
      if (next <= TOTAL_STEPS) animateProgress(next);
    }
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

  const handleSubmit = async (responses = {}) => {
    setLoading(true);
    const submitForm = { ...form, openEndedResponses: responses };
    try {
      const data = await saveCheckIn(user.uid, submitForm);
      setResult(data.analysis);
      setStep(8);
      animateProgress(8);
      if (data.analysis.selfHarmRisk === 'medium' || data.analysis.selfHarmRisk === 'high') {
        setShowCrisisModal(true);
      }
      if (data.analysis.alerts?.length > 0) await notifyForAlerts(data.analysis.alerts);
      // Update circle member doc if user is in a circle
      try {
        const circleId = await AsyncStorage.getItem(`circle_id_${user.uid}`);
        if (circleId) {
          const lastCheckInData = {
            mood:               submitForm.mood               ?? null,
            stress:             submitForm.stress             ?? null,
            anxiety:            submitForm.anxiety            ?? null,
            loneliness:         submitForm.loneliness         ?? null,
            motivation:         submitForm.motivation         ?? null,
            sleep:              submitForm.sleep              ?? null,
            sleepQuality:       submitForm.sleepQuality       ?? null,
            exercise:           submitForm.exercise           ?? null,
            water:              submitForm.water              ?? null,
            coffee:             submitForm.coffee             ?? null,
            energyDrinks:       submitForm.energyDrinks       ?? null,
            alcohol:            submitForm.alcohol            ?? null,
            eatingHabits:       submitForm.eatingHabits       ?? null,
            mealDetails:        submitForm.mealDetails        ?? [],
            everythingStop:     submitForm.everythingStop     ?? 'Never',
            betterWithout:      submitForm.betterWithout      ?? 'Never',
            feelEmpty:          submitForm.feelEmpty          ?? 'Never',
            reasonsToKeepGoing: submitForm.reasonsToKeepGoing ?? 'Never',
          };
          const userProfileSnap = await getDoc(doc(db, 'users', user.uid));
          const photoURL = userProfileSnap.exists() ? (userProfileSnap.data().photoURL ?? null) : null;
          await setDoc(
            doc(db, 'circleMembers', circleId, 'members', user.uid),
            {
              displayName:     user.displayName || user.email?.split('@')[0] || 'User',
              ...(photoURL && { photoURL }),
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
    setShowCrisisModal(false);
    setOpenEndedResponses({});
    animateProgress(1);
  };

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.header}>
        {step < 8 ? (
          <TouchableOpacity onPress={step > 1 ? goBack : () => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <Text style={styles.headerTitle}>
          {step <= 5 ? `Step ${step} of 5` : step === 8 ? 'Your Insights' : 'Check-in'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {step <= 5 && (
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
        {step === 5 && <EmotionalPulseStep form={form} setForm={setForm} colors={colors} />}
        {step === 6 && <GoDeeperStep onSkip={() => handleSubmit({})} onYes={goNext} colors={colors} />}
        {step === 7 && <OpenEndedStep responses={openEndedResponses} setResponses={setOpenEndedResponses} colors={colors} />}
        {step === 8 && <Step5 result={result} onReset={resetCheckIn} navigation={navigation} colors={colors} />}
      </ScrollView>

      {(step <= 5 || step === 7) && (
        <View style={styles.footer}>
          {step < 4 ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={goNext} accessibilityRole="button">
              <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
            </TouchableOpacity>
          ) : step === 4 ? (
            <View style={styles.skipDoneRow}>
              <TouchableOpacity
                style={[styles.skipBtn, { borderColor: colors.border }]}
                onPress={() => { setForm((f) => ({ ...f, mealDetails: [] })); goNext(); }}
                accessibilityRole="button"
              >
                <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={goNext}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Continue</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
              </TouchableOpacity>
            </View>
          ) : step === 5 ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={goNext} accessibilityRole="button">
              <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.textInverse} />
            </TouchableOpacity>
          ) : (
            <View style={styles.skipDoneRow}>
              <TouchableOpacity
                style={[styles.skipBtn, { borderColor: colors.border }, loading && styles.btnDisabled]}
                onPress={() => handleSubmit({})}
                disabled={loading}
                accessibilityRole="button"
              >
                <Text style={[styles.skipBtnText, { color: colors.textSecondary }]}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }, loading && styles.btnDisabled]}
                onPress={() => handleSubmit(openEndedResponses)}
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

      <Modal
        visible={showCrisisModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCrisisModal(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.card, { backgroundColor: colors.mentalAccent }]}>
            <Text style={modalStyles.emoji}>💙</Text>
            <Text style={modalStyles.title}>We're Here For You</Text>
            <Text style={modalStyles.body}>
              We noticed you might be going through something difficult. You are not alone. Free and confidential support is available anytime.
            </Text>
            {CRISIS_HOTLINES.map((h, i) => (
              <React.Fragment key={h.label}>
                {i > 0 && <View style={modalStyles.divider} />}
                <TouchableOpacity
                  style={modalStyles.hotlineRow}
                  onPress={() => Linking.openURL(`tel:${h.number}`)}
                  accessibilityRole="link"
                  accessibilityLabel={`${h.label} ${h.number}`}
                >
                  <Ionicons name="call-outline" size={15} color="rgba(255,255,255,0.8)" />
                  <Text style={modalStyles.hotlineLabel} numberOfLines={1}>{h.label}</Text>
                  <Text style={modalStyles.hotlineNumber} numberOfLines={1}>{h.number}</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
            <TouchableOpacity
              style={modalStyles.closeBtn}
              onPress={() => setShowCrisisModal(false)}
              accessibilityRole="button"
            >
              <Text style={modalStyles.closeBtnText}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

// ─── Step 5 — Emotional Pulse ────────────────────────────────
const PULSE_OPTIONS         = ['Never', 'Sometimes', 'Often', 'Always'];
const PULSE_OPTIONS_REVERSE = ['Always', 'Often', 'Sometimes', 'Never'];

function EmotionalPulseStep({ form, setForm, colors }) {
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  return (
    <View style={stepStyles.wrap}>
      <Text style={[stepStyles.title,    { color: colors.textPrimary }]}>Emotional Pulse</Text>
      <Text style={[stepStyles.subtitle, { color: colors.textSecondary }]}>
        A few last questions about how you've been feeling lately.
      </Text>

      <SectionLabel label="How often do you feel like you just want everything to stop?" colors={colors} />
      <View style={stepStyles.chipRow}>
        {PULSE_OPTIONS.map((opt) => (
          <Chip key={opt} label={opt} active={form.everythingStop === opt} onPress={() => set('everythingStop', opt)} colors={colors} />
        ))}
      </View>

      <SectionLabel label="Do you find yourself thinking that others would be better off without you?" colors={colors} />
      <View style={stepStyles.chipRow}>
        {PULSE_OPTIONS.map((opt) => (
          <Chip key={opt} label={opt} active={form.betterWithout === opt} onPress={() => set('betterWithout', opt)} colors={colors} />
        ))}
      </View>

      <SectionLabel label="How often do you feel completely empty inside?" colors={colors} />
      <View style={stepStyles.chipRow}>
        {PULSE_OPTIONS.map((opt) => (
          <Chip key={opt} label={opt} active={form.feelEmpty === opt} onPress={() => set('feelEmpty', opt)} colors={colors} />
        ))}
      </View>

      <SectionLabel label="Do you feel like you have reasons to keep going tomorrow?" colors={colors} />
      <View style={stepStyles.chipRow}>
        {PULSE_OPTIONS_REVERSE.map((opt) => (
          <Chip key={opt} label={opt} active={form.reasonsToKeepGoing === opt} onPress={() => set('reasonsToKeepGoing', opt)} colors={colors} />
        ))}
      </View>

      <Text style={[pulseStyles.disclaimer, { color: colors.textTertiary }]}>
        Your responses are private and help us personalize your wellness insights.
      </Text>
    </View>
  );
}

// ─── Step 6 — Go Deeper interstitial ─────────────────────────
function GoDeeperStep({ onSkip, onYes, colors }) {
  return (
    <View style={deeperStyles.wrap}>
      <Text style={deeperStyles.icon}>✨</Text>
      <Text style={[deeperStyles.title, { color: colors.textPrimary }]}>Go Deeper?</Text>
      <Text style={[deeperStyles.subtitle, { color: colors.textSecondary }]}>
        Answer a few more questions so Mend can better understand you and give you more personalized insights.
      </Text>
      <TouchableOpacity
        style={[deeperStyles.yesBtn, { backgroundColor: colors.primary }]}
        onPress={onYes}
        accessibilityRole="button"
      >
        <Text style={[deeperStyles.yesBtnText, { color: colors.textInverse }]}>Yes, let's go</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[deeperStyles.skipBtn, { borderColor: colors.border }]}
        onPress={onSkip}
        accessibilityRole="button"
      >
        <Text style={[deeperStyles.skipBtnText, { color: colors.textSecondary }]}>Skip, get my insights</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 7 — Open-Ended Questions ───────────────────────────
const OPEN_ENDED_QUESTIONS = [
  { key: 'onMind',       label: "What's been on your mind lately?" },
  { key: 'struggling',   label: "Is there something specific you've been struggling with?" },
  { key: 'goodToday',    label: "What's one thing that made you smile or feel good today?" },
  { key: 'draining',     label: "What's been draining your energy lately?" },
  { key: 'anythingElse', label: "Is there anything else you'd like Mend to know about how you're feeling?" },
];

function OpenEndedStep({ responses, setResponses, colors }) {
  return (
    <View style={openStyles.wrap}>
      <Text style={[openStyles.title, { color: colors.textPrimary }]}>Tell Us More</Text>
      <Text style={[openStyles.subtitle, { color: colors.textSecondary }]}>
        All questions are optional. Share as much or as little as you like.
      </Text>
      {OPEN_ENDED_QUESTIONS.map((q) => (
        <View key={q.key} style={openStyles.fieldWrap}>
          <Text style={[openStyles.qLabel, { color: colors.textPrimary }]}>{q.label}</Text>
          <TextInput
            style={[openStyles.textArea, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
            value={responses[q.key] ?? ''}
            onChangeText={(v) => setResponses((r) => ({ ...r, [q.key]: v }))}
            placeholder="Type here…"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      ))}
    </View>
  );
}

// ─── Step 8 — Insights ───────────────────────────────────────
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

const pulseStyles = StyleSheet.create({
  disclaimer: { ...Typography.caption, textAlign: 'center', marginTop: Spacing.md },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    borderRadius: 24,
    padding: Spacing.lg,
    gap: Spacing.sm,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  emoji:         { fontSize: 40, textAlign: 'center' },
  title:         { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, color: '#fff', textAlign: 'center' },
  body:          { ...Typography.bodySmall, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: Spacing.xs },
  divider:       { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },
  hotlineRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
  hotlineLabel:  { ...Typography.label, color: 'rgba(255,255,255,0.9)', flex: 1 },
  hotlineNumber: { ...Typography.label, fontWeight: '700', color: '#fff', flexShrink: 0 },
  closeBtn: {
    marginTop: Spacing.sm,
    borderRadius: Radius.full,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  closeBtnText: { ...Typography.button, color: '#fff' },
});

const deeperStyles = StyleSheet.create({
  wrap:        { alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.xl * 2 },
  icon:        { fontSize: 56 },
  title:       { ...Typography.h2, textAlign: 'center' },
  subtitle:    { ...Typography.body, textAlign: 'center' },
  yesBtn: {
    width: '100%', borderRadius: Radius.full, height: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  yesBtnText:  { ...Typography.button },
  skipBtn: {
    width: '100%', borderRadius: Radius.full, height: 54,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  skipBtnText: { ...Typography.button },
});

const openStyles = StyleSheet.create({
  wrap:      { gap: Spacing.md },
  title:     { ...Typography.h2 },
  subtitle:  { ...Typography.body, marginBottom: Spacing.xs },
  fieldWrap: { gap: Spacing.xs },
  qLabel:    { ...Typography.label },
  textArea: {
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    ...Typography.body,
    minHeight: 90,
  },
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
