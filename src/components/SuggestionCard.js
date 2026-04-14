import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Typography, Spacing, Radius } from '../utils/constants';

const PREVIEW_LENGTH = 72; // chars shown before "Show more"

/**
 * Props:
 *   suggestion  — { title, body, icon }
 *   collapsible — when true the body is truncated with a "Show more" toggle
 *                 (default false — used on Check-in Step 4 results page)
 */
export default function SuggestionCard({ suggestion, collapsible = false }) {
  const { colors } = useTheme();
  const { title, body, icon } = suggestion;
  const [expanded, setExpanded] = useState(!collapsible);

  const preview   = body?.length > PREVIEW_LENGTH
    ? body.slice(0, PREVIEW_LENGTH).trimEnd() + '…'
    : body;
  const bodyText  = expanded ? body : preview;
  const showToggle = collapsible && body?.length > PREVIEW_LENGTH;

  return (
    <View
      style={[styles.card, {
        backgroundColor: colors.primaryLight,
        borderColor:     colors.primary + '40',
      }]}
      accessible={false}
    >
      <Text style={styles.icon} importantForAccessibility="no">{icon}</Text>
      <View style={styles.content}>
        <Text
          style={[styles.title, { color: colors.primaryContrast }]}
          maxFontSizeMultiplier={1.3}
        >
          {title}
        </Text>
        <Text
          style={[styles.body, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.5}
        >
          {bodyText}
        </Text>
        {showToggle && (
          <TouchableOpacity
            onPress={() => setExpanded((v) => !v)}
            style={styles.toggleBtn}
            accessibilityRole="button"
            accessibilityLabel={expanded ? `Show less for ${title}` : `Show more for ${title}`}
            accessibilityState={{ expanded }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.toggleText, { color: colors.primaryContrast }]}>
              {expanded ? 'Show less' : 'Show more'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.primaryContrast}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    borderWidth: 1,
  },
  icon:      { fontSize: 26, marginTop: 2 },
  content:   { flex: 1, gap: 4 },
  title:     { ...Typography.h4 },
  body:      { ...Typography.bodySmall, lineHeight: 20 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  toggleText:{ ...Typography.caption, fontWeight: '600' },
});
