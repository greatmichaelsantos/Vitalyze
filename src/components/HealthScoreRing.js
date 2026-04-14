import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getScoreColor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
import { useReduceMotion } from '../hooks/useReduceMotion';
import { Typography } from '../utils/constants';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Circular SVG health score ring.
 *
 * Props:
 *   score            — number 0-100
 *   label            — short label shown inside the ring ("Overall", "Physical", "Mental")
 *   size             — diameter in points
 *   strokeWidth      — ring thickness
 *   animate          — set false to skip animation (e.g. in lists)
 *   riskLevel        — optional: "Low" | "Medium" | "High" — appended to a11y label
 *   accessibilityLabel — override the auto-generated screen-reader label
 */
export default function HealthScoreRing({
  score = 0,
  label = 'Score',
  size = 100,
  strokeWidth = 10,
  animate = true,
  riskLevel,
  accessibilityLabel: a11yLabelProp,
}) {
  const { colors }    = useTheme();
  const reduceMotion  = useReduceMotion();
  const shouldAnimate = animate && !reduceMotion;

  const radius       = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress     = useRef(new Animated.Value(0)).current;
  const color        = getScoreColor(score);

  useEffect(() => {
    if (shouldAnimate) {
      Animated.timing(progress, {
        toValue: score / 100,
        duration: 900,
        useNativeDriver: false,
      }).start();
    } else {
      // Instant fill — no animation (reduce motion or animate=false)
      progress.setValue(score / 100);
    }
  }, [score, shouldAnimate]);

  const strokeDashoffset = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [circumference, 0],
  });

  // Build a rich screen-reader label so VoiceOver/TalkBack users
  // hear the full context rather than just a bare number.
  const riskSuffix = riskLevel ? `, ${riskLevel} risk` : '';
  const autoLabel  = `${label} health score: ${score} out of 100${riskSuffix}`;
  const a11yLabel  = a11yLabelProp || autoLabel;

  return (
    <View
      style={[styles.container, { width: size, height: size }]}
      accessible={true}
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      <Svg width={size} height={size} style={styles.svg}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        {/* aria-hidden equivalent: the parent View already has the full label */}
        <Text
          style={[styles.score, { color }]}
          importantForAccessibility="no"
          accessibilityElementsHidden={true}
          maxFontSizeMultiplier={1.3}
        >
          {score}
        </Text>
        <Text
          style={[styles.label, { color: colors.textSecondary }]}
          importantForAccessibility="no"
          accessibilityElementsHidden={true}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  svg:       { position: 'absolute' },
  center:    { alignItems: 'center' },
  score:     { ...Typography.h2, fontSize: 22, lineHeight: 26 },
  label:     { ...Typography.caption, textAlign: 'center', marginTop: 2 },
});
