import React, { useRef, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, TouchableOpacity,
  Modal, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { Spacing } from '../utils/constants';

// ── Alert detail copy ───────────────────────────────────────────────────────

function getAlertDetails(title = '') {
  const t = title.toLowerCase();

  if (t.includes('burnout')) return {
    meaning: 'Sustained high stress without adequate recovery leads to emotional and physical exhaustion. Over time this erodes motivation, focus, and resilience.',
    actions: [
      'Schedule at least one full rest period with no obligations today',
      'Break large tasks into smaller steps to reduce overwhelm',
      'Build a consistent wind-down routine to signal recovery to your body',
    ],
  };

  if (t.includes('sleep')) return {
    meaning: 'Consistent sleep deprivation impairs memory consolidation, reaction time, and immune response. Even a single poor night measurably reduces cognitive performance.',
    actions: [
      'Set a fixed bedtime tonight and aim for 7–9 hours',
      'Avoid screens and caffeine in the 90 minutes before bed',
      'Keep your room cool, dark, and quiet for deeper sleep',
    ],
  };

  if (t.includes('stress')) return {
    meaning: 'Elevated and prolonged stress raises cortisol levels, which can disrupt sleep, digestion, and cardiovascular health if left unmanaged.',
    actions: [
      'Try 5 minutes of slow diaphragmatic breathing to lower your heart rate',
      'Identify the single biggest stressor today and address it first',
      'Take a short walk — physical movement actively reduces cortisol',
    ],
  };

  if (t.includes('anxiety')) return {
    meaning: 'Persistent anxiety keeps your nervous system in a heightened state, making it harder to focus, rest, and recover between challenges.',
    actions: [
      'Use the 5-4-3-2-1 grounding technique when anxiety spikes',
      'Limit news and social media during high-anxiety periods',
      'Talk to someone you trust about what is weighing on you',
    ],
  };

  if (t.includes('mood') || t.includes('depression')) return {
    meaning: 'Low mood sustained over several days signals emotional depletion. Addressing it early prevents deeper mental fatigue from setting in.',
    actions: [
      'Get at least 15 minutes of natural light outside today',
      'Do one small thing you normally enjoy, even if motivation is low',
      'Reach out to a friend or family member for a brief conversation',
    ],
  };

  if (t.includes('sedentary') || t.includes('activity') || t.includes('exercise')) return {
    meaning: 'Prolonged inactivity slows metabolism, stiffens muscles, and is linked to increased cardiovascular and metabolic risk over time.',
    actions: [
      'Take a 10-minute walk — enough to reset circulation and energy',
      'Set a reminder to stand and stretch for 2 minutes every hour',
      'Add one movement-based activity to your plan this week',
    ],
  };

  if (t.includes('nutrition') || t.includes('diet') || t.includes('eating')) return {
    meaning: 'Poor nutritional patterns reduce sustained energy, impair mood regulation, and weaken immune function over time.',
    actions: [
      'Add one whole food (fruit, vegetable, or protein) to your next meal',
      'Stay hydrated — even mild dehydration affects energy and mood',
      'Avoid skipping meals, as this leads to poorer food choices later',
    ],
  };

  if (t.includes('social') || t.includes('lonely') || t.includes('isolation')) return {
    meaning: 'Social disconnection is a significant mental health stressor. Chronic loneliness is associated with elevated stress hormones and reduced emotional resilience.',
    actions: [
      'Send a message to one person you have not spoken to recently',
      'Plan a call or meet-up with someone this week',
      'Consider joining an activity or group aligned with your interests',
    ],
  };

  if (t.includes('hydrat') || t.includes('water')) return {
    meaning: 'Even mild dehydration — as little as 1–2% body weight loss as fluid — measurably impairs concentration, memory, and physical performance.',
    actions: [
      'Drink a full glass of water right now',
      'Keep a water bottle visible at your desk as a constant cue',
      'Aim for at least 8 glasses spread throughout the day',
    ],
  };

  return {
    meaning: 'This pattern in your check-in data suggests your body or mind may need extra attention. Catching it early gives you the best opportunity to course-correct.',
    actions: [
      'Review which areas of today\'s check-in scored lowest',
      'Make one small change in your routine to address the underlying cause',
      'Monitor this over your next few check-ins to see if it improves',
    ],
  };
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AlertCard({ alert }) {
  const { colors }   = useTheme();
  const reduceMotion = useReduceMotion();
  const { title, body, severity } = alert;

  const [modalOpen, setModalOpen] = useState(false);

  const borderOpacity = useRef(new Animated.Value(1)).current;

  const isHigh   = severity === 'high';
  const isMedium = severity === 'medium';
  const riskColor = isHigh ? colors.high      : isMedium ? colors.medium      : colors.low;
  const riskBg    = isHigh ? colors.highLight : isMedium ? colors.mediumLight : colors.lowLight;
  const label     = isHigh ? 'HIGH'           : isMedium ? 'MEDIUM'           : 'LOW';

  const { meaning, actions } = getAlertDetails(title);

  useEffect(() => {
    if (isHigh && !reduceMotion) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(borderOpacity, { toValue: 0.6, duration: 750, useNativeDriver: true }),
          Animated.timing(borderOpacity, { toValue: 1.0, duration: 750, useNativeDriver: true }),
        ])
      ).start();
    } else {
      borderOpacity.setValue(1);
    }
  }, [isHigh, reduceMotion]);

  return (
    <>
      {/* ── Card ── */}
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.surface }]}
        onPress={() => setModalOpen(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${title} alert. Tap for details.`}
      >
        <Animated.View style={[styles.leftAccent, { backgroundColor: riskColor, opacity: borderOpacity }]} />

        <View style={styles.cardInner}>
          <View style={styles.topRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
            <View style={[styles.riskPill, { backgroundColor: riskBg }]}>
              <Text style={[styles.riskPillText, { color: riskColor }]}>{label}</Text>
            </View>
          </View>
          <Text style={[styles.description, { color: colors.textSecondary }]}>{body}</Text>
        </View>

        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={styles.chevron} />
        <View style={[styles.bottomDivider, { backgroundColor: colors.border }]} />
      </TouchableOpacity>

      {/* ── Modal ── */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={() => setModalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

              {/* Risk pill */}
              <View style={[styles.riskPill, { backgroundColor: riskBg, alignSelf: 'flex-start' }]}>
                <Text style={[styles.riskPillText, { color: riskColor }]}>{label}</Text>
              </View>

              {/* Title */}
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{title}</Text>

              {/* Divider */}
              <View style={[styles.modalDivider, { backgroundColor: colors.border }]} />

              {/* Description */}
              <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>{body}</Text>

              {/* What this means */}
              <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>What this means</Text>
              <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>{meaning}</Text>

              {/* What you can do */}
              <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>What you can do</Text>
              {actions.map((action, i) => (
                <View key={i} style={styles.bulletRow}>
                  <Text style={[styles.bulletDot, { color: riskColor }]}>•</Text>
                  <Text style={[styles.bulletText, { color: colors.textSecondary }]}>{action}</Text>
                </View>
              ))}

              {/* Close button */}
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.primary }]}
                onPress={() => setModalOpen(false)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Got it"
              >
                <Text style={styles.closeBtnText}>Got it</Text>
              </TouchableOpacity>

            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card
  card: {
    flexDirection: 'row',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  leftAccent: {
    width: 4,
  },
  cardInner: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  riskPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  riskPillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  chevron: {
    alignSelf: 'center',
    marginRight: Spacing.sm,
  },
  bottomDivider: {
    position: 'absolute',
    bottom: 0,
    left: 4,
    right: 0,
    height: 0.5,
    opacity: 0.5,
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 14,
  },
  modalDivider: {
    height: 1,
    marginBottom: 14,
    opacity: 0.4,
  },
  modalDesc: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 21,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  closeBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
