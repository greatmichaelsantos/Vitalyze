import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, SafeAreaView, ActivityIndicator, Image,
  Modal, TextInput, KeyboardAvoidingView, Platform, Animated, LayoutAnimation,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, getDocs, collection, query, where, onSnapshot, updateDoc, setDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { getLatestInsight, getUserProfile } from '../../services/firestoreService';
import { getScoreColor, getRiskColor, getRiskBgColor } from '../../utils/colors';
import { PRESENCE_COLORS } from '../../utils/presenceColors';
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
  const { fontSizeMultiplier } = useAccessibility();
  const styles             = useMemo(() => makeStyles(colors, fontSizeMultiplier), [colors, fontSizeMultiplier]);

  // Profile state
  const [profile, setProfile] = useState(null);

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

  // Score info modal state
  const [scoreInfoModal,      setScoreInfoModal]      = useState(false);
  const [showPhysicalFormula, setShowPhysicalFormula] = useState(false);
  const [showMentalFormula,   setShowMentalFormula]   = useState(false);
  const [showOverallFormula,  setShowOverallFormula]  = useState(false);

  // No-circle modal state
  const [noCircleModal, setNoCircleModal] = useState(false);
  const [isJoining,     setIsJoining]     = useState(false);
  const [joinCode,      setJoinCode]      = useState('');
  const [joinBusy,      setJoinBusy]      = useState(false);
  const [joinError,     setJoinError]     = useState('');

  // Cache witty statuses per uid so they don't re-randomize on re-render.
  // Keyed by uid, cleared whenever the logged-in user changes (i.e. logout/login).
  const wittyStatusCache = useRef({});
  useEffect(() => { wittyStatusCache.current = {}; }, [user?.uid]);

  useEffect(() => {
    if (!scoreInfoModal) {
      setShowPhysicalFormula(false);
      setShowMentalFormula(false);
      setShowOverallFormula(false);
    }
  }, [scoreInfoModal]);


  useEffect(() => {
    getUserProfile(user.uid).then(setProfile).catch(() => {});
  }, [user.uid]);

  const scoreExplanation = useMemo(() => {
    if (!insight) return null;
    return generateScoreExplanation(
      { overall: insight.overallScore, physical: insight.physicalScore, mental: insight.mentalScore },
      insight,
      profile,
    );
  }, [insight, profile]);

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await getLatestInsight(user.uid);
      console.log('[HomeScreen] physicalBreakdown:', data?.physicalBreakdown);
      console.log('[HomeScreen] mentalBreakdown:', data?.mentalBreakdown);
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
      const members = membersSnap.docs
        .filter((d) => !d.data().removed)
        .map((d) => ({ uid: d.id, ...d.data() }));
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
        const members = snap.docs
          .filter((d) => !d.data().removed)
          .map((d) => ({ uid: d.id, ...d.data() }));
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

  const handleOpenNoCircleModal = useCallback(() => {
    setIsJoining(false);
    setJoinCode('');
    setJoinBusy(false);
    setJoinError('');
    setNoCircleModal(true);
  }, []);

  const handleModalJoin = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { setJoinError('Enter an invite code.'); return; }
    setJoinBusy(true);
    setJoinError('');
    try {
      const q    = query(collection(db, 'circles'), where('inviteCode', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) { setJoinError('No circle found with that code.'); setJoinBusy(false); return; }
      const circleDoc   = snap.docs[0];
      const newCircleId = circleDoc.id;
      const prof        = await getUserProfile(user.uid);
      await setDoc(doc(db, 'circleMembers', newCircleId, 'members', user.uid), {
        displayName:    prof?.displayName || user.displayName || user.email,
        photoURL:       prof?.photoURL    || user.photoURL    || null,
        presenceStatus: 'Online',
        joinedAt:       serverTimestamp(),
      }, { merge: true });
      await updateDoc(doc(db, 'circles', newCircleId), { members: arrayUnion(user.uid) });
      await AsyncStorage.setItem(`circle_id_${user.uid}`, newCircleId);
      setNoCircleModal(false);
      await loadCircle();
    } catch (err) {
      console.warn('handleModalJoin:', err);
      setJoinError('Something went wrong. Try again.');
    } finally {
      setJoinBusy(false);
    }
  }, [joinCode, user, loadCircle]);

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
              {profile?.displayName || user.displayName || user.email?.split('@')[0] || 'there'}!
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
              onShowModal={handleOpenNoCircleModal}
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

            <View style={styles.scoreTitleRow}>
              <Text style={styles.sectionTitle}>
                {isToday ? "Today's Scores" : `Scores from ${formatDate(insight.date)}`}
              </Text>
              <TouchableOpacity
                onPress={() => setScoreInfoModal(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="What does your score mean?"
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.scoreRow}>
              <ScoreCard score={insight.physicalScore} label="Physical" size={90}  colors={colors} />
              <ScoreCard score={insight.overallScore}  label="Overall"  size={100} colors={colors} riskLevel={insight.riskLevel} />
              <ScoreCard score={insight.mentalScore}   label="Mental"   size={90}  colors={colors} />
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
              onShowModal={handleOpenNoCircleModal}
            />

            {insight.alerts?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Active Alerts</Text>
                {insight.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onPress={() => navigation.navigate('Insights')} />)}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Score Info Modal ── */}
      <Modal
        visible={scoreInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setScoreInfoModal(false)}
      >
        <View style={styles.infoModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setScoreInfoModal(false)}
          />
          <View style={[styles.infoModalCard, { backgroundColor: colors.surface }]}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={[styles.infoModalHeader, { color: colors.textPrimary }]}>
                {scoreExplanation ? 'Your Score Breakdown' : 'What Does Your Score Mean?'} 🧠
              </Text>

              {scoreExplanation ? (
                <>
                  {/* Overall */}
                  <View style={styles.infoScoreSection}>
                    <View style={styles.infoScoreHeaderRow}>
                      <Text style={[styles.infoScoreNumber, { color: scoreExplanation.overall.color }]}>
                        {scoreExplanation.overall.score}
                      </Text>
                      <Text style={[styles.infoScoreTitle, { color: colors.textPrimary }]}>Overall</Text>
                    </View>
                    <Text style={[styles.infoSummaryText, { color: colors.textSecondary }]}>
                      {scoreExplanation.overall.summary}
                    </Text>
                    {insight?.physicalBreakdown && insight?.mentalBreakdown ? (
                      <Text style={[styles.overallEquationText, { color: colors.textSecondary }]}>
                        {`Physical (${insight.physicalScore}) + Mental (${insight.mentalScore}) ÷ 2 = Overall ${insight.overallScore}`}
                      </Text>
                    ) : (
                      <FormulaToggle
                        open={showOverallFormula}
                        onToggle={() => setShowOverallFormula((v) => !v)}
                        rows={OVERALL_FORMULA_ROWS}
                        colors={colors}
                        styles={styles}
                      />
                    )}
                  </View>

                  <View style={[styles.infoSectionDivider, { backgroundColor: colors.border }]} />

                  {/* Physical */}
                  <View style={styles.infoScoreSection}>
                    <View style={styles.infoScoreHeaderRow}>
                      <Text style={[styles.infoScoreNumber, { color: scoreExplanation.physical.color }]}>
                        {scoreExplanation.physical.score}
                      </Text>
                      <Text style={[styles.infoScoreTitle, { color: colors.textPrimary }]}>Physical</Text>
                    </View>
                    {scoreExplanation.physical.factors.map((f, i) => (
                      <InfoFactorRow key={i} factor={f} colors={colors} styles={styles} />
                    ))}
                    {insight?.physicalBreakdown ? (
                      <BreakdownToggle
                        open={showPhysicalFormula}
                        onToggle={() => setShowPhysicalFormula((v) => !v)}
                        breakdown={insight.physicalBreakdown}
                        totalLabel="Your Physical score"
                        totalScore={insight.physicalScore}
                        colors={colors}
                        styles={styles}
                      />
                    ) : (
                      <FormulaToggle
                        open={showPhysicalFormula}
                        onToggle={() => setShowPhysicalFormula((v) => !v)}
                        rows={PHYSICAL_FORMULA_ROWS}
                        colors={colors}
                        styles={styles}
                      />
                    )}
                  </View>

                  <View style={[styles.infoSectionDivider, { backgroundColor: colors.border }]} />

                  {/* Mental */}
                  <View style={styles.infoScoreSection}>
                    <View style={styles.infoScoreHeaderRow}>
                      <Text style={[styles.infoScoreNumber, { color: scoreExplanation.mental.color }]}>
                        {scoreExplanation.mental.score}
                      </Text>
                      <Text style={[styles.infoScoreTitle, { color: colors.textPrimary }]}>Mental</Text>
                    </View>
                    {scoreExplanation.mental.factors.map((f, i) => (
                      <InfoFactorRow key={i} factor={f} colors={colors} styles={styles} />
                    ))}
                    {insight?.mentalBreakdown ? (
                      <BreakdownToggle
                        open={showMentalFormula}
                        onToggle={() => setShowMentalFormula((v) => !v)}
                        breakdown={insight.mentalBreakdown}
                        totalLabel="Your Mental score"
                        totalScore={insight.mentalScore}
                        colors={colors}
                        styles={styles}
                      />
                    ) : (
                      <FormulaToggle
                        open={showMentalFormula}
                        onToggle={() => setShowMentalFormula((v) => !v)}
                        rows={MENTAL_FORMULA_ROWS}
                        colors={colors}
                        styles={styles}
                      />
                    )}
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.infoModalIntro, { color: colors.textSecondary }]}>
                    Your health score is Mend's way of summing up how you're doing — physically and mentally — based on what you shared in your check-in.
                  </Text>
                  {[
                    { color: '#22C55E', bg: '#22C55E18', range: '80–100', label: "You're doing great! Keep it up." },
                    { color: '#EAB308', bg: '#EAB30818', range: '60–79',  label: "Pretty good, but there's room to grow." },
                    { color: '#F97316', bg: '#F9731618', range: '40–59',  label: "Some things need your attention." },
                    { color: '#EF4444', bg: '#EF444418', range: '0–39',   label: "Your body or mind may need support right now." },
                  ].map((item) => (
                    <View key={item.range} style={[styles.infoRangePill, { backgroundColor: item.bg, borderColor: item.color + '50' }]}>
                      <View style={[styles.infoRangeDot, { backgroundColor: item.color }]} />
                      <Text style={[styles.infoRangeLabel, { color: item.color }]}>{item.range}</Text>
                      <Text style={[styles.infoRangeText, { color: colors.textPrimary }]}>{item.label}</Text>
                    </View>
                  ))}
                  <Text style={[styles.infoSubHeader, { color: colors.textPrimary }]}>What affects your score</Text>
                  {[
                    '💤  Sleep & Energy',
                    '🏃  Exercise & Movement',
                    '🥗  Diet & Hydration',
                    '😊  Mood & Stress',
                    '🧘  Emotional Wellbeing',
                    '⚖️  BMI & Physical Health',
                  ].map((item) => (
                    <Text key={item} style={[styles.infoFactorRow, { color: colors.textSecondary }]}>{item}</Text>
                  ))}
                </>
              )}

              <Text style={[styles.infoFooterNote, { color: colors.textTertiary }]}>
                Scores update every time you check in. The more honest you are, the more accurate your insights.
              </Text>

              <TouchableOpacity
                style={[styles.infoCloseBtn, { backgroundColor: colors.primary }]}
                onPress={() => setScoreInfoModal(false)}
                accessibilityRole="button"
              >
                <Text style={[styles.infoCloseBtnText, { color: colors.textInverse }]}>Got it 👍</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── No Circle Modal ── */}
      <Modal
        visible={noCircleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setNoCircleModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setNoCircleModal(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setNoCircleModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={[styles.modalIconWrap, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="people-circle-outline" size={48} color={colors.primaryContrast} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Your Circle</Text>
            <Text style={[styles.modalBody, { color: colors.textSecondary }]}>
              Connect with friends and family to stay accountable and see each other's wellbeing.
            </Text>

            {!isJoining ? (
              <>
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { setNoCircleModal(false); navigation.navigate('Circle', { createMode: true }); }}
                  accessibilityRole="button"
                  accessibilityLabel="Create a Circle"
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.textInverse} />
                  <Text style={[styles.modalBtnText, { color: colors.textInverse }]}>Create a Circle</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalOutlinedBtn, { borderColor: colors.primary }]}
                  onPress={() => setIsJoining(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Join a Circle"
                >
                  <Text style={[styles.modalBtnText, { color: colors.primaryContrast }]}>Join a Circle</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      borderColor:     joinError ? colors.error : colors.border,
                      color:           colors.textPrimary,
                      backgroundColor: colors.background,
                    },
                  ]}
                  placeholder="Enter invite code (e.g. ABC123)"
                  placeholderTextColor={colors.textTertiary}
                  value={joinCode}
                  onChangeText={(v) => { setJoinCode(v); setJoinError(''); }}
                  autoCapitalize="characters"
                  autoFocus
                  maxLength={8}
                  accessibilityLabel="Invite code"
                />
                {!!joinError && (
                  <Text style={[styles.modalErrorText, { color: colors.error }]}>{joinError}</Text>
                )}
                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary, opacity: joinBusy ? 0.6 : 1 }]}
                  onPress={handleModalJoin}
                  disabled={joinBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Submit invite code"
                >
                  <Text style={[styles.modalBtnText, { color: colors.textInverse }]}>
                    {joinBusy ? 'Joining…' : 'Submit'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalOutlinedBtn, { borderColor: colors.border }]}
                  onPress={() => { setIsJoining(false); setJoinCode(''); setJoinError(''); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalBtnText, { color: colors.textSecondary }]}>Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Formula data ────────────────────────────────────────────────────────────

const PHYSICAL_FORMULA_ROWS = [
  { label: 'Sleep Duration',    value: 'up to 25 pts' },
  { label: 'Exercise/Activity', value: 'up to 25 pts' },
  { label: 'Hydration',         value: 'up to 20 pts' },
  { label: 'Diet Quality',      value: 'up to 20 pts' },
  { label: 'BMI Adjustment',    value: '±10 pts penalty' },
  { divider: true },
  { label: 'Max possible',      value: '= 100 pts', bold: true },
];

const MENTAL_FORMULA_ROWS = [
  { label: 'Mood & Emotions',  value: 'up to 30 pts' },
  { label: 'Stress Level',     value: 'up to 25 pts' },
  { label: 'Sleep Quality',    value: 'up to 25 pts' },
  { label: 'Emotional Safety', value: 'up to 20 pts' },
  { divider: true },
  { label: 'Max possible',     value: '= 100 pts', bold: true },
];

const OVERALL_FORMULA_ROWS = [
  { label: 'Physical Score', value: '50% weight' },
  { label: 'Mental Score',   value: '50% weight' },
  { divider: true },
  { label: 'Overall',        value: '(Physical + Mental) ÷ 2', bold: true },
];

// ── FormulaToggle ───────────────────────────────────────────────────────────

function FormulaToggle({ open, onToggle, rows, colors, styles }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue:         open ? 1 : 0,
      duration:        180,
      useNativeDriver: true,
    }).start();
  }, [open]);

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  const rotateStyle = {
    transform: [{
      rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
    }],
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.formulaToggle}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="How is this calculated"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.formulaToggleText, { color: colors.primary }]}>How is this calculated?</Text>
        <Animated.View style={rotateStyle}>
          <Ionicons name="chevron-down" size={12} color={colors.primary} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={[styles.formulaBox, { backgroundColor: colors.background }]}>
          {rows.map((row, i) =>
            row.divider ? (
              <View key={i} style={[styles.formulaDivider, { backgroundColor: colors.border }]} />
            ) : (
              <View key={i} style={styles.formulaRow}>
                <Text style={[
                  row.bold ? styles.formulaTotalLabel : styles.formulaLabel,
                  { color: colors.textPrimary },
                ]}>
                  {row.label}
                </Text>
                <Text style={[
                  row.bold ? styles.formulaTotalValue : styles.formulaValue,
                  { color: row.bold ? colors.textPrimary : colors.textSecondary },
                ]}>
                  {row.value}
                </Text>
              </View>
            )
          )}
        </View>
      )}
    </View>
  );
}

// ── BreakdownToggle ─────────────────────────────────────────────────────────

const factorPtColor = (earned, max) => {
  if (earned < 0 || max === 0) return '#EF4444';
  const ratio = earned / max;
  if (ratio >= 1.0) return '#22C55E';
  if (ratio >= 0.5) return '#EAB308';
  return '#EF4444';
};

function BreakdownToggle({ open, onToggle, breakdown, totalLabel, totalScore, colors, styles }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rotation, {
      toValue:         open ? 1 : 0,
      duration:        180,
      useNativeDriver: true,
    }).start();
  }, [open]);

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggle();
  };

  const rotateStyle = {
    transform: [{
      rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }),
    }],
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.formulaToggle}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="How is this calculated"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.formulaToggleText, { color: colors.primary }]}>How is this calculated?</Text>
        <Animated.View style={rotateStyle}>
          <Ionicons name="chevron-down" size={12} color={colors.primary} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={[styles.formulaBox, { backgroundColor: colors.background }]}>
          {breakdown.map((item, i) => {
            const isBMI   = item.max === 0;
            const ptColor = factorPtColor(item.earned, item.max);
            const ptText  = isBMI
              ? `−${Math.abs(item.earned)} pts penalty`
              : `${item.earned} / ${item.max} pts`;
            return (
              <View key={i} style={styles.bdRowWrap}>
                <View style={styles.bdRowTop}>
                  <Text style={styles.bdEmoji}>{item.emoji}</Text>
                  <Text style={[styles.bdLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                  <Text style={[styles.bdPts, { color: ptColor }]}>{ptText}</Text>
                </View>
                {!!item.note && (
                  <Text style={[styles.bdNote, { color: colors.textTertiary }]}>{item.note}</Text>
                )}
                {i < breakdown.length - 1 && (
                  <View style={[styles.bdRowDivider, { backgroundColor: colors.border }]} />
                )}
              </View>
            );
          })}
          <View style={[styles.bdTotalDivider, { backgroundColor: colors.border }]} />
          <View style={styles.bdTotalRow}>
            <Text style={[styles.bdTotalLabel, { color: colors.textPrimary }]}>{totalLabel}:</Text>
            <Text style={[styles.bdTotalValue, { color: scoreColor(totalScore) }]}>
              {totalScore} / 100
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── InfoFactorRow ───────────────────────────────────────────────────────────

function InfoFactorRow({ factor, colors, styles }) {
  const dotColor =
    factor.impact === 'positive' ? '#22C55E' :
    factor.impact === 'negative' ? '#EF4444' : '#9CA3AF';
  return (
    <View style={styles.infoPersonFactorRow}>
      <View style={[styles.infoPersonDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.infoPersonLabel, { color: colors.textPrimary }]}>{factor.label}</Text>
      <Text style={[styles.infoPersonNote, { color: colors.textSecondary }]}>{factor.note}</Text>
    </View>
  );
}

// ── Circle section ──────────────────────────────────────────────────────────

function CircleSection({ circleId, circleData, circleMembers, circleLoading, expandedUid, onToggle, userId, colors, styles, navigation, insight, wittyStatusCache, onShowModal }) {
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
            onPress={onShowModal}
            accessibilityRole="button"
            accessibilityLabel="Create Circle"
          >
            <Text style={styles.circleSmallPrimaryText} maxFontSizeMultiplier={1.3}>Create Circle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleSmallOutlined, { flex: 1 }]}
            onPress={onShowModal}
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
          {member.photoURL ? (
            <Image source={{ uri: member.photoURL }} style={styles.memberAvatarImage} resizeMode="cover" />
          ) : (
            <View style={[styles.memberAvatar, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.memberAvatarLetter, { color: colors.primaryContrast }]}>
                {avatarLetter}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.presenceDot,
              { backgroundColor: PRESENCE_COLORS[member.presenceStatus] ?? PRESENCE_COLORS.Online },
            ]}
          />
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
        <Text style={[ckStyles.value, { color: colors.textPrimary }]}   maxFontSizeMultiplier={1.3} numberOfLines={1}>{value}</Text>
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
  value:   { ...Typography.bodySmall, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 28 },
});

// ── Existing sub-components (unchanged) ────────────────────────────────────

function ScoreCard({ score, label, size, colors, riskLevel }) {
  return (
    <View style={scStyles.wrap}>
      <HealthScoreRing
        score={score}
        label={label}
        size={size}
        strokeWidth={size > 100 ? 11 : 9}
        riskLevel={riskLevel}
      />
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

// ── Utility functions ───────────────────────────────────────────────────────

const scoreColor = (score) => {
  if (score >= 80) return '#22C55E';
  if (score >= 60) return '#EAB308';
  if (score >= 40) return '#F97316';
  return '#EF4444';
};

function generateScoreExplanation(scores, latestLog, profile) {
  if (!latestLog) return null;
  const nw  = latestLog.nodeWeights || {};
  const shr = latestLog.selfHarmRisk || 'none';

  // ── Physical factors ──
  const physicalFactors = [];

  const sleepW = nw['sleep_hours'];
  if (sleepW !== undefined) {
    if (sleepW >= 0.625) {
      physicalFactors.push({ label: 'Sleep Duration', impact: 'positive', note: 'Getting 7+ hours — great for recovery' });
    } else if (sleepW < 0.5) {
      physicalFactors.push({ label: 'Sleep Duration', impact: 'negative', note: 'Less than 6 hours — body needs more rest' });
    } else {
      physicalFactors.push({ label: 'Sleep Duration', impact: 'neutral', note: '6–7 hours — close to target' });
    }
  }

  const exerciseW = nw['exercise'];
  if (exerciseW !== undefined) {
    if (exerciseW > 0) {
      physicalFactors.push({ label: 'Exercise', impact: 'positive', note: 'Active today — movement boosts physical score' });
    } else {
      physicalFactors.push({ label: 'Exercise', impact: 'negative', note: 'No activity logged today' });
    }
  }

  const waterW = nw['water'];
  if (waterW !== undefined) {
    if (waterW >= 0.6) {
      physicalFactors.push({ label: 'Hydration', impact: 'positive', note: '6+ glasses — well hydrated' });
    } else if (waterW < 0.4) {
      physicalFactors.push({ label: 'Hydration', impact: 'negative', note: 'Under 4 glasses — drink more water' });
    } else {
      physicalFactors.push({ label: 'Hydration', impact: 'neutral', note: 'Moderate hydration today' });
    }
  }

  if (profile?.weight && profile?.height) {
    const hm  = profile.height / 100;
    const bmi = profile.weight / (hm * hm);
    if (bmi >= 18.5 && bmi < 25) {
      physicalFactors.push({ label: 'BMI', impact: 'positive', note: `BMI ${bmi.toFixed(1)} — healthy range` });
    } else if (bmi < 18.5) {
      physicalFactors.push({ label: 'BMI', impact: 'negative', note: `BMI ${bmi.toFixed(1)} — underweight` });
    } else if (bmi < 30) {
      physicalFactors.push({ label: 'BMI', impact: 'negative', note: `BMI ${bmi.toFixed(1)} — overweight` });
    } else {
      physicalFactors.push({ label: 'BMI', impact: 'negative', note: `BMI ${bmi.toFixed(1)} — obese range` });
    }
  }

  // ── Mental factors ──
  const mentalFactors = [];

  const moodW = nw['mood'];
  if (moodW !== undefined) {
    if (moodW >= 0.75) {
      mentalFactors.push({ label: 'Mood', impact: 'positive', note: 'Positive mood reported today' });
    } else if (moodW <= 0.25) {
      mentalFactors.push({ label: 'Mood', impact: 'negative', note: 'Low mood — this weighs on mental score' });
    } else {
      mentalFactors.push({ label: 'Mood', impact: 'neutral', note: 'Moderate mood today' });
    }
  }

  const stressW = nw['stress'];
  if (stressW !== undefined) {
    if (stressW <= 0.25) {
      mentalFactors.push({ label: 'Stress', impact: 'positive', note: 'Low stress — good for mental clarity' });
    } else if (stressW >= 0.75) {
      mentalFactors.push({ label: 'Stress', impact: 'negative', note: 'High stress reported today' });
    } else {
      mentalFactors.push({ label: 'Stress', impact: 'neutral', note: 'Moderate stress level' });
    }
  }

  const sleepQW = nw['sleep_quality'];
  if (sleepQW !== undefined) {
    if (sleepQW >= 0.75) {
      mentalFactors.push({ label: 'Sleep Quality', impact: 'positive', note: 'Good quality sleep — supports mental health' });
    } else if (sleepQW < 0.5) {
      mentalFactors.push({ label: 'Sleep Quality', impact: 'negative', note: 'Poor sleep quality affects mood and focus' });
    } else {
      mentalFactors.push({ label: 'Sleep Quality', impact: 'neutral', note: 'Average sleep quality' });
    }
  }

  if (shr === 'medium' || shr === 'high') {
    mentalFactors.push({ label: 'Emotional Safety', impact: 'negative', note: 'Some concerning signals detected — please reach out for support' });
  }

  // ── Overall summary ──
  const allFactors = [...physicalFactors, ...mentalFactors];
  const positives  = allFactors.filter((f) => f.impact === 'positive');
  const negatives  = allFactors.filter((f) => f.impact === 'negative');
  let overallSummary;
  if (positives.length > 0 && negatives.length > 0) {
    overallSummary = `Your biggest boost today is ${positives[0].label.toLowerCase()}, while ${negatives[0].label.toLowerCase()} is pulling your score down.`;
  } else if (positives.length > 0) {
    overallSummary = `Great work — ${positives[0].label.toLowerCase()} is contributing positively to your overall health score.`;
  } else if (negatives.length > 0) {
    overallSummary = `${negatives[0].label} seems to be your biggest hurdle today. Small improvements here will move your score the most.`;
  } else {
    overallSummary = 'Your scores reflect everything you shared in your check-in. Keep tracking for better insights over time.';
  }

  return {
    overall:  { score: scores.overall,  color: scoreColor(scores.overall),  summary: overallSummary, factors: [] },
    physical: { score: scores.physical, color: scoreColor(scores.physical), factors: physicalFactors },
    mental:   { score: scores.mental,   color: scoreColor(scores.mental),   factors: mentalFactors  },
  };
}

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

const makeStyles = (c, f) => StyleSheet.create({
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
  scoreTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // ── Score Info Modal ────────────────────────────────────────────────────
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  infoModalCard: {
    borderRadius: 20,
    padding: Spacing.lg,
    gap: Spacing.sm,
    width: '100%',
    maxHeight: '88%',
  },
  infoModalHeader: {
    fontSize: 20 * f,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  infoModalIntro: { ...Typography.body, textAlign: 'center', marginBottom: Spacing.xs },
  infoRangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    marginBottom: 6,
  },
  infoRangeDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  infoRangeLabel: { ...Typography.label, fontWeight: '700', minWidth: 48 },
  infoRangeText:  { ...Typography.bodySmall, flex: 1 },
  infoSubHeader:  { ...Typography.h4, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  infoFactorRow:  { ...Typography.body, paddingVertical: 3 },
  infoFooterNote: {
    ...Typography.caption,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  infoCloseBtn: {
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  infoCloseBtnText: { ...Typography.button },

  // Personalized score sections
  infoScoreSection:  { gap: Spacing.xs, paddingVertical: Spacing.xs },
  infoScoreHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  infoScoreNumber:   { fontSize: 36 * f, fontWeight: '800', letterSpacing: -1 },
  infoScoreTitle:    { ...Typography.h3 },
  infoSummaryText:   { ...Typography.body, fontStyle: 'italic' },
  infoSectionDivider: { height: 1, marginVertical: Spacing.sm },
  infoPersonFactorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: 3,
  },
  infoPersonDot:   { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  infoPersonLabel: { ...Typography.bodySmall, fontWeight: '600', width: 110, flexShrink: 0 },
  infoPersonNote:  { ...Typography.bodySmall, flex: 1 },

  // Formula collapsible
  formulaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  formulaToggleText: { fontSize: 12 * f, fontWeight: '500' },
  formulaBox: {
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
    gap: 5,
  },
  formulaRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formulaDivider:    { height: 1, marginVertical: 3 },
  formulaLabel: {
    fontSize: 12 * f,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
  },
  formulaValue: {
    fontSize: 12 * f,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'right',
  },
  formulaTotalLabel: {
    fontSize: 12 * f,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
  },
  formulaTotalValue: {
    fontSize: 12 * f,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textAlign: 'right',
  },

  // Breakdown rows (BreakdownToggle)
  bdRowWrap:      { gap: 2, paddingVertical: 4 },
  bdRowTop:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bdEmoji:        { fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 },
  bdLabel:        { ...Typography.bodySmall, flex: 1, fontWeight: '500' },
  bdPts:          { ...Typography.bodySmall, fontWeight: '700', textAlign: 'right' },
  bdNote:         { ...Typography.caption, fontStyle: 'italic', marginLeft: 26 },
  bdRowDivider:   { height: StyleSheet.hairlineWidth, marginTop: 4 },
  bdTotalDivider: { height: 1, marginVertical: 6 },
  bdTotalRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bdTotalLabel:   { ...Typography.bodySmall, fontWeight: '600' },
  bdTotalValue:   { ...Typography.bodySmall, fontWeight: '800' },
  overallEquationText: {
    fontSize: 12 * f,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 8,
    textAlign: 'center',
  },

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
    width: 44,
    height: 44,
    marginRight: 16,
  },
  memberAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarLetter: { ...Typography.h4, lineHeight: 20 },
  presenceDot: {
    position:     'absolute',
    top:          0,
    right:        -2,
    width:        12,
    height:       12,
    borderRadius: 6,
    borderWidth:  2,
    borderColor:  c.surface,
  },
  scorePill: {
    position: 'absolute',
    bottom: -4,
    right: -6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  scorePillText: { ...Typography.caption, fontWeight: '700', fontSize: 10 * f },
  memberInfo:    { flex: 1, gap: 1, marginLeft: 4 },
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

  // ── No Circle Modal ──────────────────────────────────────────────────────
  modalOverlay:  { flex: 1, justifyContent: 'flex-end' },
  modalSheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:              24,
    paddingBottom:        Spacing.xxl,
    gap:                  Spacing.md,
    alignItems:           'center',
  },
  modalHandle: {
    width:        40,
    height:       4,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: Spacing.xs,
  },
  modalCloseBtn: {
    position:       'absolute',
    top:            16,
    right:          16,
    width:          MIN_TOUCH,
    height:         MIN_TOUCH,
    alignItems:     'center',
    justifyContent: 'center',
  },
  modalIconWrap: {
    width:          72,
    height:         72,
    borderRadius:   Radius.full,
    alignItems:     'center',
    justifyContent: 'center',
  },
  modalTitle:    { ...Typography.h2, textAlign: 'center' },
  modalBody:     { ...Typography.body, textAlign: 'center' },
  modalPrimaryBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'center',
    gap:              Spacing.xs,
    borderRadius:     Radius.md,
    paddingVertical:  Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight:        MIN_TOUCH,
    width:            '100%',
  },
  modalOutlinedBtn: {
    alignItems:       'center',
    justifyContent:   'center',
    borderWidth:      1,
    borderRadius:     Radius.md,
    paddingVertical:  Spacing.md,
    paddingHorizontal: Spacing.lg,
    minHeight:        MIN_TOUCH,
    width:            '100%',
  },
  modalBtnText:  { ...Typography.body, fontWeight: '600' },
  modalInput: {
    borderWidth:       1,
    borderRadius:      Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.md,
    ...Typography.body,
    minHeight:         MIN_TOUCH,
    width:             '100%',
    textAlign:         'center',
    letterSpacing:     2,
  },
  modalErrorText: { ...Typography.bodySmall },
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

