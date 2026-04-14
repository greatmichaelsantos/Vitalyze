import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  SafeAreaView,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '../../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';
import { getRiskColor, getRiskBgColor } from '../../utils/colors';
import HealthScoreRing from '../../components/HealthScoreRing';

// ── Helpers ────────────────────────────────────────────────────────────────

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}

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
  // If it's a recognised exercise type string, capitalise it
  if (typeof val === 'string') return val.charAt(0).toUpperCase() + val.slice(1);
  return String(val);
}

function formatDietRow(d) {
  const parts = [];
  if (d.water != null) parts.push(`${d.water} water`);
  if (d.coffee != null && d.coffee > 0) parts.push(`${d.coffee} coffee`);
  if (d.alcohol != null && d.alcohol > 0) parts.push(`${d.alcohol} alcohol`);
  if (d.junkFood != null && d.junkFood > 0) parts.push(`${d.junkFood} junk food`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

const STATUS_EMOJIS = ['😊', '😴', '💪', '🔥', '😤', '😔', '☕', '🎯', '✨', '😂', '🫠', '💀'];

// ── Screen ─────────────────────────────────────────────────────────────────

export default function CircleScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const styles             = useMemo(() => makeStyles(colors), [colors]);

  const storageKey = `circle_id_${user.uid}`;

  // ── Data state ──────────────────────────────────────────────────────────
  const [circleId,    setCircleId]    = useState(null);
  const [circleData,  setCircleData]  = useState(null);
  const [membersData, setMembersData] = useState([]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [loading,     setLoading]     = useState(true);
  const [creating,    setCreating]    = useState(false);
  const [circleName,  setCircleName]  = useState('');
  const [createBusy,  setCreateBusy]  = useState(false);
  const [createError, setCreateError] = useState('');

  // ── Join modal ──────────────────────────────────────────────────────────
  const [joinVisible, setJoinVisible] = useState(false);
  const [joinCode,    setJoinCode]    = useState('');
  const [joinBusy,    setJoinBusy]    = useState(false);
  const [joinError,   setJoinError]   = useState('');

  // ── Expanded member cards ───────────────────────────────────────────────
  const [expanded, setExpanded] = useState(new Set());

  // ── Copy feedback ───────────────────────────────────────────────────────
  const [copyDone, setCopyDone] = useState(false);

  // ── Custom status ────────────────────────────────────────────────────────
  const [customStatus,  setCustomStatus]  = useState('');
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusDraft,   setStatusDraft]   = useState('');
  const [statusSaving,  setStatusSaving]  = useState(false);
  const statusInputRef = useRef(null);

  // ── Load ────────────────────────────────────────────────────────────────
  const loadCircle = useCallback(async () => {
    try {
      setLoading(true);
      // Step 1: primary key
      let storedId = await AsyncStorage.getItem(storageKey);
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
          await AsyncStorage.setItem(storageKey, storedId);
        }
      }
      if (!storedId) {
        setCircleId(null);
        setCircleData(null);
        setMembersData([]);
        return;
      }

      const circleSnap = await getDoc(doc(db, 'circles', storedId));
      if (!circleSnap.exists()) {
        await AsyncStorage.removeItem(storageKey);
        setCircleId(null);
        setCircleData(null);
        setMembersData([]);
        return;
      }

      const data = circleSnap.data();
      setCircleId(storedId);
      setCircleData(data);

      const memberIds = data.members || [];
      const snaps = await Promise.all(
        memberIds.map((uid) =>
          getDoc(doc(db, 'circleMembers', storedId, 'members', uid))
        )
      );
      setMembersData(
        snaps.map((snap, i) => ({
          uid: memberIds[i],
          ...(snap.exists() ? snap.data() : { displayName: 'Unknown' }),
        }))
      );
    } catch (err) {
      console.warn('CircleScreen loadCircle:', err);
    } finally {
      setLoading(false);
    }
  }, [storageKey]);

  useEffect(() => { loadCircle(); }, [loadCircle]);

  // Load custom status from AsyncStorage for instant local display
  useEffect(() => {
    AsyncStorage.getItem(`custom_status_${user.uid}`)
      .then((v) => { if (v) setCustomStatus(v); })
      .catch(() => {});
  }, [user.uid]);

  // Sync custom status from Firestore member doc once members load
  useEffect(() => {
    const me = membersData.find((m) => m.uid === user.uid);
    if (me?.customStatus !== undefined) setCustomStatus(me.customStatus || '');
  }, [membersData, user.uid]);

  // ── Save custom status ───────────────────────────────────────────────────
  const handleSaveStatus = async () => {
    const trimmed = statusDraft.trim().slice(0, 60);
    setStatusSaving(true);
    try {
      if (circleId) {
        await setDoc(
          doc(db, 'circleMembers', circleId, 'members', user.uid),
          { customStatus: trimmed },
          { merge: true }
        );
      }
      await AsyncStorage.setItem(`custom_status_${user.uid}`, trimmed);
      setCustomStatus(trimmed);
      setEditingStatus(false);
    } catch (err) {
      console.warn('CircleScreen saveStatus:', err);
    } finally {
      setStatusSaving(false);
    }
  };

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name = circleName.trim();
    if (!name) {
      setCreateError('Please enter a name for your circle.');
      return;
    }
    try {
      setCreateBusy(true);
      setCreateError('');
      const inviteCode = generateInviteCode();
      const circleRef  = await addDoc(collection(db, 'circles'), {
        name,
        creatorId:  user.uid,
        inviteCode,
        members:    [user.uid],
        createdAt:  serverTimestamp(),
      });
      await setDoc(
        doc(db, 'circleMembers', circleRef.id, 'members', user.uid),
        {
          displayName:      user.displayName || user.email?.split('@')[0] || 'You',
          latestScores:     { overall: 0, physical: 0, mental: 0 },
          latestRiskLevel:  'Low',
          lastCheckedIn:    null,
          lastCheckInData:  {},
        }
      );
      await AsyncStorage.setItem(storageKey, circleRef.id);
      setCreating(false);
      setCircleName('');
      await loadCircle();
    } catch (err) {
      setCreateError('Failed to create circle. Please try again.');
      console.warn('CircleScreen handleCreate:', err);
    } finally {
      setCreateBusy(false);
    }
  };

  // ── Join ─────────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      setJoinError('Please enter a valid 6-character invite code.');
      return;
    }
    try {
      setJoinBusy(true);
      setJoinError('');
      const q    = query(collection(db, 'circles'), where('inviteCode', '==', code));
      const snap = await getDocs(q);
      if (snap.empty) {
        setJoinError('Circle not found. Check the code and try again.');
        return;
      }
      const cid = snap.docs[0].id;
      await updateDoc(doc(db, 'circles', cid), { members: arrayUnion(user.uid) });
      await setDoc(
        doc(db, 'circleMembers', cid, 'members', user.uid),
        {
          displayName:      user.displayName || user.email?.split('@')[0] || 'You',
          joinedAt:         serverTimestamp(),
          latestScores:     { overall: 0, physical: 0, mental: 0 },
          latestRiskLevel:  'Low',
          lastCheckedIn:    null,
          lastCheckInData:  {},
        }
      );
      await AsyncStorage.setItem(storageKey, cid);
      setJoinVisible(false);
      setJoinCode('');
      await loadCircle();
    } catch (err) {
      setJoinError('Failed to join circle. Please try again.');
      console.warn('CircleScreen handleJoin:', err);
    } finally {
      setJoinBusy(false);
    }
  };

  // ── Copy invite code ─────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(circleData.inviteCode);
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    } catch {
      Alert.alert('Copy failed', 'Could not copy to clipboard.');
    }
  };

  // ── Toggle member expand ─────────────────────────────────────────────────
  const toggleMember = (uid) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // ── Close join modal helper ──────────────────────────────────────────────
  const closeJoin = () => {
    setJoinVisible(false);
    setJoinCode('');
    setJoinError('');
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Nav header */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle} maxFontSizeMultiplier={1.3}>My Circle</Text>
        <View style={styles.backBtn} />
      </View>

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}

      {/* ── State 1: No circle ── */}
      {!loading && !circleId && !creating && (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="people-circle-outline" size={64} color={colors.primaryContrast} />
          </View>
          <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.3}>Your Circle</Text>
          <Text style={styles.emptyBody} maxFontSizeMultiplier={1.4}>
            Connect with friends and family to stay accountable and see each other's wellbeing.
          </Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.flex1]}
              onPress={() => setCreating(true)}
              accessibilityRole="button"
              accessibilityLabel="Create a Circle"
            >
              <Text style={styles.primaryBtnText} maxFontSizeMultiplier={1.3}>
                Create a Circle
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.outlinedBtn, styles.flex1]}
              onPress={() => setJoinVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Join a Circle"
            >
              <Text style={styles.outlinedBtnText} maxFontSizeMultiplier={1.3}>
                Join a Circle
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── State 2: Create form ── */}
      {!loading && !circleId && creating && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
          <View style={styles.createContainer}>
            <Text style={styles.createTitle} maxFontSizeMultiplier={1.3}>
              Create Your Circle
            </Text>
            <TextInput
              style={[styles.textInput, createError ? styles.textInputError : null]}
              placeholder="Name your circle (e.g. Family & Friends Well-being)"
              placeholderTextColor={colors.textTertiary}
              value={circleName}
              onChangeText={(v) => { setCircleName(v); setCreateError(''); }}
              maxLength={60}
              autoFocus
              maxFontSizeMultiplier={1.3}
              accessibilityLabel="Circle name"
            />
            {!!createError && (
              <Text style={styles.errorText} maxFontSizeMultiplier={1.4}>
                {createError}
              </Text>
            )}
            <View style={styles.rowActions}>
              <TouchableOpacity
                style={[styles.outlinedBtn, styles.flex1]}
                onPress={() => { setCreating(false); setCircleName(''); setCreateError(''); }}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.outlinedBtnText} maxFontSizeMultiplier={1.3}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.flex1, createBusy && styles.btnDisabled]}
                onPress={handleCreate}
                disabled={createBusy}
                accessibilityRole="button"
                accessibilityLabel="Create Circle"
                accessibilityState={{ disabled: createBusy }}
              >
                <Text style={styles.primaryBtnText} maxFontSizeMultiplier={1.3}>
                  {createBusy ? 'Creating…' : 'Create Circle'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── State 3: Circle exists ── */}
      {!loading && !!circleId && !!circleData && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Circle name */}
          <Text style={styles.circleName} maxFontSizeMultiplier={1.3}>
            {circleData.name}
          </Text>

          {/* My Status section */}
          <View style={styles.statusCard}>
            <Text style={styles.statusCardLabel} maxFontSizeMultiplier={1.2}>My Status</Text>
            {!editingStatus ? (
              <View style={styles.statusDisplayRow}>
                <Text
                  style={[styles.statusDisplayText, !customStatus && { color: colors.textTertiary }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {customStatus || "What's your vibe today?"}
                </Text>
                <View style={styles.statusEditIcon}>
                  <TouchableOpacity
                    onPress={() => { setStatusDraft(customStatus); setEditingStatus(true); }}
                    accessibilityRole="button"
                    accessibilityLabel="Edit status"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.statusEditWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.emojiPickerRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {STATUS_EMOJIS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={styles.emojiPill}
                      onPress={() => setStatusDraft((d) => (emoji + ' ' + d).slice(0, 60))}
                      accessibilityRole="button"
                      accessibilityLabel={`Insert ${emoji}`}
                    >
                      <Text style={styles.emojiPillText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  ref={statusInputRef}
                  style={[styles.statusInput, { color: colors.textPrimary, borderColor: colors.primary, backgroundColor: colors.surface }]}
                  value={statusDraft}
                  onChangeText={(v) => setStatusDraft(v.slice(0, 60))}
                  placeholder="What's your vibe today?"
                  placeholderTextColor={colors.textTertiary}
                  maxLength={60}
                  autoFocus
                  maxFontSizeMultiplier={1.3}
                  accessibilityLabel="Status input"
                />
                <Text style={[styles.charCounter, { color: colors.textTertiary }]}>
                  {statusDraft.length}/60
                </Text>
                <View style={styles.statusActions}>
                  <TouchableOpacity
                    style={[styles.outlinedBtn, styles.flex1]}
                    onPress={() => setEditingStatus(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel status edit"
                  >
                    <Text style={styles.outlinedBtnText} maxFontSizeMultiplier={1.3}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.flex1, statusSaving && styles.btnDisabled]}
                    onPress={handleSaveStatus}
                    disabled={statusSaving}
                    accessibilityRole="button"
                    accessibilityLabel="Save status"
                    accessibilityState={{ disabled: statusSaving }}
                  >
                    <Text style={styles.primaryBtnText} maxFontSizeMultiplier={1.3}>
                      {statusSaving ? 'Saving…' : 'Save'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Invite code card */}
          <View style={styles.inviteCard}>
            <Text style={styles.inviteLabel} maxFontSizeMultiplier={1.3}>
              Share Invitation Code
            </Text>
            <View style={styles.codeRow}>
              <Text style={styles.inviteCode} maxFontSizeMultiplier={1.1}>
                {circleData.inviteCode}
              </Text>
              <TouchableOpacity
                style={styles.copyBtn}
                onPress={handleCopy}
                accessibilityRole="button"
                accessibilityLabel="Copy invite code"
              >
                <Ionicons
                  name={copyDone ? 'checkmark' : 'copy-outline'}
                  size={15}
                  color={copyDone ? colors.low : colors.primaryContrast}
                />
                <Text
                  style={[styles.copyBtnText, copyDone && { color: colors.low }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {copyDone ? 'Copied!' : 'Copy Code'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Member list */}
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
            Members ({membersData.length})
          </Text>

          {membersData.map((member) => (
            <MemberCard
              key={member.uid}
              member={member}
              isMe={member.uid === user.uid}
              isCreator={member.uid === circleData.creatorId}
              expanded={expanded.has(member.uid)}
              onToggle={() => toggleMember(member.uid)}
              colors={colors}
              styles={styles}
            />
          ))}

          {/* Bottom actions */}
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={[styles.outlinedBtn, styles.flex1]}
              onPress={() => setJoinVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Join other circle"
            >
              <Ionicons name="enter-outline" size={16} color={colors.primaryContrast} />
              <Text style={styles.outlinedBtnText} maxFontSizeMultiplier={1.3}>
                Join other Circle
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Join Circle Modal ── */}
      <Modal
        visible={joinVisible}
        transparent
        animationType="slide"
        onRequestClose={closeJoin}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle} maxFontSizeMultiplier={1.3}>
              Join a Circle
            </Text>
            <Text style={styles.modalBody} maxFontSizeMultiplier={1.4}>
              Enter the 6-character invite code shared by a friend or family member.
            </Text>
            <TextInput
              style={[styles.textInput, joinError ? styles.textInputError : null]}
              placeholder="Enter invite code (e.g. VTZ4K2)"
              placeholderTextColor={colors.textTertiary}
              value={joinCode}
              onChangeText={(v) => { setJoinCode(v.toUpperCase()); setJoinError(''); }}
              maxLength={6}
              autoCapitalize="characters"
              autoFocus
              maxFontSizeMultiplier={1.3}
              accessibilityLabel="Invite code"
            />
            {!!joinError && (
              <Text style={styles.errorText} maxFontSizeMultiplier={1.4}>
                {joinError}
              </Text>
            )}
            <View style={styles.rowActions}>
              <TouchableOpacity
                style={[styles.outlinedBtn, styles.flex1]}
                onPress={closeJoin}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.outlinedBtnText} maxFontSizeMultiplier={1.3}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.flex1, joinBusy && styles.btnDisabled]}
                onPress={handleJoin}
                disabled={joinBusy}
                accessibilityRole="button"
                accessibilityLabel="Join circle"
                accessibilityState={{ disabled: joinBusy }}
              >
                <Text style={styles.primaryBtnText} maxFontSizeMultiplier={1.3}>
                  {joinBusy ? 'Joining…' : 'Join Circle'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Member card ─────────────────────────────────────────────────────────────

function MemberCard({ member, isMe, isCreator, expanded, onToggle, colors, styles }) {
  const riskColor     = getRiskColor(member.latestRiskLevel);
  const riskBg        = getRiskBgColor(member.latestRiskLevel, colors);
  const checkedToday  = isCheckedInToday(member.lastCheckedIn);
  const checkinTime   = formatLastCheckin(member.lastCheckedIn);
  const avatarLetter  = (member.displayName || '?')[0].toUpperCase();
  const scores        = member.latestScores || { overall: 0, physical: 0, mental: 0 };
  const d             = member.lastCheckInData || {};

  const youTag = isCreator && isMe ? 'You (Creator)' : isMe ? 'You' : null;

  return (
    <View style={styles.memberCard}>
      {/* Collapsed header row */}
      <TouchableOpacity
        style={styles.memberRow}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${member.displayName}, ${expanded ? 'collapse' : 'expand'}`}
        accessibilityState={{ expanded }}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
          <Text style={[styles.avatarLetter, { color: colors.primaryContrast }]}>
            {avatarLetter}
          </Text>
        </View>

        {/* Name + last check-in */}
        <View style={styles.memberMeta}>
          <View style={styles.memberNameRow}>
            <Text
              style={styles.memberName}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
            >
              {member.displayName}
            </Text>
            {!!youTag && (
              <View style={[styles.youTag, { backgroundColor: colors.primaryLight }]}>
                <Text
                  style={[styles.youTagText, { color: colors.primaryContrast }]}
                  maxFontSizeMultiplier={1.2}
                >
                  {youTag}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.memberTime} maxFontSizeMultiplier={1.3}>
            {checkinTime ? `Last check-in: ${checkinTime}` : 'No check-ins yet'}
          </Text>
        </View>

        {/* Risk badge */}
        <View style={[styles.riskBadge, { backgroundColor: riskBg, borderColor: riskColor }]}>
          <Text
            style={[styles.riskBadgeText, { color: riskColor }]}
            maxFontSizeMultiplier={1.2}
          >
            {member.latestRiskLevel || 'N/A'}
          </Text>
        </View>

        {/* Chevron */}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textTertiary}
        />
      </TouchableOpacity>

      {/* Expanded content */}
      {expanded && (
        <View style={styles.memberExpanded}>
          {/* Score rings */}
          <View style={styles.scoreRingsRow}>
            <HealthScoreRing
              score={scores.overall}
              label="Overall"
              size={80}
              strokeWidth={8}
              animate={false}
            />
            <HealthScoreRing
              score={scores.physical}
              label="Physical"
              size={80}
              strokeWidth={8}
              animate={false}
            />
            <HealthScoreRing
              score={scores.mental}
              label="Mental"
              size={80}
              strokeWidth={8}
              animate={false}
            />
          </View>

          {/* Risk badge row */}
          <View
            style={[
              styles.expandedRisk,
              { backgroundColor: riskBg, borderColor: riskColor },
            ]}
          >
            <Ionicons name="shield-checkmark-outline" size={14} color={riskColor} />
            <Text
              style={[styles.expandedRiskText, { color: riskColor }]}
              maxFontSizeMultiplier={1.2}
            >
              {member.latestRiskLevel || 'Unknown'} Risk
            </Text>
          </View>

          {/* Check-in summary or placeholder */}
          {!checkedToday ? (
            <Text style={[styles.noCheckinText, { color: colors.textTertiary }]} maxFontSizeMultiplier={1.4}>
              No check-in yet today
            </Text>
          ) : (
            <>
              <CheckInRow
                label="Mood"
                value={d.mood != null ? `${d.mood} / 5` : '—'}
                colors={colors}
              />
              <CheckInRow
                label="Sleep & Activity"
                value={
                  d.sleep != null
                    ? `${d.sleep}h sleep · Q${d.sleepQuality ?? '—'} · ${exerciseDisplay(d.exercise)}`
                    : '—'
                }
                colors={colors}
              />
              <CheckInRow
                label="Diet & Substances"
                value={formatDietRow(d)}
                colors={colors}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Check-in summary row ────────────────────────────────────────────────────

function CheckInRow({ label, value, colors }) {
  return (
    <View style={ciRow.wrap}>
      <Text
        style={[ciRow.label, { color: colors.textSecondary }]}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
      <Text
        style={[ciRow.value, { color: colors.textPrimary }]}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
    </View>
  );
}

const ciRow = StyleSheet.create({
  wrap:  { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: Spacing.md },
  label: { ...Typography.bodySmall, flex: 0.42 },
  value: { ...Typography.bodySmall, flex: 0.58, textAlign: 'right' },
});

// ── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (c) =>
  StyleSheet.create({
    safe:  { flex: 1, backgroundColor: c.background },
    flex1: { flex: 1 },

    // Navigation header
    navHeader: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical:   Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    backBtn:  { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
    navTitle: { ...Typography.h3, color: c.textPrimary },

    // Generic
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    // ── State 1 ──────────────────────────────────────────────────────────
    emptyContainer: {
      flex:              1,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: Spacing.xl,
      gap:               Spacing.md,
    },
    emptyIcon: {
      width:          120,
      height:         120,
      borderRadius:   Radius.full,
      alignItems:     'center',
      justifyContent: 'center',
      marginBottom:   Spacing.sm,
    },
    emptyTitle: { ...Typography.h2, color: c.textPrimary,   textAlign: 'center' },
    emptyBody:  { ...Typography.body, color: c.textSecondary, textAlign: 'center' },
    emptyActions: {
      flexDirection: 'row',
      gap:           Spacing.sm,
      marginTop:     Spacing.md,
      width:         '100%',
    },

    // ── State 2: Create form ──────────────────────────────────────────────
    createContainer: {
      flex:    1,
      padding: Spacing.lg,
      gap:     Spacing.md,
    },
    createTitle: { ...Typography.h2, color: c.textPrimary },

    // Shared form elements
    textInput: {
      borderWidth:   1,
      borderColor:   c.border,
      borderRadius:  Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical:   Spacing.md,
      ...Typography.body,
      color:           c.textPrimary,
      backgroundColor: c.surface,
      minHeight:       MIN_TOUCH,
    },
    textInputError: { borderColor: c.error },
    errorText: { ...Typography.bodySmall, color: c.error },
    rowActions: { flexDirection: 'row', gap: Spacing.sm },

    // Buttons
    primaryBtn: {
      backgroundColor: c.primary,
      borderRadius:    Radius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      alignItems:      'center',
      justifyContent:  'center',
      minHeight:       MIN_TOUCH,
      flexDirection:   'row',
      gap:             Spacing.xs,
    },
    primaryBtnText: { ...Typography.button, color: c.textInverse },
    outlinedBtn: {
      borderWidth:   1,
      borderColor:   c.primary,
      borderRadius:  Radius.md,
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.lg,
      alignItems:    'center',
      justifyContent: 'center',
      minHeight:     MIN_TOUCH,
      flexDirection: 'row',
      gap:           Spacing.xs,
    },
    outlinedBtnText: { ...Typography.button, color: c.primaryContrast },
    btnDisabled: { opacity: 0.55 },

    // ── State 3: Circle view ──────────────────────────────────────────────
    scroll:   { flex: 1 },
    content:  { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
    circleName: { ...Typography.h2, color: c.textPrimary },
    sectionTitle: { ...Typography.h4, color: c.textPrimary, marginTop: Spacing.xs },

    // My Status card
    statusCard: {
      backgroundColor: c.surface,
      borderRadius:    Radius.lg,
      padding:         Spacing.md,
      borderWidth:     1,
      borderColor:     c.border,
      gap:             Spacing.sm,
    },
    statusCardLabel: { ...Typography.label, color: c.textSecondary },
    statusDisplayRow: {
      flexDirection: 'row',
      alignItems:    'flex-start',
      flexWrap:      'nowrap',
    },
    statusDisplayText: { ...Typography.body, flex: 1, flexShrink: 1, flexWrap: 'wrap' },
    statusEditIcon:    { width: 24, marginLeft: 8, alignItems: 'center', paddingTop: 2 },
    statusEditWrap: { gap: Spacing.xs },
    statusInput: {
      borderWidth:       1.5,
      borderRadius:      Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical:   Spacing.sm,
      ...Typography.body,
      minHeight:         MIN_TOUCH,
    },
    charCounter:   { ...Typography.caption, textAlign: 'right' },
    statusActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
    emojiPickerRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
    emojiPill: {
      width: 36, height: 36, borderRadius: Radius.full,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.border,
    },
    emojiPillText: { fontSize: 18 },

    // Invite code card
    inviteCard: {
      backgroundColor: c.surface,
      borderRadius:    Radius.lg,
      padding:         Spacing.md,
      borderWidth:     1,
      borderColor:     c.border,
      gap:             Spacing.sm,
    },
    inviteLabel: { ...Typography.label, color: c.textSecondary },
    codeRow: {
      flexDirection:  'row',
      alignItems:     'center',
      justifyContent: 'space-between',
      gap:            Spacing.md,
    },
    inviteCode: {
      fontFamily:  Platform.OS === 'ios' ? 'Courier New' : 'monospace',
      fontSize:    26,
      fontWeight:  '700',
      letterSpacing: 5,
      color:       c.primary,
    },
    copyBtn: {
      flexDirection:  'row',
      alignItems:     'center',
      gap:            Spacing.xs,
      backgroundColor: c.primaryLight,
      borderRadius:   Radius.md,
      paddingHorizontal: Spacing.sm + 4,
      paddingVertical:   Spacing.sm,
      minHeight:      MIN_TOUCH,
    },
    copyBtnText: { ...Typography.label, color: c.primaryContrast },

    // Member card
    memberCard: {
      backgroundColor: c.surface,
      borderRadius:    Radius.lg,
      borderWidth:     1,
      borderColor:     c.border,
      overflow:        'hidden',
    },
    memberRow: {
      flexDirection: 'row',
      alignItems:    'center',
      padding:       Spacing.md,
      gap:           Spacing.sm,
      minHeight:     MIN_TOUCH + 16,
    },
    avatar: {
      width:          44,
      height:         44,
      borderRadius:   Radius.full,
      alignItems:     'center',
      justifyContent: 'center',
      flexShrink:     0,
    },
    avatarLetter:  { ...Typography.h3, lineHeight: 24 },
    memberMeta:    { flex: 1, gap: 2 },
    memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flexWrap: 'wrap' },
    memberName:    { ...Typography.body, color: c.textPrimary, fontWeight: '600' },
    youTag: {
      borderRadius:    Radius.full,
      paddingHorizontal: 8,
      paddingVertical:   2,
    },
    youTagText:    { ...Typography.caption, fontWeight: '600' },
    memberTime:    { ...Typography.caption, color: c.textTertiary },
    riskBadge: {
      borderRadius:    Radius.sm,
      borderWidth:     1,
      paddingHorizontal: 8,
      paddingVertical:   3,
    },
    riskBadgeText: { ...Typography.caption, fontWeight: '600' },

    // Expanded section
    memberExpanded: {
      padding:         Spacing.md,
      paddingTop:      Spacing.sm,
      gap:             Spacing.sm,
      borderTopWidth:  1,
      borderTopColor:  c.border,
    },
    scoreRingsRow: {
      flexDirection:  'row',
      justifyContent: 'space-around',
      alignItems:     'center',
      paddingVertical: Spacing.sm,
    },
    expandedRisk: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:               Spacing.xs,
      borderRadius:      Radius.sm,
      borderWidth:       1,
      paddingHorizontal: Spacing.sm,
      paddingVertical:   Spacing.xs,
      alignSelf:         'flex-start',
    },
    expandedRiskText: { ...Typography.caption, fontWeight: '600' },
    noCheckinText: {
      ...Typography.bodySmall,
      fontStyle: 'italic',
      paddingVertical: Spacing.xs,
    },

    // Modal
    modalOverlay: {
      flex:            1,
      justifyContent:  'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    modalSheet: {
      borderTopLeftRadius:  Radius.xl,
      borderTopRightRadius: Radius.xl,
      padding:              Spacing.lg,
      gap:                  Spacing.md,
      paddingBottom:        Spacing.xxl,
    },
    modalHandle: {
      width:        40,
      height:       4,
      borderRadius: Radius.full,
      backgroundColor: c.border,
      alignSelf:    'center',
      marginBottom: Spacing.xs,
    },
    modalTitle: { ...Typography.h3, color: c.textPrimary },
    modalBody:  { ...Typography.bodySmall, color: c.textSecondary },
  });
