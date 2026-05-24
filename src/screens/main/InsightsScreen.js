import React, { useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, StatusBar, SafeAreaView,
  TouchableOpacity, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { getLatestInsight } from '../../services/firestoreService';
import { generateRiskFactors } from '../../services/aiPatternDetection';
import { getScoreColor, getRiskColor, getRiskBgColor } from '../../utils/colors';
import { Typography, Spacing, Radius } from '../../utils/constants';
import HealthScoreRing from '../../components/HealthScoreRing';
import InsightCard from '../../components/InsightCard';
import SuggestionCard from '../../components/SuggestionCard';
import AlertCard from '../../components/AlertCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';

// Accent colors come from the theme so dark mode gets lighter variants automatically.
// Light: physicalAccent #0F6E56, mentalAccent #7C3AED, suggestAccent #BA7517
// Dark:  physicalAccent #1D9E75, mentalAccent #A878F8, suggestAccent #D4921F

const PHYSICAL_CATEGORIES    = new Set(['physical', 'diet']);
const PHYSICAL_SUGGESTION_IDS = new Set(['s1','s2','s3','h1','h2','h3','e1','e2','e3','c1','c2','c3','n1','n2','n3']);
const PHYSICAL_FACTOR_IDS    = new Set(['sleep_hours','sleep_quality','exercise','water','caffeine','alcohol']);

function classifyDomainRisk(score, patterns) {
  const hasHighPattern = patterns.some((p) => p.severity === 'high');
  if (score < 40 || hasHighPattern) return 'High';
  if (score < 70) return 'Medium';
  return 'Low';
}

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function InsightsScreen({ navigation }) {
  const { user }              = useAuth();
  const { colors, isDark }    = useTheme();
  const { fontSizeMultiplier } = useAccessibility();
  const styles                = useMemo(() => makeStyles(colors, fontSizeMultiplier), [colors, fontSizeMultiplier]);
  const scrollViewRef = useRef(null);
  const [insight,  setInsight]   = useState(null);
  const [loading,  setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,    setError]     = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await getLatestInsight(user.uid);
      console.log('[InsightsScreen] selfHarmRisk received:', data?.selfHarmRisk ?? '(not present)');
      console.log('[InsightsScreen] full insight object:', JSON.stringify(data, null, 2));
      setInsight(data);
      console.log('[InsightsScreen] insight set to:', JSON.stringify(data));
    } catch {
      setError("Couldn't load insights. Check your connection and pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.uid]);

  useFocusEffect(useCallback(() => {
    console.log('[InsightsScreen] useFocusEffect triggered');
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    setLoading(true);
    load();
  }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) return <LoadingSpinner fullScreen message="Loading insights…" />;

  const ai = insight?.dailyAISummary;
  const enrichPatterns = (patterns) =>
    patterns.map((p) => ({
      ...p,
      description: ai?.patternInsights?.[p.name] || p.description,
    }));

  const physicalPatterns    = enrichPatterns(insight?.patterns?.filter((p) => PHYSICAL_CATEGORIES.has(p.category)) ?? []);
  const mentalPatterns      = enrichPatterns(insight?.patterns?.filter((p) => !PHYSICAL_CATEGORIES.has(p.category)) ?? []);
  const physicalSuggestions = insight?.suggestions?.filter((s) => PHYSICAL_SUGGESTION_IDS.has(s.id)) ?? [];
  const mentalSuggestions   = insight?.suggestions?.filter((s) => !PHYSICAL_SUGGESTION_IDS.has(s.id)) ?? [];
  const allFactors          = insight?.nodeWeights ? generateRiskFactors(insight.nodeWeights) : [];
  const physicalFactors     = allFactors.filter((f) => PHYSICAL_FACTOR_IDS.has(f.id));
  const mentalFactors       = allFactors.filter((f) => !PHYSICAL_FACTOR_IDS.has(f.id));
  const physicalRisk        = insight ? classifyDomainRisk(insight.physicalScore, physicalPatterns) : null;
  const mentalRisk          = insight ? classifyDomainRisk(insight.mentalScore, mentalPatterns) : null;
  const physicalPatternIds  = new Set(physicalPatterns.map((p) => p.id));
  const mentalPatternIds    = new Set(mentalPatterns.map((p) => p.id));
  const overallAlerts       = insight?.alerts?.filter((a) => a.patternId === 'overall_critical') ?? [];
  const physicalAlerts      = insight?.alerts?.filter((a) => physicalPatternIds.has(a.patternId)) ?? [];
  const mentalAlerts        = insight?.alerts?.filter((a) => mentalPatternIds.has(a.patternId)) ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle} accessibilityRole="header">Health Insights</Text>
        <Text style={styles.screenSubtitle} accessibilityLiveRegion="polite">
          {insight?.date ? `Last check-in: ${formatDate(insight.date)}` : 'No check-in data yet'}
        </Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View
            style={styles.errorBox}
            accessible={true}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            accessibilityLabel={error}
          >
            <Ionicons name="cloud-offline-outline" size={16} color={colors.error} />
            <Text style={styles.errorText} maxFontSizeMultiplier={1.5}>{error}</Text>
          </View>
        ) : null}

        {!insight ? (
          <EmptyState
            icon="bulb-outline"
            title="No insights yet"
            message="Complete a daily check-in to see your AI-generated health insights and patterns."
            actionLabel="Start Check-in"
            onAction={() => navigation.navigate('CheckIn')}
          />
        ) : (
          <>
            <DailySummaryCard summary={ai?.dailySummary} colors={colors} />

            {/* Overall summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.scoreRow}>
                <HealthScoreRing score={insight.overallScore}  label="Overall"  size={108} strokeWidth={11} />
                <View style={styles.scoreDivider} />
                <HealthScoreRing score={insight.physicalScore} label="Physical" size={88}  strokeWidth={9} />
                <HealthScoreRing score={insight.mentalScore}   label="Mental"   size={88}  strokeWidth={9} />
              </View>
              <OverallRiskPill riskLevel={insight.riskLevel} colors={colors} />
              {!!ai?.scoreInsight && (
                <Text style={[aiStyles.scoreInsight, { color: colors.textSecondary }]}>{ai.scoreInsight}</Text>
              )}
              {overallAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}
            </View>

            {console.log('[InsightsScreen] checking selfHarmRisk:', insight?.selfHarmRisk) || null}
            {(insight.selfHarmRisk === 'medium' || insight.selfHarmRisk === 'high') && (
              <CrisisSupport selfHarmRisk={insight.selfHarmRisk} colors={colors} />
            )}

            <DomainSection
              domain="physical"
              title="Physical Health"
              subtitle="Sleep · Exercise · Hydration · Diet · Caffeine · Alcohol"
              icon="body-outline"
              score={insight.physicalScore}
              riskLevel={physicalRisk}
              patterns={physicalPatterns}
              suggestions={physicalSuggestions}
              alerts={physicalAlerts}
              factors={physicalFactors}
              colors={colors}
            />

            <DomainSection
              domain="mental"
              title="Mental Health"
              subtitle="Mood · Stress · Anxiety · Loneliness · Motivation"
              icon="pulse-outline"
              score={insight.mentalScore}
              riskLevel={mentalRisk}
              patterns={mentalPatterns}
              suggestions={mentalSuggestions}
              alerts={mentalAlerts}
              factors={mentalFactors}
              colors={colors}
            />

            <MealInsightCard mealInsight={ai?.mealInsight} colors={colors} />

            {console.log('[Insights] personalizedRecommendations:', insight?.personalizedRecommendations)}
            {Array.isArray(insight.personalizedRecommendations) &&
              insight.personalizedRecommendations.length > 0 && (
                <PersonalizedRecommendations
                  recommendations={insight.personalizedRecommendations}
                  colors={colors}
                />
              )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const CRISIS_HOTLINES = [
  { label: 'Hopeline PH',         number: '8804-4673' },
  { label: 'NCMH Crisis Hotline', number: '1553' },
  { label: 'In Touch Crisis Line', number: '0917-800-8654' },
  { label: 'Text HELLO to',       number: '4673' },
];

function CrisisSupport({ selfHarmRisk, colors }) {
  console.log('[InsightsScreen] rendering crisis card for selfHarmRisk:', selfHarmRisk);
  return (
    <View style={[crisisStyles.card, { backgroundColor: colors.mentalAccent }]}>
      <Text style={crisisStyles.emoji}>💙</Text>
      <Text style={crisisStyles.title}>You Are Not Alone</Text>
      <Text style={crisisStyles.body}>
        We noticed you may be carrying something heavy right now. These free and confidential hotlines are here for you anytime:
      </Text>
      {CRISIS_HOTLINES.map((h, i) => (
        <React.Fragment key={h.label}>
          {i > 0 && <View style={crisisStyles.divider} />}
          <TouchableOpacity
            style={crisisStyles.hotlineRow}
            onPress={() => Linking.openURL(`tel:${h.number}`)}
            accessibilityRole="link"
            accessibilityLabel={`${h.label} ${h.number}`}
          >
            <Ionicons name="call-outline" size={15} color="rgba(255,255,255,0.8)" />
            <Text style={crisisStyles.hotlineLabel} numberOfLines={1}>{h.label}</Text>
            <Text style={crisisStyles.hotlineNumber} numberOfLines={1}>{h.number}</Text>
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </View>
  );
}

function OverallRiskPill({ riskLevel, colors }) {
  const color = getRiskColor(riskLevel?.toLowerCase());
  const bg    = getRiskBgColor(riskLevel?.toLowerCase(), colors);
  const icon  = riskLevel === 'High' ? 'alert-circle' : riskLevel === 'Medium' ? 'warning' : 'checkmark-circle';
  return (
    <View style={[pillStyles.pill, { backgroundColor: bg, borderColor: color }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[pillStyles.text, { color }]}>{riskLevel} Overall Risk</Text>
    </View>
  );
}

function DomainSection({ domain, title, subtitle, icon, score, riskLevel, patterns, suggestions, alerts, factors, colors }) {
  const isPhysical  = domain === 'physical';
  const accentColor = isPhysical ? colors.physicalAccent : colors.mentalAccent;
  const lightColor  = isPhysical ? colors.physicalLight  : colors.mentalLight;
  const riskColor   = getRiskColor(riskLevel?.toLowerCase());
  const riskBg      = getRiskBgColor(riskLevel?.toLowerCase(), colors);
  const riskIcon    = riskLevel === 'High' ? 'alert-circle' : riskLevel === 'Medium' ? 'warning' : 'checkmark-circle';
  const emptyPatternMsg = isPhysical
    ? 'No physical health patterns detected. Your physical indicators look good.'
    : 'No mental health patterns detected. Your mental indicators look good.';
  const emptySuggestionMsg = isPhysical
    ? 'No physical health suggestions at this time.'
    : 'No mental health suggestions at this time.';

  return (
    <View style={[domainStyles.container, { borderColor: accentColor + '40', backgroundColor: colors.surface }]}>
      <View style={[domainStyles.header, { backgroundColor: lightColor, borderBottomColor: accentColor + '30' }]}>
        <View style={[domainStyles.iconWrap, { backgroundColor: accentColor + '22' }]}>
          <Ionicons name={icon} size={20} color={accentColor} />
        </View>
        <View style={domainStyles.headerText}>
          <Text style={[domainStyles.title, { color: accentColor }]}>{title}</Text>
          <Text style={[domainStyles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        </View>
        <HealthScoreRing score={score} label="Score" size={64} strokeWidth={7} />
      </View>

      <View style={domainStyles.body}>
        <View style={[domainStyles.riskPill, { backgroundColor: riskBg, borderColor: riskColor }]}>
          <Ionicons name={riskIcon} size={15} color={riskColor} />
          <Text style={[domainStyles.riskText, { color: riskColor }]}>{riskLevel} Risk</Text>
          <Text style={[domainStyles.riskSub, { color: colors.textSecondary }]}>
            {riskLevel === 'High' ? 'Needs attention today' : riskLevel === 'Medium' ? 'Some factors to improve' : 'All indicators healthy'}
          </Text>
        </View>

        {alerts.length > 0 && (
          <View style={domainStyles.subsection}>
            {alerts.map((a) => <AlertCard key={a.id} alert={a} />)}
          </View>
        )}

        <SubsectionLabel label="Detected Patterns" count={patterns.length} accentColor={accentColor} colors={colors} />
        {patterns.length > 0
          ? patterns.map((p) => <InsightCard key={p.id} pattern={p} />)
          : (
            <View style={[domainStyles.emptyMsg, { backgroundColor: colors.borderLight }]}>
              <Ionicons name="checkmark-circle-outline" size={22} color={colors.low} />
              <Text style={[domainStyles.emptyText, { color: colors.textSecondary }]}>{emptyPatternMsg}</Text>
            </View>
          )
        }

        {factors.length > 0 && <DomainFactors factors={factors} accentColor={accentColor} colors={colors} />}

        <SubsectionLabel label="Suggestions" count={suggestions.length} accentColor={colors.suggestAccent} colors={colors} />
        {suggestions.length > 0
          ? suggestions.map((s) => <SuggestionCard key={s.id} suggestion={s} collapsible />)
          : (
            <View style={[domainStyles.emptyMsg, { backgroundColor: colors.borderLight }]}>
              <Ionicons name="trophy-outline" size={22} color={colors.low} />
              <Text style={[domainStyles.emptyText, { color: colors.textSecondary }]}>{emptySuggestionMsg}</Text>
            </View>
          )
        }
      </View>
    </View>
  );
}

function SubsectionLabel({ label, count, accentColor, colors }) {
  return (
    <View style={subStyles.row}>
      <View style={[subStyles.accent, { backgroundColor: accentColor }]} />
      <Text style={[subStyles.label, { color: colors.textPrimary }]}>{label}</Text>
      {count > 0 && (
        <View style={[subStyles.badge, { backgroundColor: accentColor + '22' }]}>
          <Text style={[subStyles.badgeText, { color: accentColor }]}>{count}</Text>
        </View>
      )}
    </View>
  );
}

function DomainFactors({ factors, accentColor, colors }) {
  const impactColor = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' };
  return (
    <View style={[factorStyles.card, { backgroundColor: colors.borderLight }]}>
      <Text style={[factorStyles.heading, { color: colors.textPrimary }]}>Factor Breakdown</Text>
      {factors.map((f) => {
        const color = impactColor[f.impact];
        return (
          <View key={f.id} style={[factorStyles.row, { borderBottomColor: colors.border }]}>
            <View style={factorStyles.labelRow}>
              <Ionicons name={f.icon} size={13} color={color} />
              <Text style={[factorStyles.label, { color: colors.textPrimary }]}>{f.label}</Text>
              <View style={[factorStyles.badge, { backgroundColor: color + '22', borderColor: color + '66' }]}>
                <Text style={[factorStyles.badgeText, { color }]}>
                  {f.impact === 'low' ? 'Good' : f.impact === 'medium' ? 'Fair' : 'Needs Attention'}
                </Text>
              </View>
            </View>
            <View style={[factorStyles.barTrack, { backgroundColor: colors.border }]}>
              <View style={[factorStyles.barFill, { width: `${f.score}%`, backgroundColor: color }]} />
            </View>
            <Text style={[factorStyles.description, { color: colors.textSecondary }]}>{f.description}</Text>
          </View>
        );
      })}
    </View>
  );
}

function DailySummaryCard({ summary, colors }) {
  if (!summary) return null;
  return (
    <View style={[aiStyles.summaryCard, { backgroundColor: colors.mentalLight, borderColor: colors.mentalAccent + '40' }]}>
      <View style={aiStyles.summaryHeader}>
        <Text style={aiStyles.summaryIcon}>✨</Text>
        <Text style={[aiStyles.summaryTitle, { color: colors.mentalAccent }]}>Today's Overview</Text>
      </View>
      <Text style={[aiStyles.summaryText, { color: colors.textPrimary }]}>{summary}</Text>
    </View>
  );
}

function MealInsightCard({ mealInsight, colors }) {
  if (!mealInsight) return null;
  return (
    <View style={[aiStyles.mealCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[aiStyles.mealTitle, { color: colors.textPrimary }]}>🍽️ Today's Meal</Text>
      <Text style={[aiStyles.mealText, { color: colors.textSecondary }]}>{mealInsight}</Text>
    </View>
  );
}

const aiStyles = StyleSheet.create({
  summaryCard: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  summaryIcon: { fontSize: 18 },
  summaryTitle: { ...Typography.h4, fontWeight: '700' },
  summaryText:  { ...Typography.body, lineHeight: 22 },
  scoreInsight: { ...Typography.bodySmall, fontStyle: 'italic', textAlign: 'center' },
  mealCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  mealTitle: { ...Typography.h4, fontWeight: '700' },
  mealText:  { ...Typography.bodySmall, lineHeight: 20 },
});

function PersonalizedRecommendations({ recommendations, colors }) {
  return (
    <View style={prStyles.wrapper}>
      <SubsectionLabel label="Personalized for You 🎯" count={recommendations.length} accentColor={colors.mentalAccent} colors={colors} />
      {recommendations.map((rec, i) => (
        <View key={i} style={prStyles.card}>
          <Text style={[prStyles.recTitle, { color: colors.primary }]}>✨ {rec.title}</Text>
          <Text style={[prStyles.recBody, { color: colors.textSecondary }]}>{rec.body}</Text>
        </View>
      ))}
    </View>
  );
}

const prStyles = StyleSheet.create({
  wrapper: { gap: Spacing.xs },
  card: {
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 16,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  recTitle: {
    ...Typography.h4,
    fontWeight: '700',
  },
  recBody: {
    ...Typography.bodySmall,
    lineHeight: 20,
  },
});

const makeStyles = (c, f) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  screenHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 2,
  },
  screenTitle:    { ...Typography.h2, color: c.textPrimary },
  screenSubtitle: { ...Typography.bodySmall, color: c.textSecondary },
  summaryCard: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.md,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  scoreDivider: { width: 1, height: 80, backgroundColor: c.border, marginHorizontal: Spacing.xs },
  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs,
    backgroundColor: c.errorLight, borderRadius: Radius.sm, padding: Spacing.sm,
  },
  errorText: { ...Typography.bodySmall, color: c.error, flex: 1 },
});

const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 1,
    borderRadius: Radius.full, borderWidth: 1.5,
  },
  text: { ...Typography.label, fontWeight: '700' },
});

const domainStyles = StyleSheet.create({
  container:  { borderRadius: Radius.lg, borderWidth: 1.5, overflow: 'hidden' },
  header:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderBottomWidth: 1 },
  iconWrap:   { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, gap: 2 },
  title:      { ...Typography.h4, fontWeight: '700' },
  subtitle:   { ...Typography.caption, lineHeight: 16 },
  body:       { padding: Spacing.md, gap: Spacing.md },
  riskPill:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2 },
  riskText:   { ...Typography.label, fontWeight: '700' },
  riskSub:    { ...Typography.caption, flex: 1 },
  subsection: { gap: 4 },
  emptyMsg:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.md, padding: Spacing.md },
  emptyText:  { ...Typography.bodySmall, flex: 1 },
});

const subStyles = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.xs },
  accent:    { width: 3, height: 16, borderRadius: 2 },
  label:     { ...Typography.label, flex: 1 },
  badge:     { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { ...Typography.caption, fontWeight: '700' },
});

const factorStyles = StyleSheet.create({
  card:        { borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.md },
  heading:     { ...Typography.label },
  row:         { gap: 5, paddingBottom: Spacing.sm, borderBottomWidth: 1 },
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label:       { ...Typography.label, flex: 1 },
  badge:       { paddingHorizontal: 5, paddingVertical: 1, borderRadius: Radius.full, borderWidth: 1 },
  badgeText:   { ...Typography.caption, fontWeight: '600' },
  barTrack:    { height: 5, borderRadius: Radius.full, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: Radius.full },
  description: { ...Typography.caption, lineHeight: 17 },
});

const crisisStyles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  emoji:         { fontSize: 40, textAlign: 'center' },
  title:         { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, color: '#fff', textAlign: 'center' },
  body:          { ...Typography.bodySmall, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: Spacing.xs },
  divider:       { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.2)' },
  hotlineRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs + 2 },
  hotlineLabel:  { ...Typography.label, color: 'rgba(255,255,255,0.9)', flex: 1 },
  hotlineNumber: { ...Typography.label, fontWeight: '700', color: '#fff', flexShrink: 0 },
});
