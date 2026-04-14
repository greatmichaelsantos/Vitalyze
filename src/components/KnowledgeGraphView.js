// ============================================================
// KNOWLEDGE GRAPH VISUALIZER
// ============================================================

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Circle, Line, Text as SvgText, G } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { Typography, Spacing, Radius } from '../utils/constants';
import { NODE_TYPES } from '../services/knowledgeGraphEngine';

const NODE_LAYOUT = {
  [NODE_TYPES.MOOD]:          { x: 200, y: 160, group: 'mental' },
  [NODE_TYPES.STRESS]:        { x: 140, y: 100, group: 'mental' },
  [NODE_TYPES.ANXIETY]:       { x: 260, y: 100, group: 'mental' },
  [NODE_TYPES.MOTIVATION]:    { x: 200, y: 60,  group: 'mental' },
  [NODE_TYPES.LONELINESS]:    { x: 100, y: 155, group: 'mental' },
  [NODE_TYPES.SLEEP_HOURS]:   { x: 310, y: 155, group: 'physical' },
  [NODE_TYPES.SLEEP_QUALITY]: { x: 350, y: 220, group: 'physical' },
  [NODE_TYPES.EXERCISE]:      { x: 330, y: 290, group: 'physical' },
  [NODE_TYPES.WATER]:         { x: 260, y: 320, group: 'physical' },
  [NODE_TYPES.SYMPTOMS]:      { x: 310, y: 370, group: 'physical' },
  [NODE_TYPES.MEALS]:         { x: 140, y: 290, group: 'diet' },
  [NODE_TYPES.CAFFEINE]:      { x: 80,  y: 240, group: 'diet' },
  [NODE_TYPES.ENERGY_DRINKS]: { x: 60,  y: 310, group: 'diet' },
  [NODE_TYPES.ALCOHOL]:       { x: 130, y: 360, group: 'diet' },
  [NODE_TYPES.EATING_HABITS]: { x: 200, y: 390, group: 'diet' },
};

// Group colors are vibrant semantic colors — same in both themes
const GROUP_COLORS = {
  mental:   '#A855F7',
  physical: '#14B8A6',
  diet:     '#F97316',
};

const NODE_LABELS = {
  [NODE_TYPES.MOOD]:          'Mood',
  [NODE_TYPES.STRESS]:        'Stress',
  [NODE_TYPES.ANXIETY]:       'Anxiety',
  [NODE_TYPES.MOTIVATION]:    'Motivation',
  [NODE_TYPES.LONELINESS]:    'Loneliness',
  [NODE_TYPES.SLEEP_HOURS]:   'Sleep hrs',
  [NODE_TYPES.SLEEP_QUALITY]: 'Sleep Q',
  [NODE_TYPES.EXERCISE]:      'Exercise',
  [NODE_TYPES.WATER]:         'Water',
  [NODE_TYPES.SYMPTOMS]:      'Symptoms',
  [NODE_TYPES.MEALS]:         'Meals',
  [NODE_TYPES.CAFFEINE]:      'Caffeine',
  [NODE_TYPES.ENERGY_DRINKS]: 'Energy D.',
  [NODE_TYPES.ALCOHOL]:       'Alcohol',
  [NODE_TYPES.EATING_HABITS]: 'Diet',
};

const VISUAL_EDGES = [
  [NODE_TYPES.MOOD,         NODE_TYPES.STRESS],
  [NODE_TYPES.MOOD,         NODE_TYPES.SLEEP_QUALITY],
  [NODE_TYPES.STRESS,       NODE_TYPES.ANXIETY],
  [NODE_TYPES.SLEEP_HOURS,  NODE_TYPES.SLEEP_QUALITY],
  [NODE_TYPES.SLEEP_HOURS,  NODE_TYPES.MOOD],
  [NODE_TYPES.CAFFEINE,     NODE_TYPES.SLEEP_QUALITY],
  [NODE_TYPES.CAFFEINE,     NODE_TYPES.ANXIETY],
  [NODE_TYPES.WATER,        NODE_TYPES.SYMPTOMS],
  [NODE_TYPES.EXERCISE,     NODE_TYPES.MOOD],
  [NODE_TYPES.EXERCISE,     NODE_TYPES.SLEEP_QUALITY],
  [NODE_TYPES.ALCOHOL,      NODE_TYPES.SLEEP_QUALITY],
  [NODE_TYPES.MEALS,        NODE_TYPES.MOTIVATION],
  [NODE_TYPES.ENERGY_DRINKS,NODE_TYPES.ANXIETY],
  [NODE_TYPES.LONELINESS,   NODE_TYPES.MOOD],
];

const getRingColor = (nodeId, normalizedValue) => {
  const invertedMetrics = [
    NODE_TYPES.STRESS, NODE_TYPES.ANXIETY, NODE_TYPES.LONELINESS,
    NODE_TYPES.CAFFEINE, NODE_TYPES.ENERGY_DRINKS, NODE_TYPES.ALCOHOL, NODE_TYPES.SYMPTOMS,
  ];
  const riskValue = invertedMetrics.includes(nodeId) ? normalizedValue : 1 - normalizedValue;
  if (riskValue > 0.65) return '#EF4444'; // Colors.high
  if (riskValue > 0.35) return '#F59E0B'; // Colors.medium
  return '#22C55E'; // Colors.low
};

export default function KnowledgeGraphView({ graph }) {
  const { colors } = useTheme();
  const SVG_W = 420;
  const SVG_H = 440;

  const { nodes } = graph || {};
  const nodeMap = useMemo(() => {
    if (!nodes) return {};
    const map = {};
    nodes.forEach((n) => { map[n.id] = n; });
    return map;
  }, [nodes]);

  if (!nodes || nodes.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.surface }]}>
        <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
          Your health map will appear after your first check-in.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text
        style={[styles.title, { color: colors.textPrimary }]}
        accessibilityRole="header"
      >
        Health Connection Map
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Each circle is a health factor. Color shows its current risk level.
      </Text>

      {/* Risk legend */}
      <View style={styles.legend}>
        {[
          { color: '#22C55E', label: 'Low risk' },
          { color: '#F59E0B', label: 'Medium' },
          { color: '#EF4444', label: 'High risk' },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Group legend */}
      <View style={styles.groupLabels}>
        {Object.entries(GROUP_COLORS).map(([group, color]) => (
          <View key={group} style={styles.groupItem}>
            <View style={[styles.groupDot, { backgroundColor: color }]} />
            <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
              {group.charAt(0).toUpperCase() + group.slice(1)}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={SVG_W} height={SVG_H}>
          {/* Edges */}
          {VISUAL_EDGES.map(([fromId, toId], i) => {
            const from = NODE_LAYOUT[fromId];
            const to   = NODE_LAYOUT[toId];
            if (!from || !to) return null;
            return (
              <Line
                key={`edge_${i}`}
                x1={from.x} y1={from.y}
                x2={to.x}   y2={to.y}
                stroke={colors.border}
                strokeWidth={1.5}
                opacity={0.6}
              />
            );
          })}

          {/* Nodes */}
          {Object.entries(NODE_LAYOUT).map(([nodeId, pos]) => {
            const node = nodeMap[nodeId];
            if (!node) return null;
            const ringColor = getRingColor(nodeId, node.normalizedValue);
            const fillColor = GROUP_COLORS[pos.group] + '22';

            return (
              <G key={nodeId} x={pos.x} y={pos.y}>
                <Circle cx={0} cy={0} r={22} fill={fillColor} stroke={ringColor} strokeWidth={3} />
                <Circle cx={0} cy={0} r={8}  fill={GROUP_COLORS[pos.group]} opacity={0.7} />
                <SvgText
                  x={0} y={34}
                  fontSize={9}
                  fill={colors.textSecondary}
                  textAnchor="middle"
                  fontWeight="500"
                >
                  {NODE_LABELS[nodeId]}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
  },
  title:    { ...Typography.h4, marginBottom: 2 },
  subtitle: { ...Typography.caption, marginBottom: Spacing.sm },
  legend:       { flexDirection: 'row', gap: Spacing.md, marginBottom: 4 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 10, height: 10, borderRadius: 5 },
  legendLabel:  { ...Typography.caption },
  groupLabels:  { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  groupItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupDot:     { width: 10, height: 10, borderRadius: 5 },
  groupLabel:   { ...Typography.caption },
  empty:        { padding: Spacing.lg, alignItems: 'center', borderRadius: Radius.lg },
  emptyText:    { ...Typography.bodySmall, textAlign: 'center' },
});
