import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, getDocs, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getLatestInsight } from '../../services/firestoreService';
import { getScoreColor, getRiskColor, getRiskBgColor } from '../../utils/colors';
import { Typography, Spacing, Radius, MIN_TOUCH, RISK_LEVELS } from '../../utils/constants';
import HealthScoreRing from '../../components/HealthScoreRing';
import AlertCard from '../../components/AlertCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';
import { db } from '../../../firebase';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatLastCheckin(timestamp) {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isCheckedInToday(timestamp) {
  if (!timestamp) return false;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function exerciseDisplay(val) {
  if (!val || val === 'none' || val === 0) return 'None';
  if (typeof val === 'string') return val.charAt(0).toUpperCase() + val.slice(1);
  return String(val);
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const styles             = useMemo(() => makeStyles(colors), [colors]);

  // Insight state
  const [insight,    setInsight]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');

  // Circle state
  const [circleId,      setCircleId]      = useState(null);
  const [circleData,    setCircleData]    = useState(null);
  const [circleMembers, setCircleMembers] = useState([]);
  const [circleLoading, setCircleLoading] = useState(true);
  const [expandedUid,   setExpandedUid]   = useState(null);

  // Cache witty statuses per uid so they don't re-randomize on re-render.
  // Keyed by uid, cleared whenever the logged-in user changes (i.e. logout/login).
  const wittyStatusCache = useRef({});
  useEffect(() => { wittyStatusCache.current = {}; }, [user?.uid]);

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await getLatestInsight(user.uid);
      setInsight(data);
    } catch {
      setError("Couldn't load your health data. Check your connection and pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.uid]);

  const loadCircle = useCallback(async () => {
    try {
      setCircleLoading(true);
      // Step 1: primary key
      let storedId = await AsyncStorage.getItem(`circle_id_${user.uid}`);
      // Step 2: fallback key used by older versions
      if (!storedId) {
        storedId = await AsyncStorage.getItem(`circleId_${user.uid}`);
      }
      // Step 3: Firestore query as last resort
      if (!storedId) {
        const q    = query(collection(db, 'circles'), where('members', 'array-contains', user.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          storedId = snap.docs[0].id;
          await AsyncStorage.setItem(`circle_id_${user.uid}`, storedId);
        }
      }
      if (!storedId) {
        setCircleId(null);
        setCircleData(null);
        setCircleMembers([]);
        return;
      }
      const circleSnap = await getDoc(doc(db, 'circles', storedId));
      if (!circleSnap.exists()) {
        await AsyncStorage.removeItem(`circle_id_${user.uid}`);
        setCircleId(null);
        setCircleData(null);
        setCircleMembers([]);
        return;
      }
      const data = circleSnap.data();
      setCircleId(storedId);
      setCircleData(data);

      const membersSnap = await getDocs(
        collection(db, 'circleMembers', storedId, 'members')
      );
      const members = membersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      // Own row always first
      members.sort((a, b) => {
        if (a.uid === user.uid) return -1;
        if (b.uid === user.uid) return 1;
        return 0;
      });
      setCircleMembers(members);
    } catch (err) {
      console.warn('HomeScreen loadCircle:', err);
    } finally {
      setCircleLoading(false);
    }
  }, [user.uid]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      setExpandedUid(null);
      load();
      loadCircle();
    }, [load, loadCircle])
  );

  // Real-time listener: re-renders circle member rows whenever any member doc changes
  useEffect(() => {
    if (!circleId) return;
    const unsub = onSnapshot(
      collection(db, 'circleMembers', circleId, 'members'),
      (snap) => {
        const members = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        members.sort((a, b) => {
          if (a.uid === user.uid) return -1;
          if (b.uid === user.uid) return 1;
          return 0;
        });
        setCircleMembers(members);
      },
      (err) => console.warn('HomeScreen onSnapshot:', err)
    );
    return () => unsub();
  }, [circleId, user.uid]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
    loadCircle();
  };

  const today   = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const isToday = insight?.date === new Date().toISOString().split('T')[0];

  const handleToggleMember = useCallback((uid) => {
    setExpandedUid((prev) => (prev === uid ? null : uid));
  }, []);

  if (loading) return <LoadingSpinner fullScreen message="Loading your health data…" />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>
              Good {getGreeting()},{' '}
              {user.displayName || user.email?.split('@')[0] || 'there'}!
            </Text>
            <Text style={styles.date}>{today}</Text>
          </View>
          <View style={[styles.statusPill, {
            backgroundColor: isToday ? colors.lowLight   : colors.mediumLight,
            borderColor:     isToday ? colors.low        : colors.medium,
          }]}>
            <View style={[styles.pillDot, { backgroundColor: isToday ? colors.low : colors.medium }]} />
            <Text style={[styles.pillText, { color: isToday ? colors.low : colors.medium }]}>
              {isToday ? 'Checked in today' : 'Check-in needed'}
            </Text>
          </View>
        </View>

        {/* Error banner */}
        {!!error && (
          <View
            style={styles.errorBox}
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={error}
            accessibilityRole="alert"
          >
            <Ionicons name="cloud-offline-outline" size={18} color={colors.error} />
            <Text style={styles.errorText} maxFontSizeMultiplier={1.5}>{error}</Text>
          </View>
        )}

        {/* No check-in yet */}
        {!insight ? (
          <>
            <EmptyState
              icon="clipboard-outline"
              title="No check-in yet"
              message="Complete your first daily check-in to see your health scores and AI insights."
              actionLabel="Start Check-in"
              onAction={() => navigation.navigate('CheckIn')}
            />
            <CircleSection
              circleId={circleId}
              circleData={circleData}
              circleMembers={circleMembers}
              circleLoading={circleLoading}
              expandedUid={expandedUid}
              onToggle={handleToggleMember}
              userId={user.uid}
              colors={colors}
              styles={styles}
              navigation={navigation}
              insight={insight}
              wittyStatusCache={wittyStatusCache}
            />
          </>
        ) : (
          <>
            {/* Today banner */}
            {!isToday && (
              <TouchableOpacity
                style={styles.checkInBanner}
                onPress={() => navigation.navigate('CheckIn')}
                accessibilityLabel="Start today's check-in"
                accessibilityRole="button"
              >
                <Ionicons name="add-circle-outline" size={22} color={colors.primaryContrast} />
                <Text style={styles.checkInBannerText}>Log today's check-in</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primaryContrast} />
              </TouchableOpacity>
            )}

            <Text style={styles.sectionTitle}>
              {isToday ? "Today's Scores" : `Scores from ${formatDate(insight.date)}`}
            </Text>

            <View style={styles.scoreRow}>
              <ScoreCard score={insight.overallScore}  label="Overall"  subtitle="All factors" size={110} colors={colors} riskLevel={insight.riskLevel} />
              <ScoreCard score={insight.physicalScore} label="Physical" subtitle="Body health" size={90}  colors={colors} />
              <ScoreCard score={insight.mentalScore}   label="Mental"   subtitle="Mindset"     size={90}  colors={colors} />
            </View>

            <RiskBadge riskLevel={insight.riskLevel} colors={colors} />

            {insight.patterns?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Detected Patterns</Text>
                {insight.patterns.slice(0, 2).map((p) => (
                  <View key={p.id} style={styles.patternChip}>
                    <View style={[styles.severityDot, { backgroundColor: getRiskColor(p.severity) }]} />
                    <Text style={styles.patternName}>{p.name}</Text>
                  </View>
                ))}
                {insight.patterns.length > 2 && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Insights')}
                    style={styles.seeMoreBtn}
                  >
                    <Text style={styles.seeMoreText}>
                      +{insight.patterns.length - 2} more patterns — View all insights
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.primaryContrast} />
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Circle section — below Detected Patterns, above Active Alerts */}
            <CircleSection
              circleId={circleId}
              circleData={circleData}
              circleMembers={circleMembers}
              circleLoading={circleLoading}
              expandedUid={expandedUid}
              onToggle={handleToggleMember}
              userId={user.uid}
              colors={colors}
              styles={styles}
              navigation={navigation}
              insight={insight}
              wittyStatusCache={wittyStatusCache}
            />

            {insight.alerts?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Active Alerts</Text>
                {insight.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
              </>
            )}

            <View style={styles.quickLinks}>
              <QuickLink icon="bulb-outline"      label="View Insights" color={colors.primary}  onPress={() => navigation.navigate('Insights')} colors={colors} />
              <QuickLink icon="bar-chart-outline" label="Progress"      color={colors.physical} onPress={() => navigation.navigate('Progress')} colors={colors} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Circle section ──────────────────────────────────────────────────────────

function CircleSection({ circleId, circleData, circleMembers, circleLoading, expandedUid, onToggle, userId, colors, styles, navigation, insight, wittyStatusCache }) {
  if (circleLoading) {
    return (
      <View style={styles.circleSectionCard}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  // State 1: no circle
  if (!circleId) {
    return (
      <View style={styles.circleSectionCard}>
        <View style={styles.circleEmptyRow}>
          <View style={[styles.circleEmptyIconWrap, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="people-circle-outline" size={26} color={colors.primaryContrast} />
          </View>
          <View style={styles.circleEmptyTextBlock}>
            <Text style={[styles.circleEmptyTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
              Stay Connected
            </Text>
            <Text style={[styles.circleEmptyBody, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.4}>
              Create or join a circle to see your friends' wellbeing alongside yours.
            </Text>
          </View>
        </View>
        <View style={styles.circleEmptyBtns}>
          <TouchableOpacity
            style={[styles.circleSmallPrimary, { flex: 1 }]}
            onPress={() => navigation.navigate('Circle')}
            accessibilityRole="button"
            accessibilityLabel="Create Circle"
          >
            <Text style={styles.circleSmallPrimaryText} maxFontSizeMultiplier={1.3}>Create Circle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleSmallOutlined, { flex: 1 }]}
            onPress={() => navigation.navigate('Circle')}
            accessibilityRole="button"
            accessibilityLabel="Join Circle"
          >
            <Text style={styles.circleSmallOutlinedText} maxFontSizeMultiplier={1.3}>Join Circle</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // State 2: in a circle
  return (
    <View style={styles.circleSectionCard}>
      {/* Section header */}
      <View style={styles.circleSectionHeader}>
        <Text style={[styles.circleSectionTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3}>
          My Circle
        </Text>
        <Text
          style={[styles.circleNameCaption, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          {circleData?.name}
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Circle')}
          accessibilityRole="button"
          accessibilityLabel="Manage circle"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.manageBtn, { color: colors.primaryContrast }]} maxFontSizeMultiplier={1.3}>
            Manage →
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.circleDivider, { backgroundColor: colors.border }]} />

      {circleMembers.map((member) => (
        <MemberRow
          key={member.uid}
          member={member}
          isMe={member.uid === userId}
          isCreator={member.uid === circleData?.creatorId}
          expanded={expandedUid === member.uid}
          onToggle={() => onToggle(member.uid)}
          colors={colors}
          styles={styles}
          insight={member.uid === userId ? insight : null}
          wittyStatusCache={wittyStatusCache}
        />
      ))}
    </View>
  );
}

// ── Member row ──────────────────────────────────────────────────────────────

function MemberRow({ member, isMe, isCreator, expanded, onToggle, colors, styles, insight, wittyStatusCache }) {
  const today        = new Date().toISOString().split('T')[0];
  const insightToday = insight?.date === today;
  const scores       = isMe && insight
    ? { overall: insight.overallScore, physical: insight.physicalScore, mental: insight.mentalScore }
    : (member.latestScores || { overall: 0, physical: 0, mental: 0 });
  const resolvedRisk    = isMe && insight ? insight.riskLevel : member.latestRiskLevel;
  const hasScore        = isMe ? !!insight : member.lastCheckedIn != null;
  const checkedToday    = isMe ? insightToday : isCheckedInToday(member.lastCheckedIn);
  const memberHasScore  = member.lastCheckedIn != null;
  const riskColor       = getRiskColor(resolvedRisk);
  const riskBg          = getRiskBgColor(resolvedRisk, colors);
  const d               = member.lastCheckInData || {};
  const avatarLetter    = (member.displayName || '?')[0].toUpperCase();
  const youTag          = isCreator && isMe ? 'You (Creator)' : isMe ? 'You' : null;
  const statusColor     = hasScore ? getStatusColor(scores.overall ?? 0) : colors.textTertiary;

  // Stable witty status — compute once per uid and cache it so expand/collapse
  // toggling doesn't re-roll a new random string.
  const cachedWitty = useMemo(() => {
    if (!hasScore || member.customStatus) return null;
    const cache = wittyStatusCache?.current;
    if (!cache) return getWittyStatus(scores.overall ?? 0);
    if (!cache[member.uid]) {
      cache[member.uid] = getWittyStatus(scores.overall ?? 0);
    }
    return cache[member.uid];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.uid, hasScore, member.customStatus]);

  return (
    <View>
      <TouchableOpacity
        style={styles.memberRow}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${member.displayName}, ${expanded ? 'collapse' : 'expand'}`}
        accessibilityState={{ expanded }}
      >
        {/* Avatar with score pill */}
        <View style={styles.memberAvatarWrap}>
          <View style={[styles.memberAvatar, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.memberAvatarLetter, { color: colors.primaryContrast }]}>
              {avatarLetter}
            </Text>
          </View>
          {hasScore && (
            <View style={[styles.scorePill, { backgroundColor: statusColor + '33' }]}>
              <Text style={[styles.scorePillText, { color: statusColor }]}>
                {scores.overall}
              </Text>
            </View>
          )}
        </View>

        {/* Name + you-tag */}
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {member.displayName}
          </Text>
          {!!youTag && (
            <Text style={[styles.youTag, { color: colors.primaryContrast }]} maxFontSizeMultiplier={1.2}>
              {youTag}
            </Text>
          )}
        </View>

        {/* Witty status with colored dot + chevron */}
        <View style={styles.memberStatusWrap}>
          {member.customStatus ? (
            <Text style={[styles.memberWittyStatus, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
              {member.customStatus}
            </Text>
          ) : hasScore ? (
            <View style={styles.memberStatusInner}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.memberWittyStatus, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.2}>
                {cachedWitty}
              </Text>
            </View>
          ) : (
            <Text style={[styles.memberWittyStatus, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.2}>
              😴 No check-in yet
            </Text>
          )}
          <View style={styles.memberChevronWrap}>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textTertiary}
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {expanded && (
        <View style={[styles.memberExpanded, { borderTopColor: colors.border }]}>
          {/* Score rings */}
          <View style={styles.memberRingsRow}>
            <HealthScoreRing score={scores.overall}  label="Overall"  size={64} strokeWidth={6} animate={false} />
            <HealthScoreRing score={scores.physical} label="Physical" size={64} strokeWidth={6} animate={false} />
            <HealthScoreRing score={scores.mental}   label="Mental"   size={64} strokeWidth={6} animate={false} />
          </View>

          {/* Risk badge */}
          {hasScore && (
            <View style={[styles.expandedRiskBadge, { backgroundColor: riskBg, borderColor: riskColor }]}>
              <Ionicons name="shield-checkmark-outline" size={13} color={riskColor} />
              <Text style={[styles.expandedRiskText, { color: riskColor }]} maxFontSizeMultiplier={1.2}>
                {resolvedRisk} Risk
              </Text>
            </View>
          )}

          {/* Check-in detail sections or placeholder */}
          {!checkedToday ? (
            <Text style={[styles.noCheckinToday, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.4}>
              No check-in logged today
            </Text>
          ) : (
            <>
              <CkSectionLabel label="😊  MOOD & MENTAL" />
              <CkRow emoji="😊" label="Mood"       value={d.mood        != null ? `${d.mood}/10`        : '—'} colors={colors} />
              <CkRow emoji="😤" label="Stress"     value={d.stress      != null ? `${d.stress}/10`      : '—'} colors={colors} />
              <CkRow emoji="😰" label="Anxiety"    value={d.anxiety     != null ? `${d.anxiety}/10`     : '—'} colors={colors} />
              <CkRow emoji="🥺" label="Loneliness" value={d.loneliness  != null ? `${d.loneliness}/10`  : '—'} colors={colors} />
              <CkRow emoji="🎯" label="Motivation" value={d.motivation  != null ? `${d.motivation}/10`  : '—'} colors={colors} divider={false} />

              <CkSectionLabel label="😴  SLEEP" />
              <CkRow emoji="🌙" label="Hours"   value={d.sleep        != null ? `${d.sleep} hrs`    : '—'} colors={colors} />
              <CkRow emoji="⭐" label="Quality" value={d.sleepQuality != null ? `${d.sleepQuality}` : '—'} colors={colors} divider={false} />

              <CkSectionLabel label="🏃  ACTIVITY" />
              <CkRow emoji="🏃" label="Exercise" value={d.exercise != null ? `${d.exercise} mins` : '—'} colors={colors} divider={false} />

              <CkSectionLabel label="🥗  DIET" />
              <CkRow emoji="💧" label="Water"         value={d.water        != null ? `${d.water} glasses`        : '—'} colors={colors} />
              <CkRow emoji="☕" label="Coffee"        value={d.coffee       != null ? `${d.coffee} cups`          : '—'} colors={colors} />
              <CkRow emoji="⚡" label="Energy Drinks" value={d.energyDrinks != null ? `${d.energyDrinks}`         : '—'} colors={colors} />
              <CkRow emoji="🍺" label="Alcohol"       value={d.alcohol      != null ? `${d.alcohol} drinks`       : '—'} colors={colors} />
              <CkRow emoji="🥗" label="Eating Habits" value={d.eatingHabits?.length ? d.eatingHabits.join(', ')  : '—'} colors={colors} divider={false} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function CkSectionLabel({ label }) {
  return (
    <Text style={ckStyles.sectionLabel}>{label}</Text>
  );
}

function CkRow({ emoji, label, value, colors, divider = true }) {
  return (
    <>
      <View style={ckStyles.row}>
        <Text style={ckStyles.emoji}>{emoji}</Text>
        <Text style={[ckStyles.label, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text style={[ckStyles.value, { color: colors.textPrimary }]}   maxFontSizeMultiplier={1.3}>{value}</Text>
      </View>
      {divider && <View style={[ckStyles.divider, { backgroundColor: colors.border }]} />}
    </>
  );
}

const ckStyles = StyleSheet.create({
  sectionLabel: {
    ...Typography.caption,
    color: '#6C47FF',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 2,
  },
  row:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: Spacing.xs },
  emoji:   { fontSize: 14, width: 20, textAlign: 'center' },
  label:   { ...Typography.bodySmall, flex: 1 },
  value:   { ...Typography.bodySmall, fontWeight: '700', textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 28 },
});

// ── Existing sub-components (unchanged) ────────────────────────────────────

function ScoreCard({ score, label, subtitle, size, colors, riskLevel }) {
  return (
    <View style={scStyles.wrap}>
      <HealthScoreRing
        score={score}
        label={label}
        size={size}
        strokeWidth={size > 100 ? 11 : 9}
        riskLevel={riskLevel}
      />
      <Text style={[scStyles.subtitle, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.3}>
        {subtitle}
      </Text>
    </View>
  );
}

function RiskBadge({ riskLevel, colors }) {
  const bg    = getRiskBgColor(riskLevel?.toLowerCase(), colors);
  const color = getRiskColor(riskLevel?.toLowerCase());
  const icons = { Low: 'checkmark-circle', Medium: 'warning', High: 'alert-circle' };
  return (
    <View style={[rbStyles.badge, { backgroundColor: bg, borderColor: color }]}>
      <Ionicons name={icons[riskLevel] || 'information-circle'} size={18} color={color} />
      <Text style={[rbStyles.level, { color }]}>{riskLevel} Risk</Text>
      <Text style={[rbStyles.sub, { color: colors.textSecondary }]}>
        {riskLevel === RISK_LEVELS.LOW
          ? 'All indicators look healthy'
          : riskLevel === RISK_LEVELS.MEDIUM
          ? 'Some factors need attention'
          : 'Action recommended today'}
      </Text>
    </View>
  );
}

function QuickLink({ icon, label, color, onPress, colors }) {
  return (
    <TouchableOpacity
      style={[qlStyles.btn, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[qlStyles.iconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[qlStyles.label, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

// ── Utility functions ───────────────────────────────────────────────────────

const getWittyStatus = (score) => {
  const statuses = {
    90: [
      'literally thriving rn 🌟',
      'eating and not missing 💅',
      'main character energy ✨',
      'no notes, immaculate 🏆',
      'slay mode: activated 🔥',
    ],
    75: [
      'doing great, no cap 💪',
      'healthy era unlocked 😤',
      'low key winning 🙌',
      'built different today 💯',
      'understood the assignment 📋',
    ],
    60: [
      'pretty okay bestie 😊',
      'vibing but could vibe harder',
      'mid but make it cute 🌸',
      'not bad not great, balanced 🧘',
      'giving... effort 👀',
    ],
    45: [
      'hanging in there fr 😐',
      'it\'s giving struggle bus 🚌',
      'low cortisol szn 😮‍💨',
      'not dead just tired 💀',
      'surviving, not thriving rn',
    ],
    30: [
      'something\'s wrong with bro 💔',
      'bro is not okay rn 😭',
      'this ain\'t it chief 😔',
      'rough patch arc loading...',
      'sent to the shadow realm 🌑',
    ],
    0: [
      'bro fell off no cap 💀',
      'cooked. absolutely cooked 🍳',
      'thoughts and prayers bestie 🙏',
      'we need to talk fr fr',
      'wellness left the chat 📵',
    ],
  };

  const bucket =
    score >= 90 ? 90 :
    score >= 75 ? 75 :
    score >= 60 ? 60 :
    score >= 45 ? 45 :
    score >= 30 ? 30 : 0;

  const options = statuses[bucket];
  return options[Math.floor(Math.random() * options.length)];
};

const getStatusColor = (score) => {
  if (score >= 75) return '#22C55E';
  if (score >= 45) return '#F59E0B';
  return '#EF4444';
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// ── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (c) => StyleSheet.create({
  safe:    { flex: 1, backgroundColor: c.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  headerLeft: { flex: 1 },
  greeting:   { ...Typography.h2, color: c.textPrimary },
  date:       { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  pillDot:  { width: 7, height: 7, borderRadius: 4 },
  pillText: { ...Typography.caption, fontWeight: '600' },
  sectionTitle:      { ...Typography.h4, color: c.textPrimary, marginTop: Spacing.xs },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  patternChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  severityDot:  { width: 8, height: 8, borderRadius: 4 },
  patternName:  { ...Typography.bodySmall, color: c.textPrimary, flex: 1 },
  seeMoreBtn:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: Spacing.xs },
  seeMoreText:  { ...Typography.label, color: c.primaryContrast },
  quickLinks:   { gap: Spacing.sm, marginTop: Spacing.xs },
  checkInBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.primaryLight,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: c.primary + '40',
  },
  checkInBannerText: { ...Typography.body, color: c.primaryContrast, flex: 1, fontWeight: '600' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: c.errorLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  errorText: { ...Typography.bodySmall, color: c.error, flex: 1 },

  // ── Circle section ──────────────────────────────────────────────────────
  circleSectionCard: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    overflow: 'hidden',
    paddingVertical: Spacing.sm,
  },

  // State 1 — empty
  circleEmptyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  circleEmptyIconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  circleEmptyTextBlock: { flex: 1, gap: 3 },
  circleEmptyTitle:     { ...Typography.h4 },
  circleEmptyBody:      { ...Typography.bodySmall },
  circleEmptyBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  circleSmallPrimary: {
    backgroundColor: c.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  circleSmallPrimaryText: { ...Typography.label, color: c.textInverse, fontWeight: '600' },
  circleSmallOutlined: {
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  circleSmallOutlinedText: { ...Typography.label, color: c.primaryContrast, fontWeight: '600' },

  // State 2 — has circle
  circleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  circleSectionTitle: { ...Typography.h3 },
  circleNameCaption: {
    ...Typography.bodySmall,
    flex: 1,
    textAlign: 'center',
  },
  manageBtn: { ...Typography.label, fontWeight: '600' },
  circleDivider: { height: 1, marginBottom: Spacing.xs },

  // Member rows
  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
    minHeight: MIN_TOUCH,
  },
  memberAvatarWrap: {
    position: 'relative',
    flexShrink: 0,
    width: 36,
    height: 36,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarLetter: { ...Typography.h4, lineHeight: 20 },
  scorePill: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  scorePillText: { ...Typography.caption, fontWeight: '700', fontSize: 10 },
  memberInfo:    { flex: 1, gap: 1 },
  memberName:    { ...Typography.body, fontWeight: '600' },
  youTag:        { ...Typography.caption, fontWeight: '500' },
  memberStatusWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'nowrap',
  },
  memberChevronWrap: {
    marginLeft: 8,
    alignSelf: 'flex-start',
  },
  memberStatusInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexShrink: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    flexShrink: 0,
  },
  memberWittyStatus: { ...Typography.bodySmall, flex: 1, flexShrink: 1, flexWrap: 'wrap', textAlign: 'right' },

  // Expanded
  memberExpanded: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.xs,
  },
  memberRingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  expandedRiskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    alignSelf: 'flex-start',
  },
  expandedRiskText: { ...Typography.caption, fontWeight: '600' },
  noCheckinToday: {
    ...Typography.bodySmall,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingVertical: Spacing.sm,
  },
});

const scStyles = StyleSheet.create({
  wrap:     { alignItems: 'center', gap: 4 },
  subtitle: { ...Typography.caption, textAlign: 'center' },
});

const rbStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
  },
  level: { ...Typography.h4 },
  sub:   { ...Typography.bodySmall, flex: 1 },
});

const qlStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
  },
  iconWrap: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  label:    { ...Typography.body, flex: 1 },
});
