import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { Typography, Spacing, Radius } from '../utils/constants';

export default function AlertCard({ alert }) {
  const { colors }   = useTheme();
  const reduceMotion = useReduceMotion();
  const { title, body, severity } = alert;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Skip pulse animation when the OS "Reduce Motion" setting is on
    if (severity === 'high' && !reduceMotion) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.02, duration: 800, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1,    duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [severity, reduceMotion]);

  const isHigh      = severity === 'high';
  const bgColor     = isHigh ? colors.highLight   : colors.mediumLight;
  const iconColor   = isHigh ? colors.high         : colors.medium;
  const borderColor = isHigh ? colors.high         : colors.medium;

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: bgColor, borderColor },
        { transform: [{ scale: pulse }] },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.iconWrap}>
        <Ionicons name={isHigh ? 'alert-circle' : 'warning'} size={22} color={iconColor} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, { color: iconColor }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderWidth: 1.5,
  },
  iconWrap: { marginTop: 2 },
  content:  { flex: 1, gap: 4 },
  title:    { ...Typography.h4 },
  body:     { ...Typography.bodySmall, lineHeight: 20 },
});
