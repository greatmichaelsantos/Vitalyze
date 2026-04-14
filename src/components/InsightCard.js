import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getRiskColor, getRiskBgColor } from '../utils/colors';
import { useTheme } from '../context/ThemeContext';
import { Typography, Spacing, Radius } from '../utils/constants';

// Category accent colors are the same in both themes (vibrant semantic colors)
const CATEGORY_ICONS = {
  mental:   { icon: 'brain',             color: '#A855F7' },
  physical: { icon: 'body',              color: '#14B8A6' },
  diet:     { icon: 'nutrition',         color: '#F97316' },
  general:  { icon: 'information-circle', color: '#6C47FF' },
};

const SEVERITY_LABELS = { low: 'Good', medium: 'Warning', high: 'Alert' };

export default function InsightCard({ pattern }) {
  const { colors } = useTheme();
  const { name, description, severity, category, scienceRef } = pattern;
  const catInfo   = CATEGORY_ICONS[category] || CATEGORY_ICONS.general;
  const bgColor   = getRiskBgColor(severity, colors);
  const textColor = getRiskColor(severity);

  return (
    <View style={[styles.card, {
      backgroundColor: colors.surface,
      borderColor:     colors.border,
      borderLeftColor: textColor,
    }]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: bgColor }]}>
          <Ionicons name={catInfo.icon} size={18} color={catInfo.color} />
        </View>
        <View style={styles.titleWrap}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{name}</Text>
          <View style={[styles.badge, { backgroundColor: bgColor }]}>
            <Text style={[styles.badgeText, { color: textColor }]}>
              {SEVERITY_LABELS[severity] || 'Info'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>
      {!!scienceRef && (
        <Text style={[styles.scienceRef, { color: colors.textTertiary }]}>
          🔬 {scienceRef}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  iconWrap:    { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  titleWrap:   { flex: 1, gap: 4 },
  name:        { ...Typography.h4, flexShrink: 1 },
  badge:       { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  badgeText:   { ...Typography.caption, fontWeight: '600' },
  description: { ...Typography.bodySmall, lineHeight: 20 },
  scienceRef:  { ...Typography.caption, fontStyle: 'italic', lineHeight: 18 },
});
