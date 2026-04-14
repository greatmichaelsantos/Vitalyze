import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Pressable,
  RefreshControl, StatusBar, SafeAreaView, Dimensions, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { BarChart } from 'react-native-chart-kit';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getRecentInsights, getHealthLogs, getKnowledgeGraph, getInsightByDate,
} from '../../services/firestoreService';
import { getScoreColor, getRiskColor, getRiskBgColor } from '../../utils/colors';
import {
  Typography, Spacing, Radius,
  MOOD_OPTIONS, EXERCISE_TYPES, SYMPTOM_OPTIONS, EATING_HABITS, SLEEP_QUALITY,
} from '../../utils/constants';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import KnowledgeGraphView from '../../components/KnowledgeGraphView';
import InsightCard from '../../components/InsightCard';
import SuggestionCard from '../../components/SuggestionCard';

const { width: SCREEN_W } = Dimensions.get('window');
const CHART_W = SCREEN_W - Spacing.lg * 2 - 2;

const METRIC_INFO = {
  avgScore: {
    title: '7-Day Average Score',
    text: 'The average of your Overall Health Score across your last 7 check-ins. It combines your physical and mental health inputs into a single number out of 100.',
  },
  trend: {
    title: 'vs. Last Check-in',
    text: 'The change in your Overall Health Score compared to the check-in just before your most recent one. Green means you improved; red means it went down.',
  },
  checkIns: {
    title: 'Check-ins Logged',
    text: 'The number of daily health check-ins you have completed. Logging consistently helps detect patterns and gives your AI insights more accuracy over time.',
  },
  sleep: {
    title: 'Sleep',
    text: 'The number of hours you slept. Adults need 7–9 hours per night for good health, memory, and mood.',
  },
  mood: {
    title: 'Mood',
    text: 'How you felt emotionally, rated from 1 (very low) to 5 (great). Your mood affects energy, focus, and physical health.',
  },
  water: {
    title: 'Water Intake',
    text: 'Glasses of water you drank. Staying hydrated supports energy levels, digestion, and brain function.',
  },
  exercise: {
    title: 'Exercise',
    text: 'Physical activity you did today. Even a short 20-minute walk improves mood, heart health, and sleep quality.',
  },
};

export default function ProgressScreen({ navigation }) {
  const { user }              = useAuth();
  const { colors, isDark }    = useTheme();
  const styles                = useMemo(() => makeStyles(colors), [colors]);
  const [insights,   setInsights]   = useState([]);
  const [logs,       setLogs]       = useState([]);
  const [graph,      setGraph]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab,  setActiveTab]  = useState(0);
  const [tooltip,    setTooltip]    = useState(null);

  const load = useCallback(async () => {
    const [ins, lg, gr] = await Promise.allSettled([
      getRecentInsights(user.uid, 7),
      getHealthLogs(user.uid, 14),
      getKnowledgeGraph(user.uid),
    ]);
    if (ins.status === 'fulfilled') setInsights(ins.value ?? []);
    if (lg.status  === 'fulfilled') setLogs(lg.value ?? []);
    if (gr.status  === 'fulfilled') setGraph(gr.value);
    setLoading(false);
    setRefreshing(false);
  }, [user.uid]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner fullScreen message="Loading progress data…" />;

  const hasData = insights.length > 0 || logs.length > 0;

  const chartInsights = dedupeByDate(insights);
  const chartLabels   = chartInsights.map((i) => shortDate(i.date));
  const chartData     = chartInsights.map((i) => i.overallScore || 0);

  const avgScore   = chartData.length > 0
    ? Math.round(chartData.reduce((a, b) => a + b, 0) / chartData.length)
    : 0;
  const currScore  = insights.length >= 1 ? insights[insights.length - 1].overallScore : null;
  const prevScore  = insights.length >= 2 ? insights[insights.length - 2].overallScore : null;
  const trendDelta = currScore != null && prevScore != null ? currScore - prevScore : null;

  const showInfo = (key) => setTooltip(METRIC_INFO[key]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Progress</Text>
        <Text style={styles.subtitle}>Track your health trends over time</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {!hasData ? (
          <EmptyState
            icon="bar-chart-outline"
            title="No progress data yet"
            message="Complete at least one daily check-in to start tracking your health trends."
            actionLabel="Start Check-in"
            onAction={() => navigation.navigate('CheckIn')}
          />
        ) : (
          <>
            {/* Average Score card */}
            <View style={styles.avgCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardLabel}>7-Day Average Health Score</Text>
                <InfoButton onPress={() => showInfo('avgScore')} colors={colors} />
              </View>
              <View style={styles.avgScoreRow}>
                <Text style={[styles.avgNumber, { color: getScoreColor(avgScore) }]}>{avgScore}</Text>
                <Text style={styles.avgOutOf}> / 100</Text>
              </View>
              <View style={styles.avgBarTrack}>
                <View style={[styles.avgBarFill, { width: `${avgScore}%`, backgroundColor: getScoreColor(avgScore) }]} />
              </View>
              <Text style={styles.avgNote}>
                {avgScore >= 70
                  ? 'Your average health score over the last 7 days is healthy. Scores above 70 are considered healthy.'
                  : avgScore >= 40
                  ? `Your average health score over the last 7 days is ${avgScore} out of 100. Scores above 70 are considered healthy.`
                  : `Your average health score over the last 7 days is ${avgScore} out of 100. Scores above 70 are considered healthy. Focus on your check-ins to improve.`}
              </Text>
            </View>

            {/* Trend + Check-ins row */}
            <View style={styles.twoCol}>
              <View style={styles.halfCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardLabel}>vs. Last Check-in</Text>
                  <InfoButton onPress={() => showInfo('trend')} size={15} colors={colors} />
                </View>
                {trendDelta == null ? (
                  <Text style={styles.noDataText}>Log 2 or more check-ins to see your trend.</Text>
                ) : (
                  <>
                    <View style={styles.trendValueRow}>
                      <Ionicons
                        name={trendDelta > 0 ? 'arrow-up-circle' : trendDelta < 0 ? 'arrow-down-circle' : 'remove-circle'}
                        size={24}
                        color={trendDelta > 0 ? colors.low : trendDelta < 0 ? colors.high : colors.textTertiary}
                      />
                      <Text style={[styles.trendNumber, {
                        color: trendDelta > 0 ? colors.low : trendDelta < 0 ? colors.high : colors.textTertiary,
                      }]}>
                        {trendDelta === 0 ? 'No change' : `${trendDelta > 0 ? 'Up' : 'Down'} ${Math.abs(trendDelta)}`}
                      </Text>
                    </View>
                    {trendDelta !== 0 && <Text style={styles.trendSub}>points since last check-in</Text>}
                  </>
                )}
              </View>

              <View style={styles.halfCard}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardLabel}>Check-ins</Text>
                  <InfoButton onPress={() => showInfo('checkIns')} size={15} colors={colors} />
                </View>
                <Text style={[styles.checkInNumber, { color: colors.primaryContrast }]}>{insights.length}</Text>
                <Text style={styles.checkInSub}>
                  {insights.length === 0
                    ? 'No check-ins yet. Start today!'
                    : insights.length === 1
                    ? 'You have logged 1 check-in so far. Great start!'
                    : `You have logged ${insights.length} check-ins so far. Keep it up!`}
                </Text>
              </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabRow} accessibilityRole="tablist">
              {['Trend', 'History', 'Health Map'].map((tab, i) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === i && styles.tabActive]}
                  onPress={() => setActiveTab(i)}
                  accessibilityRole="tab"
                  accessibilityLabel={tab}
                  accessibilityState={{ selected: activeTab === i }}
                >
                  <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]} maxFontSizeMultiplier={1.3}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Trend Chart */}
            {activeTab === 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>7-Day Overall Health Score</Text>
                {chartData.length >= 2 ? (
                  <BarChart
                    data={{ labels: chartLabels, datasets: [{ data: chartData }] }}
                    width={CHART_W}
                    height={200}
                    fromZero
                    yAxisSuffix=""
                    chartConfig={{
                      backgroundGradientFrom: colors.surface,
                      backgroundGradientTo:   colors.surface,
                      decimalPlaces: 0,
                      color: (opacity = 1) => `rgba(108, 71, 255, ${opacity})`,
                      labelColor: () => colors.textSecondary,
                      barPercentage: 0.6,
                      propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '' },
                    }}
                    style={styles.chart}
                    showValuesOnTopOfBars
                    withInnerLines
                  />
                ) : (
                  <View style={styles.notEnoughData}>
                    <Text style={styles.notEnoughText}>Complete at least 2 check-ins to see your trend chart.</Text>
                  </View>
                )}
                <View style={styles.legend}>
                  {[
                    { color: colors.low,    label: '70–100  Healthy' },
                    { color: colors.medium, label: '40–69  Needs attention' },
                    { color: colors.high,   label: '0–39  Critical' },
                  ].map((l) => (
                    <View key={l.label} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: l.color }]} />
                      <Text style={styles.legendLabel}>{l.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.chartTitle}>Score Breakdown</Text>
                {[...insights].reverse().map((ins, idx) => (
                  <View key={ins.id || `${ins.date}-${idx}`} style={styles.dayRow}>
                    <Text style={styles.dayLabel} numberOfLines={2}>{formatInsightDateTime(ins)}</Text>
                    <ScoreBar score={ins.overallScore} colors={colors} />
                    <View style={[styles.riskDot, { backgroundColor: getRiskColor(ins.riskLevel?.toLowerCase()) }]} />
                    <Text style={[styles.dayScore, { color: getScoreColor(ins.overallScore) }]}>{ins.overallScore}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* History */}
            {activeTab === 1 && (
              <View style={styles.historyList}>
                {logs.length === 0
                  ? <Text style={styles.emptyText}>No check-in history found.</Text>
                  : logs.map((log) => (
                    <HistoryItem
                      key={log.id}
                      log={log}
                      colors={colors}
                      userId={user.uid}
                      onInfo={(key) => setTooltip(METRIC_INFO[key])}
                    />
                  ))
                }
              </View>
            )}

            {/* Knowledge Graph */}
            {activeTab === 2 && (
              <>
                <View style={styles.graphExplainer}>
                  <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
                  <Text style={styles.graphExplainerText} maxFontSizeMultiplier={1.5}>
                    This map shows how your health habits connect to each other. Each circle is a health factor
                    such as sleep, stress, or exercise. Green means healthy, yellow means it needs attention,
                    and red means it is a concern to address.
                  </Text>
                </View>
                <KnowledgeGraphView graph={graph?.current} />
              </>
            )}
          </>
        )}
      </ScrollView>

      <TooltipModal tooltip={tooltip} onClose={() => setTooltip(null)} colors={colors} />
    </SafeAreaView>
  );
}

// ─── Tooltip modal ────────────────────────────────────────────
function TooltipModal({ tooltip, onClose, colors }) {
  return (
    <Modal visible={!!tooltip} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[ttStyles.overlay]} onPress={onClose}>
        <Pressable style={[ttStyles.card, { backgroundColor: colors.surface }]} onPress={() => {}}>
          <View style={ttStyles.header}>
            <Ionicons name="information-circle" size={22} color={colors.primary} />
            <Text style={[ttStyles.title, { color: colors.textPrimary }]}>{tooltip?.title}</Text>
          </View>
          <Text style={[ttStyles.body, { color: colors.textSecondary }]}>{tooltip?.text}</Text>
          <TouchableOpacity style={[ttStyles.closeBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={[ttStyles.closeText, { color: colors.textInverse }]}>Got it</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Info button ──────────────────────────────────────────────
function InfoButton({ onPress, size = 17, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel="More information"
      accessibilityRole="button"
    >
      <Ionicons name="information-circle-outline" size={size} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ─── Score bar ────────────────────────────────────────────────
function ScoreBar({ score, colors }) {
  return (
    <View style={[barStyles.track, { backgroundColor: colors.borderLight }]}>
      <View style={[barStyles.fill, { width: `${score}%`, backgroundColor: getScoreColor(score) }]} />
    </View>
  );
}

// ─── Metric pill ──────────────────────────────────────────────
function MetricPill({ icon, val, infoKey, onInfo, colors }) {
  return (
    <TouchableOpacity
      style={[pillStyles.pill, { backgroundColor: colors.borderLight }]}
      onPress={() => onInfo(infoKey)}
      activeOpacity={0.65}
      accessibilityLabel={`${val} — tap to learn more`}
    >
      <Ionicons name={icon} size={11} color={colors.textTertiary} />
      <Text style={[pillStyles.val, { color: colors.textSecondary }]}>{val}</Text>
      <Ionicons name="information-circle-outline" size={10} color={colors.textTertiary} style={{ marginLeft: 1 }} />
    </TouchableOpacity>
  );
}

// ─── Expandable history card ──────────────────────────────────
function HistoryItem({ log, colors, userId, onInfo }) {
  const [expanded,       setExpanded]       = useState(false);
  const [insight,        setInsight]        = useState(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && insight === null && !loadingInsight) {
      setLoadingInsight(true);
      try {
        const data = await getInsightByDate(userId, log.date);
        setInsight(data);
      } catch { /* best-effort */ }
      finally { setLoadingInsight(false); }
    }
  };

  return (
    <View style={[histStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Always-visible summary row */}
      <TouchableOpacity
        style={histStyles.headerRow}
        onPress={handleToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Check-in for ${formatDate(log.date)}, tap to ${expanded ? 'collapse' : 'expand'}`}
      >
        <View style={[histStyles.dateWrap, { backgroundColor: colors.primaryLight }]}>
          <Text style={[histStyles.dayNum, { color: colors.primary }]}>
            {new Date(log.date + 'T00:00:00').getDate()}
          </Text>
          <Text style={[histStyles.monthStr, { color: colors.primary }]}>
            {new Date(log.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
          </Text>
        </View>
        <View style={histStyles.info}>
          <Text style={[histStyles.logTitle, { color: colors.textPrimary }]}>{formatDate(log.date)}</Text>
          <View style={histStyles.metrics}>
            <MetricPill icon="moon-outline"    val={`${log.sleep}h`}        infoKey="sleep"    onInfo={onInfo} colors={colors} />
            <MetricPill icon="happy-outline"   val={moodEmoji(log.mood)}    infoKey="mood"     onInfo={onInfo} colors={colors} />
            <MetricPill icon="water-outline"   val={`${log.water}g`}        infoKey="water"    onInfo={onInfo} colors={colors} />
            <MetricPill icon="barbell-outline" val={log.exercise || 'None'} infoKey="exercise" onInfo={onInfo} colors={colors} />
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textTertiary}
        />
      </TouchableOpacity>

      {/* Expanded detail */}
      {expanded && (
        <View style={[histStyles.detail, { borderTopColor: colors.border }]}>
          {loadingInsight ? (
            <View style={histStyles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[histStyles.loadingText, { color: colors.textSecondary }]}>Loading full details…</Text>
            </View>
          ) : (
            <>
              {/* ── Scores ── */}
              {insight && (
                <View style={[histStyles.scoresBlock, { backgroundColor: colors.borderLight }]}>
                  <Text style={[histStyles.blockTitle, { color: colors.textPrimary }]}>Health Scores</Text>
                  <View style={histStyles.scoresRow}>
                    <ScoreChip label="Overall"  score={insight.overallScore}  colors={colors} />
                    <ScoreChip label="Physical" score={insight.physicalScore} colors={colors} />
                    <ScoreChip label="Mental"   score={insight.mentalScore}   colors={colors} />
                  </View>
                  {insight.riskLevel && (
                    <View style={[histStyles.riskBadge, {
                      backgroundColor: getRiskBgColor(insight.riskLevel?.toLowerCase(), colors),
                      borderColor:     getRiskColor(insight.riskLevel?.toLowerCase()),
                    }]}>
                      <Ionicons
                        name={insight.riskLevel === 'High' ? 'alert-circle' : insight.riskLevel === 'Medium' ? 'warning' : 'checkmark-circle'}
                        size={13}
                        color={getRiskColor(insight.riskLevel?.toLowerCase())}
                      />
                      <Text style={[histStyles.riskText, { color: getRiskColor(insight.riskLevel?.toLowerCase()) }]}>
                        {insight.riskLevel} Risk
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* ── Mental health ── */}
              <DetailBlock title="Mental Health" colors={colors}>
                <DataRow label="Mood"       value={`${MOOD_OPTIONS.find((m) => m.value === log.mood)?.emoji || ''} ${MOOD_OPTIONS.find((m) => m.value === log.mood)?.label || log.mood}`} colors={colors} />
                <DataRow label="Stress"     value={`${log.stress}/5`}     colors={colors} />
                <DataRow label="Anxiety"    value={`${log.anxiety}/5`}    colors={colors} />
                <DataRow label="Loneliness" value={`${log.loneliness}/5`} colors={colors} />
                <DataRow label="Motivation" value={`${log.motivation}/5`} colors={colors} />
              </DetailBlock>

              {/* ── Sleep & activity ── */}
              <DetailBlock title="Sleep & Activity" colors={colors}>
                <DataRow label="Sleep"         value={`${log.sleep}h`} colors={colors} />
                <DataRow label="Sleep Quality" value={SLEEP_QUALITY.find((q) => q.value === log.sleepQuality)?.label || `${log.sleepQuality}`} colors={colors} />
                <DataRow label="Exercise"      value={EXERCISE_TYPES.find((e) => e.value === log.exercise)?.label || log.exercise || 'None'} colors={colors} />
                <DataRow label="Water"         value={`${log.water} glasses`} colors={colors} />
                {log.symptoms?.length > 0 && (
                  <DataRow
                    label="Symptoms"
                    value={log.symptoms.map((s) => SYMPTOM_OPTIONS.find((x) => x.value === s)?.label || s).join(', ')}
                    colors={colors}
                  />
                )}
              </DetailBlock>

              {/* ── Diet & substances ── */}
              <DetailBlock title="Diet & Substances" colors={colors}>
                <DataRow label="Meals"         value={`${log.meals}`}           colors={colors} />
                <DataRow label="Coffee"        value={`${log.coffee} cups`}     colors={colors} />
                <DataRow label="Energy Drinks" value={`${log.energyDrinks}`}    colors={colors} />
                <DataRow label="Alcohol"       value={`${log.alcohol} drinks`}  colors={colors} />
                {log.eatingHabits?.length > 0 && (
                  <DataRow
                    label="Eating Habits"
                    value={log.eatingHabits.map((h) => EATING_HABITS.find((x) => x.value === h)?.label || h).join(', ')}
                    colors={colors}
                  />
                )}
              </DetailBlock>

              {/* ── Patterns ── */}
              {insight?.patterns?.length > 0 && (
                <View style={histStyles.cardSection}>
                  <Text style={[histStyles.blockTitle, { color: colors.textPrimary }]}>
                    Detected Patterns ({insight.patterns.length})
                  </Text>
                  {insight.patterns.map((p) => <InsightCard key={p.id} pattern={p} />)}
                </View>
              )}

              {/* ── Suggestions ── */}
              {insight?.suggestions?.length > 0 && (
                <View style={histStyles.cardSection}>
                  <Text style={[histStyles.blockTitle, { color: colors.textPrimary }]}>
                    Suggestions ({insight.suggestions.length})
                  </Text>
                  {insight.suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
                </View>
              )}

              {/* No insight loaded yet (fetch returned null) */}
              {!insight && !loadingInsight && (
                <Text style={[histStyles.noInsight, { color: colors.textTertiary }]}>
                  No AI insights found for this date.
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── History detail helpers ───────────────────────────────────
function DetailBlock({ title, colors, children }) {
  return (
    <View style={[histStyles.detailBlock, { backgroundColor: colors.borderLight }]}>
      <Text style={[histStyles.blockTitle, { color: colors.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

function DataRow({ label, value, colors }) {
  return (
    <View style={histStyles.dataRow}>
      <Text style={[histStyles.dataLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[histStyles.dataValue, { color: colors.textPrimary }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function ScoreChip({ label, score, colors }) {
  return (
    <View style={histStyles.scoreChip}>
      <Text style={[histStyles.scoreNum, { color: getScoreColor(score) }]}>{score}</Text>
      <Text style={[histStyles.scoreLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────
const dedupeByDate = (arr) => {
  const seen = new Map();
  for (const item of arr) seen.set(item.date, item);
  return [...seen.values()];
};

const shortDate = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatInsightDateTime = (ins) => {
  if (ins.createdAt?.seconds) {
    const d = new Date(ins.createdAt.seconds * 1000);
    return (
      d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' · ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );
  }
  return formatDate(ins.date);
};

const moodEmoji = (m) => ['', '😔', '😕', '😐', '🙂', '😄'][m] || '😐';

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (c) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: c.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm, gap: 2 },
  title:    { ...Typography.h2, color: c.textPrimary },
  subtitle: { ...Typography.bodySmall, color: c.textSecondary },
  // Average Score card
  avgCard: {
    backgroundColor: c.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: c.border, gap: Spacing.sm,
  },
  cardHeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:       { ...Typography.label, color: c.textSecondary },
  avgScoreRow:     { flexDirection: 'row', alignItems: 'flex-end' },
  avgNumber:       { ...Typography.h1, lineHeight: 48 },
  avgOutOf:        { ...Typography.h3, color: c.textTertiary, marginBottom: 6 },
  avgBarTrack:     { height: 8, backgroundColor: c.borderLight, borderRadius: Radius.full, overflow: 'hidden' },
  avgBarFill:      { height: '100%', borderRadius: Radius.full },
  avgNote:         { ...Typography.caption, color: c.textSecondary, lineHeight: 18 },
  twoCol:          { flexDirection: 'row', gap: Spacing.sm },
  halfCard: {
    flex: 1, backgroundColor: c.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: c.border, gap: Spacing.xs, minHeight: 108,
  },
  noDataText:      { ...Typography.caption, color: c.textTertiary, lineHeight: 17, marginTop: 4 },
  trendValueRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.xs },
  trendNumber:     { ...Typography.h4, fontWeight: '700' },
  trendSub:        { ...Typography.caption, color: c.textSecondary },
  checkInNumber:   { ...Typography.h2, marginTop: Spacing.xs },
  checkInSub:      { ...Typography.caption, color: c.textSecondary, lineHeight: 17 },
  // Tabs
  tabRow: {
    flexDirection: 'row', backgroundColor: c.borderLight,
    borderRadius: Radius.md, padding: 3, gap: 3,
  },
  tab:           { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.sm },
  tabActive:     { backgroundColor: c.surface },
  tabText:       { ...Typography.label, color: c.textSecondary },
  tabTextActive: { color: c.primaryContrast },
  // Chart
  chartCard: {
    backgroundColor: c.surface, borderRadius: Radius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: c.border, gap: Spacing.md, overflow: 'hidden',
  },
  chartTitle:    { ...Typography.h4, color: c.textPrimary },
  chart:         { borderRadius: Radius.md, marginLeft: -Spacing.sm },
  notEnoughData: { padding: Spacing.lg, alignItems: 'center' },
  notEnoughText: { ...Typography.body, color: c.textSecondary, textAlign: 'center' },
  legend:        { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  legendItem:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:     { width: 10, height: 10, borderRadius: 5 },
  legendLabel:   { ...Typography.caption, color: c.textSecondary },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  dayLabel:  { ...Typography.caption, color: c.textSecondary, width: 90, lineHeight: 15 },
  riskDot:   { width: 8, height: 8, borderRadius: 4 },
  dayScore:  { ...Typography.label, width: 28, textAlign: 'right' },
  historyList:  { gap: Spacing.sm },
  emptyText:    { ...Typography.body, color: c.textTertiary, textAlign: 'center', padding: Spacing.lg },
  // Graph
  graphExplainer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: c.primaryLight, borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: c.primary + '30',
  },
  graphExplainerText: { ...Typography.bodySmall, color: c.textPrimary, flex: 1, lineHeight: 20 },
});

const ttStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  card:    { width: '100%', borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.sm },
  header:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title:   { ...Typography.h4, flex: 1 },
  body:    { ...Typography.body, lineHeight: 22 },
  closeBtn:  { alignSelf: 'flex-end', borderRadius: Radius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  closeText: { ...Typography.button },
});

const barStyles = StyleSheet.create({
  track: { flex: 1, height: 8, borderRadius: Radius.full, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: Radius.full },
});

const pillStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  val:  { ...Typography.caption },
});

const histStyles = StyleSheet.create({
  card:       { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  headerRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  dateWrap:   { width: 44, height: 44, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  dayNum:     { ...Typography.h4 },
  monthStr:   { ...Typography.caption },
  info:       { flex: 1, gap: 4 },
  logTitle:   { ...Typography.bodySmall, fontWeight: '600' },
  metrics:    { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  // Expanded detail
  detail:       { borderTopWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  loadingRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  loadingText:  { ...Typography.bodySmall },
  // Scores block
  scoresBlock:  { borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  blockTitle:   { ...Typography.label, marginBottom: 2 },
  scoresRow:    { flexDirection: 'row', justifyContent: 'space-around' },
  scoreChip:    { alignItems: 'center', gap: 2 },
  scoreNum:     { ...Typography.h3, fontWeight: '700' },
  scoreLabel:   { ...Typography.caption },
  riskBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, borderWidth: 1.5 },
  riskText:     { ...Typography.label, fontWeight: '600' },
  // Detail blocks
  detailBlock:  { borderRadius: Radius.md, padding: Spacing.md, gap: 5 },
  dataRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 2 },
  dataLabel:    { ...Typography.caption, flex: 1 },
  dataValue:    { ...Typography.caption, fontWeight: '600', flex: 2, textAlign: 'right' },
  // Patterns / suggestions section
  cardSection:  { gap: 4 },
  noInsight:    { ...Typography.caption, textAlign: 'center', paddingVertical: Spacing.sm },
});
