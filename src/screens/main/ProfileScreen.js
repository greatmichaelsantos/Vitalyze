import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, Alert, StatusBar, SafeAreaView, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Pressable, Image, Linking,
  Animated, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import {
  updateDisplayName, changePassword, deleteAccount, getFriendlyAuthError,
} from '../../services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserProfile, updateUserDisplayName, deleteUserData } from '../../services/firestoreService';
import { STORAGE_KEYS, COLLECTIONS } from '../../utils/constants';
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  registerForPushNotifications,
} from '../../services/notificationService';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';
import { PRESENCE_COLORS, PRESENCE_PRESETS } from '../../utils/presenceColors';

const FONT_SIZE_LABELS = {
  small:      'Small',
  default:    'Default',
  large:      'Large',
  extraLarge: 'Extra Large',
};

const FONT_SIZE_OPTIONS = [
  { key: 'small',      label: 'Small',       multiplier: 0.85 },
  { key: 'default',    label: 'Default',     multiplier: 1.0  },
  { key: 'large',      label: 'Large',       multiplier: 1.15 },
  { key: 'extraLarge', label: 'Extra Large', multiplier: 1.3  },
];

export default function ProfileScreen({ navigation }) {
  const { user, refreshUser }           = useAuth();
  const { colors, isDark, toggleTheme, cardBorderWidth } = useTheme();
  const { fontSizeKey, fontSizeMultiplier, highContrast, setFontSize, setHighContrast } = useAccessibility();
  const styles = useMemo(() => makeStyles(colors, cardBorderWidth, fontSizeMultiplier), [colors, cardBorderWidth, fontSizeMultiplier]);

  const [profile,         setProfile]         = useState(null);
  const [prefs,           setPrefs]           = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [signingOut,      setSigningOut]       = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [localPhotoUri,   setLocalPhotoUri]   = useState(null);
  const [avatarImageLoading, setAvatarImageLoading] = useState(false);

  const [circleId,       setCircleId]       = useState(null);
  const [presenceStatus, setPresenceStatus] = useState('Online');

  const [nameModalOpen,     setNameModalOpen]     = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [deleteModalOpen,   setDeleteModalOpen]   = useState(false);
  const [signOutModalOpen,  setSignOutModalOpen]  = useState(false);
  const [ecModalOpen,       setEcModalOpen]       = useState(false);
  const [fontSizeModalOpen, setFontSizeModalOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, notifPrefs, cid] = await Promise.all([
          getUserProfile(user.uid),
          getNotificationPrefs(),
          AsyncStorage.getItem(`circle_id_${user.uid}`),
        ]);
        setProfile(p);
        console.log('[ProfileScreen] healthInfo:', p?.allergies, p?.medicalConditions, p?.currentMedications);
        setPrefs(notifPrefs);
        if (cid) {
          setCircleId(cid);
          const memberSnap = await getDoc(doc(db, 'circleMembers', cid, 'members', user.uid));
          if (memberSnap.exists()) {
            setPresenceStatus(memberSnap.data().presenceStatus || 'Online');
          }
        }
      } catch {
        setPrefs({ highRiskAlerts: true, dailyReminder: true, weeklySummary: true });
      }
    })();
  }, [user.uid]);

  const doSignOut = async () => {
    setSignOutModalOpen(false);
    setSigningOut(true);
    try {
      try {
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.CACHED_INSIGHTS,
          STORAGE_KEYS.PENDING_CHECKINS,
          STORAGE_KEYS.NOTIFICATION_PREFS,
        ]);
      } catch { /* non-critical */ }
      await signOut(auth);
    } catch (e) {
      setSigningOut(false);
      Alert.alert('Sign Out Failed', e.message || 'Unable to sign out. Please try again.');
    }
  };

  const updatePref = async (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
    try { await saveNotificationPrefs(updated); } catch { /* best-effort */ }
    finally { setSaving(false); }
  };

  const handleEnableNotifications = async () => {
    const token = await registerForPushNotifications();
    if (!token) {
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications for Mend in your device settings.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert('Notifications Enabled', 'You will now receive health alerts.');
    }
  };

  const handleSelectPresence = async (status) => {
    setPresenceStatus(status);
    try {
      if (circleId) {
        await setDoc(
          doc(db, 'circleMembers', circleId, 'members', user.uid),
          { presenceStatus: status },
          { merge: true }
        );
      }
    } catch (err) {
      console.warn('ProfileScreen savePresence:', err);
    }
  };

  const pickAndUploadAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'Images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const uri = result.assets[0].uri;
    setLocalPhotoUri(uri);
    setAvatarUploading(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 300, height: 300 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
      );
      const compressedUri = manipulated.uri;
      const response = await fetch(compressedUri);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const photoURL = base64;
      await setDoc(doc(db, COLLECTIONS.USERS, user.uid), { photoURL }, { merge: true });
      setProfile((prev) => ({ ...prev, photoURL }));
      await refreshUser();
      const circleId = await AsyncStorage.getItem(`circle_id_${user.uid}`);
      if (circleId) {
        await setDoc(
          doc(db, 'circleMembers', circleId, 'members', user.uid),
          { photoURL },
          { merge: true }
        );
      }
    } catch (err) {
      setLocalPhotoUri(null);
      const msg = err?.message || err?.code || String(err) || 'Unknown error';
      Alert.alert('Upload Failed', `Could not update your profile photo.\n\n${msg}`);
    } finally {
      setAvatarUploading(false);
    }
  };

  const photoURL = localPhotoUri || profile?.photoURL || null;

  useEffect(() => {
    if (photoURL) setAvatarImageLoading(true);
  }, [photoURL]);

  const memberSince = profile?.createdAt?.seconds
    ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString('en-US', {
        month: 'long', year: 'numeric',
      })
    : 'Recently';

  const displayName  = user.displayName || profile?.displayName || '';
  const avatarLetter = (displayName || user.email || 'U')[0].toUpperCase();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Profile card ─────────────────────────────────────── */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={pickAndUploadAvatar}
            disabled={avatarUploading}
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
          >
            {avatarUploading ? (
              <View style={[styles.avatar, styles.avatarLoading]}>
                <ActivityIndicator color={colors.textInverse} />
              </View>
            ) : (
              <>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{avatarLetter}</Text>
                </View>
                {!!photoURL && (
                  <Image
                    source={{ uri: photoURL }}
                    style={[
                      styles.avatarImage,
                      styles.avatarImageAbsolute,
                      avatarImageLoading && styles.avatarImageHidden,
                    ]}
                    onLoad={() => setAvatarImageLoading(false)}
                    onError={() => {
                      setAvatarImageLoading(false);
                      setLocalPhotoUri(null);
                      setProfile((prev) => prev ? { ...prev, photoURL: null } : prev);
                    }}
                  />
                )}
              </>
            )}
            <View style={[styles.avatarBadge, { backgroundColor: colors.primary }]}>
              <Ionicons name="camera" size={11} color="#fff" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.nameRow}
            onPress={() => setNameModalOpen(true)}
            accessibilityLabel="Edit display name"
            accessibilityRole="button"
          >
            <Text style={styles.displayName}>{displayName || 'Add your name'}</Text>
            <Ionicons name="pencil-outline" size={15} color={colors.primary} style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <Text style={styles.email}>{user.email}</Text>
          <Text style={styles.memberSince}>Member since {memberSince}</Text>
        </View>

        {/* ── Presence Status ──────────────────────────────────── */}
        {!!circleId && (
          <View style={styles.presenceCard}>
            <Text style={styles.presenceLabel}>My Presence Status</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presencePillRow}
              keyboardShouldPersistTaps="handled"
            >
              {PRESENCE_PRESETS.map((p) => {
                const selected = presenceStatus === p.key;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={[
                      styles.presencePill,
                      selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => handleSelectPresence(p.key)}
                    accessibilityRole="button"
                    accessibilityLabel={p.label}
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.presencePillInner}>
                      <View style={[styles.presenceDot, { backgroundColor: PRESENCE_COLORS[p.key] }]} />
                      <Text
                        style={[styles.presencePillText, selected && { color: '#fff' }]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {p.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Emergency Contact ────────────────────────────────── */}
        <SectionHeader title="Emergency Contact" colors={colors} />
        {(profile?.emergencyContactName || profile?.emergencyContactNumber) ? (
          <View style={[styles.section, { padding: Spacing.md, gap: Spacing.md }]}>
            <View style={[ecStyles.infoRow, { justifyContent: 'space-between' }]}>
              <View style={[ecStyles.infoRow, { flex: 1 }]}>
                <View style={[styles.rowIconWrap, { backgroundColor: colors.errorLight }]}>
                  <Ionicons name="medkit-outline" size={18} color={colors.error} />
                </View>
                <View style={ecStyles.infoText}>
                  <Text style={[ecStyles.contactName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {profile.emergencyContactName || '—'}
                  </Text>
                  <Text style={[ecStyles.contactNumber, { color: colors.textSecondary }]}>
                    {profile.emergencyContactNumber
                      ? profile.emergencyContactNumber.replace(/(\d{4})(\d{3})(\d{4})/, '$1 $2 $3')
                      : '—'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setEcModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit emergency contact"
                style={{ padding: 4 }}
              >
                <Ionicons name="pencil-outline" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {!!profile?.emergencyContactNumber && (
              <View style={ecStyles.btnRow}>
                <TouchableOpacity
                  style={[ecStyles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => Linking.openURL(`tel:${profile.emergencyContactNumber}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${profile.emergencyContactName || 'emergency contact'}`}
                >
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={ecStyles.actionBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ecStyles.actionBtn, { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => Linking.openURL(`sms:${profile.emergencyContactNumber}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${profile.emergencyContactName || 'emergency contact'}`}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={colors.textPrimary} />
                  <Text style={[ecStyles.actionBtnText, { color: colors.textPrimary }]}>Message</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.tappableRow, { borderTopWidth: 0 }]}
              onPress={() => setEcModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add emergency contact"
            >
              <View style={[styles.rowIconWrap, { backgroundColor: colors.errorLight }]}>
                <Ionicons name="person-add-outline" size={18} color={colors.error} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.textPrimary }]} numberOfLines={1}>Add Emergency Contact</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Health Info ──────────────────────────────────────── */}
        {(profile?.allergies || profile?.medicalConditions || profile?.currentMedications) && (
          <>
            <SectionHeader title="Health Info" colors={colors} />
            <View style={[styles.section, { padding: Spacing.md, gap: Spacing.md }]}>
              {!!profile.allergies && (
                <View style={hiStyles.row}>
                  <View style={[styles.rowIconWrap, { backgroundColor: colors.errorLight }]}>
                    <Ionicons name="warning-outline" size={18} color={colors.error} />
                  </View>
                  <View style={hiStyles.textBlock}>
                    <Text style={[hiStyles.fieldLabel, { color: colors.textTertiary }]}>Allergies</Text>
                    <Text style={[hiStyles.fieldValue, { color: colors.textPrimary }]}>{profile.allergies}</Text>
                  </View>
                </View>
              )}
              {!!profile.medicalConditions && (
                <View style={hiStyles.row}>
                  <View style={[styles.rowIconWrap, { backgroundColor: colors.infoLight }]}>
                    <Ionicons name="fitness-outline" size={18} color={colors.info} />
                  </View>
                  <View style={hiStyles.textBlock}>
                    <Text style={[hiStyles.fieldLabel, { color: colors.textTertiary }]}>Medical Conditions</Text>
                    <Text style={[hiStyles.fieldValue, { color: colors.textPrimary }]}>{profile.medicalConditions}</Text>
                  </View>
                </View>
              )}
              {!!profile.currentMedications && (
                <View style={hiStyles.row}>
                  <View style={[styles.rowIconWrap, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="medkit-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={hiStyles.textBlock}>
                    <Text style={[hiStyles.fieldLabel, { color: colors.textTertiary }]}>Current Medications</Text>
                    <Text style={[hiStyles.fieldValue, { color: colors.textPrimary }]}>{profile.currentMedications}</Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Account ──────────────────────────────────────────── */}
        <SectionHeader title="Account" colors={colors} />
        <View style={styles.section}>
          <InfoRow icon="mail-outline" label="Email" value={user.email} colors={colors} />

          <TouchableOpacity
            style={styles.tappableRow}
            onPress={() => navigation.navigate('QRLogin')}
            accessibilityLabel="QR Login — log in on another device"
            accessibilityRole="button"
          >
            <View style={styles.rowIconWrap}>
              <Ionicons name="qr-code-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>QR Login</Text>
            <Text style={styles.rowValue} numberOfLines={1}>Log in on another device</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tappableRow}
            onPress={() => setPasswordModalOpen(true)}
            accessibilityLabel="Change password"
            accessibilityRole="button"
          >
            <View style={styles.rowIconWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>Password</Text>
            <Text style={styles.rowValue} numberOfLines={1}>Change</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tappableRow}
            onPress={() => navigation.navigate('EditProfile')}
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
          >
            <View style={styles.rowIconWrap}>
              <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>Edit Profile</Text>
            <Text style={styles.rowValue} numberOfLines={1}>Name, age, metrics</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>

        {/* ── Accessibility ────────────────────────────────────── */}
        <SectionHeader title="Accessibility" colors={colors} />
        <View style={styles.section}>
          <ToggleRow
            icon="moon-outline"
            label="Dark Mode"
            sublabel="Deep navy background with off-white text"
            value={isDark}
            onChange={toggleTheme}
            accentColor={colors.primary}
            colors={colors}
          />
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <TouchableOpacity
            style={[styles.tappableRow, { borderTopWidth: 0 }]}
            onPress={() => setFontSizeModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Font size, currently ${FONT_SIZE_LABELS[fontSizeKey]}`}
          >
            <View style={styles.rowIconWrap}>
              <Ionicons name="text-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>Font Size</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{FONT_SIZE_LABELS[fontSizeKey]}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <ToggleRow
            icon="contrast-outline"
            label="High Contrast Mode"
            sublabel="Increases text and border visibility"
            value={highContrast}
            onChange={setHighContrast}
            accentColor={colors.primary}
            colors={colors}
            isLast
          />
        </View>

        {/* ── Notifications ────────────────────────────────────── */}
        <SectionHeader
          title="Notifications"
          trailing={saving ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          colors={colors}
        />
        <View style={styles.section}>
          {prefs && (
            <>
              <ToggleRow
                icon="alert-circle-outline"
                label="High-Risk Health Alerts"
                sublabel="Get notified when critical patterns are detected"
                value={prefs.highRiskAlerts}
                onChange={(v) => updatePref('highRiskAlerts', v)}
                accentColor={colors.high}
                colors={colors}
              />
              <ToggleRow
                icon="time-outline"
                label="Daily Check-in Reminder"
                sublabel="Reminder at 9:00 AM to complete your check-in"
                value={prefs.dailyReminder}
                onChange={(v) => updatePref('dailyReminder', v)}
                accentColor={colors.primary}
                colors={colors}
              />
              <ToggleRow
                icon="bar-chart-outline"
                label="Weekly Summary"
                sublabel="Weekly digest of your health trends"
                value={prefs.weeklySummary}
                onChange={(v) => updatePref('weeklySummary', v)}
                accentColor={colors.physical}
                colors={colors}
              />
              <TouchableOpacity
                style={styles.actionRow}
                onPress={handleEnableNotifications}
                accessibilityRole="button"
              >
                <View style={[styles.actionIcon, { backgroundColor: colors.infoLight }]}>
                  <Ionicons name="notifications-outline" size={20} color={colors.info} />
                </View>
                <Text style={styles.actionLabel}>Enable Push Notifications</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Privacy & Data ───────────────────────────────────── */}
        <SectionHeader title="Privacy & Data" colors={colors} />
        <View style={styles.section}>
          <InfoRow icon="lock-open-outline" label="Data Encryption" value="End-to-end"        colors={colors} />
          <InfoRow icon="eye-off-outline"   label="Data Sharing"    value="Never shared"      colors={colors} />
          <InfoRow icon="server-outline"    label="Storage"         value="Firebase (secure)" colors={colors} />
        </View>

        {/* ── About ────────────────────────────────────────────── */}
        <SectionHeader title="About" colors={colors} />
        <View style={styles.section}>
          <InfoRow icon="information-circle-outline" label="App Version"  value="1.0.0"                    colors={colors} />
          <InfoRow icon="pulse-outline"              label="AI Engine"    value="Rule-based classifier v1" colors={colors} />
          <InfoRow icon="git-network-outline"        label="Graph Engine" value="Weighted KG v1"           colors={colors} />
        </View>

        {/* ── Support ──────────────────────────────────────────── */}
        <SectionHeader title="Support" colors={colors} />
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.tappableRow, { borderTopWidth: 0 }]}
            onPress={() => navigation.navigate('FAQ')}
            accessibilityLabel="Help and FAQ"
            accessibilityRole="button"
            accessibilityHint="Opens frequently asked questions"
          >
            <View style={styles.rowIconWrap}>
              <Ionicons name="help-circle-outline" size={18} color={colors.textSecondary} />
            </View>
            <Text style={styles.rowLabel} numberOfLines={1}>Help &amp; FAQ</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>

        {/* ── Sign Out ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.logoutBtn, signingOut && styles.btnDisabled]}
          onPress={() => setSignOutModalOpen(true)}
          disabled={signingOut}
          accessibilityLabel="Sign out of Mend"
          accessibilityRole="button"
          accessibilityHint="Opens a confirmation dialog before signing you out"
          accessibilityState={{ disabled: signingOut, busy: signingOut }}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colors.error} />
              <Text style={styles.logoutText}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ── Delete Account ───────────────────────────────────── */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => setDeleteModalOpen(true)}
          accessibilityLabel="Delete account"
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Mend — Heal from within{'\n'}Your health data is private and secure.
        </Text>
      </ScrollView>

      {/* ── Modals ───────────────────────────────────────────────── */}
      <EditNameModal
        visible={nameModalOpen}
        currentName={displayName}
        userId={user.uid}
        onSave={(name) => {
          setProfile((p) => ({ ...p, displayName: name }));
          refreshUser();
          setNameModalOpen(false);
        }}
        onClose={() => setNameModalOpen(false)}
      />

      <ChangePasswordModal
        visible={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />

      <DeleteAccountModal
        visible={deleteModalOpen}
        userId={user.uid}
        onClose={() => setDeleteModalOpen(false)}
      />

      <SignOutConfirmModal
        visible={signOutModalOpen}
        onConfirm={doSignOut}
        onClose={() => setSignOutModalOpen(false)}
      />

      <EmergencyContactModal
        visible={ecModalOpen}
        currentName={profile?.emergencyContactName || ''}
        currentNumber={profile?.emergencyContactNumber || ''}
        currentEmail={profile?.emergencyContactEmail || ''}
        userId={user.uid}
        onSave={(updated) => {
          setProfile((p) => ({ ...p, ...updated }));
          setEcModalOpen(false);
        }}
        onClose={() => setEcModalOpen(false)}
      />

      <FontSizeModal
        visible={fontSizeModalOpen}
        currentKey={fontSizeKey}
        onSelect={(key) => { setFontSize(key); setFontSizeModalOpen(false); }}
        onClose={() => setFontSizeModalOpen(false)}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// SIGN OUT CONFIRM MODAL
// ─────────────────────────────────────────────────────────────
function SignOutConfirmModal({ visible, onConfirm, onClose }) {
  const { colors } = useTheme();
  const mStyles = useMemo(() => makeModalStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={mStyles.overlay} onPress={onClose}>
        <Pressable style={mStyles.card} onPress={() => {}}>
          <View style={[soStyles.iconWrap, { backgroundColor: colors.errorLight }]}>
            <Ionicons name="log-out-outline" size={28} color={colors.error} />
          </View>
          <Text style={mStyles.title}>Sign Out</Text>
          <Text style={[mStyles.subtitle, { marginTop: 0 }]}>
            Are you sure you want to sign out of Mend?
          </Text>
          <View style={mStyles.btnRow}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={mStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[soStyles.confirmBtn, { backgroundColor: colors.error }]}
              onPress={onConfirm}
            >
              <Text style={[soStyles.confirmText, { color: colors.textInverse }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// EDIT NAME MODAL
// ─────────────────────────────────────────────────────────────
function EditNameModal({ visible, currentName, userId, onSave, onClose }) {
  const { colors } = useTheme();
  const mStyles = useMemo(() => makeModalStyles(colors), [colors]);
  const [name,    setName]    = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setName(currentName);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible, currentName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Name cannot be empty.'); return; }
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        updateDisplayName(trimmed),
        updateUserDisplayName(userId, trimmed),
      ]);
      onSave(trimmed);
    } catch (e) {
      setError(getFriendlyAuthError(e.code) || 'Failed to update name. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={mStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mStyles.card}>
          <Text style={mStyles.title}>Edit Display Name</Text>
          <Text style={mStyles.subtitle}>This name appears in your greeting and profile.</Text>

          <TextInput
            ref={inputRef}
            style={[mStyles.input, error ? mStyles.inputError : null]}
            value={name}
            onChangeText={(t) => { setName(t); setError(''); }}
            placeholder="Your name"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            maxLength={40}
          />
          {error ? <Text style={mStyles.errorText}>{error}</Text> : null}

          <View style={mStyles.btnRow}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={mStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mStyles.saveBtn, loading && mStyles.btnDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.textInverse} />
                : <Text style={mStyles.saveText}>Save</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// CHANGE PASSWORD MODAL
// ─────────────────────────────────────────────────────────────
function ChangePasswordModal({ visible, onClose }) {
  const { colors } = useTheme();
  const mStyles = useMemo(() => makeModalStyles(colors), [colors]);
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const nextRef    = useRef(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (visible) { setCurrent(''); setNext(''); setConfirm(''); setError(''); }
  }, [visible]);

  const handleSave = async () => {
    if (!current)         { setError('Please enter your current password.'); return; }
    if (next.length < 6)  { setError('New password must be at least 6 characters.'); return; }
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      await changePassword(current, next);
      Alert.alert('Password Updated', 'Your password has been changed successfully.');
      onClose();
    } catch (e) {
      setError(getFriendlyAuthError(e.code) || 'Failed to update password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={mStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mStyles.card}>
          <Text style={mStyles.title}>Change Password</Text>
          <Text style={mStyles.subtitle}>Enter your current password, then choose a new one.</Text>

          <TextInput
            style={[mStyles.input, error ? mStyles.inputError : null]}
            value={current}
            onChangeText={(t) => { setCurrent(t); setError(''); }}
            placeholder="Current password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => nextRef.current?.focus()}
          />
          <TextInput
            ref={nextRef}
            style={[mStyles.input, error ? mStyles.inputError : null]}
            value={next}
            onChangeText={(t) => { setNext(t); setError(''); }}
            placeholder="New password (min 6 characters)"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <TextInput
            ref={confirmRef}
            style={[mStyles.input, error ? mStyles.inputError : null]}
            value={confirm}
            onChangeText={(t) => { setConfirm(t); setError(''); }}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          {error ? <Text style={mStyles.errorText}>{error}</Text> : null}

          <View style={mStyles.btnRow}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={mStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mStyles.saveBtn, loading && mStyles.btnDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.textInverse} />
                : <Text style={mStyles.saveText}>Update</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// DELETE ACCOUNT MODAL
// ─────────────────────────────────────────────────────────────
function DeleteAccountModal({ visible, userId, onClose }) {
  const { colors } = useTheme();
  const mStyles = useMemo(() => makeModalStyles(colors), [colors]);
  const [password,       setPassword]       = useState('');
  const [confirmText,    setConfirmText]    = useState('');
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState('');

  const deleteConfirmed = confirmText.trim().toLowerCase() === 'delete';

  useEffect(() => {
    if (visible) { setPassword(''); setConfirmText(''); setError(''); }
  }, [visible]);

  const handleDelete = async () => {
    if (!deleteConfirmed) { setError('Please type DELETE in the confirmation field.'); return; }
    if (!password) { setError('Please enter your password to confirm.'); return; }
    setLoading(true);
    setError('');
    try {
      await deleteUserData(userId);
      await deleteAccount(password);
    } catch (e) {
      setLoading(false);
      setError(getFriendlyAuthError(e.code) || "Couldn't delete account. Please try again.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={mStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={mStyles.card}>
          <View style={[delStyles.warningBadge, { backgroundColor: colors.errorLight }]}>
            <Ionicons name="warning-outline" size={20} color={colors.error} />
            <Text style={[delStyles.warningText, { color: colors.error }]}>Permanent Action</Text>
          </View>

          <Text style={mStyles.title}>Delete Account</Text>
          <Text style={[delStyles.body, { color: colors.textSecondary }]}>
            This will permanently delete your account and{' '}
            <Text style={{ fontWeight: '700' }}>all health data</Text> — check-ins,
            insights, and your health connection map. This cannot be undone.
          </Text>

          {/* Step 1 — type DELETE */}
          <TextInput
            style={[mStyles.input, { borderColor: deleteConfirmed ? colors.error : colors.error + '80' }]}
            value={confirmText}
            onChangeText={(t) => { setConfirmText(t); setError(''); }}
            placeholder='Type DELETE to confirm'
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="characters"
            returnKeyType="next"
            accessibilityLabel="Type DELETE to confirm account deletion"
            accessibilityHint="Type the word DELETE in capital letters to confirm"
          />

          {/* Step 2 — password */}
          <TextInput
            style={[mStyles.input, error ? mStyles.inputError : null]}
            value={password}
            onChangeText={(t) => { setPassword(t); setError(''); }}
            placeholder="Enter your password"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleDelete}
            accessibilityLabel="Enter your password to confirm account deletion"
          />
          {error ? (
            <Text
              style={mStyles.errorText}
              accessibilityLiveRegion="polite"
              accessibilityLabel={error}
            >
              {error}
            </Text>
          ) : null}

          <View style={mStyles.btnRow}>
            <TouchableOpacity
              style={mStyles.cancelBtn}
              onPress={onClose}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Cancel account deletion"
            >
              <Text style={mStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                delStyles.deleteBtn,
                { backgroundColor: deleteConfirmed ? colors.error : colors.textTertiary },
                loading && mStyles.btnDisabled,
              ]}
              onPress={handleDelete}
              disabled={loading || !deleteConfirmed}
              accessibilityRole="button"
              accessibilityLabel="Delete account forever"
              accessibilityState={{ disabled: loading || !deleteConfirmed }}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.textInverse} />
                : <Text style={[delStyles.deleteBtnText, { color: colors.textInverse }]}>Delete Forever</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// EMERGENCY CONTACT BOTTOM SHEET MODAL
// ─────────────────────────────────────────────────────────────
function EmergencyContactModal({ visible, currentName, currentNumber, currentEmail, userId, onSave, onClose }) {
  const { colors } = useTheme();
  const translateY = useRef(new Animated.Value(500)).current;
  const [ecName,        setEcName]        = useState('');
  const [ecNumber,      setEcNumber]      = useState('');
  const [ecEmail,       setEcEmail]       = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setEcName(currentName || '');
      const raw = (currentNumber || '').replace(/\s/g, '').slice(0, 11);
      let fmtNum = raw;
      if (raw.length > 4) fmtNum = raw.slice(0, 4) + ' ' + raw.slice(4);
      if (raw.length > 7) fmtNum = fmtNum.slice(0, 8) + ' ' + raw.slice(7);
      setEcNumber(fmtNum);
      setEcEmail(currentEmail || '');
      setError('');
      translateY.setValue(500);
      Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [visible]);

  const close = () => {
    Animated.timing(translateY, { toValue: 500, duration: 250, useNativeDriver: true }).start(() => onClose());
  };

  const handleEcNumberFocus = () => { if (!ecNumber) setEcNumber('09'); };
  const handleEcNumberBlur  = () => {
    const raw = ecNumber.replace(/\s/g, '');
    if (raw === '09' || raw.length < 3) setEcNumber('');
  };
  const handleEcNumberChange = (t) => {
    let digits = t.replace(/[^0-9]/g, '');
    if (digits.length < 2) { setEcNumber('09'); return; }
    if (!digits.startsWith('09')) digits = '09' + digits.slice(2);
    digits = digits.slice(0, 11);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 4) + ' ' + digits.slice(4);
    if (digits.length > 7) formatted = formatted.slice(0, 8) + ' ' + digits.slice(7);
    setEcNumber(formatted);
    setError('');
  };

  const handleSave = async () => {
    const nameTrimmed = ecName.trim();
    const rawNumber   = ecNumber.replace(/\s/g, '');
    if (!nameTrimmed) { setError('Please enter a name.'); return; }
    if (rawNumber && (rawNumber.length !== 11 || !rawNumber.startsWith('09'))) {
      setError('Phone number must be 11 digits starting with 09.');
      return;
    }
    const emailTrimmed = ecEmail.trim().toLowerCase();
    setLoading(true);
    setError('');
    try {
      await setDoc(
        doc(db, COLLECTIONS.USERS, userId),
        { emergencyContactName: nameTrimmed, emergencyContactNumber: rawNumber, emergencyContactEmail: emailTrimmed },
        { merge: true }
      );
      onSave({ emergencyContactName: nameTrimmed, emergencyContactNumber: rawNumber, emergencyContactEmail: emailTrimmed });
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={ecModalStyles.backdrop} onPress={close} />
        <Animated.View
          style={[ecModalStyles.sheet, { backgroundColor: colors.surface, transform: [{ translateY }], marginBottom: keyboardHeight }]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: Spacing.md }}
          >
            <View style={ecModalStyles.handle} />
            <Text style={[ecModalStyles.title, { color: colors.textPrimary }]}>Emergency Contact</Text>

            {!!currentNumber && (
              <View style={ecStyles.btnRow}>
                <TouchableOpacity
                  style={[ecStyles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => Linking.openURL(`tel:${currentNumber}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Call emergency contact"
                >
                  <Ionicons name="call" size={16} color="#fff" />
                  <Text style={ecStyles.actionBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[ecStyles.actionBtn, { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => Linking.openURL(`sms:${currentNumber}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Message emergency contact"
                >
                  <Ionicons name="chatbubble-outline" size={16} color={colors.textPrimary} />
                  <Text style={[ecStyles.actionBtnText, { color: colors.textPrimary }]}>Message</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={ecModalStyles.fieldGroup}>
              <Text style={[ecModalStyles.label, { color: colors.textSecondary }]}>Name</Text>
              <TextInput
                style={[ecModalStyles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="Full name"
                placeholderTextColor={colors.textTertiary}
                value={ecName}
                onChangeText={(t) => { setEcName(t); setError(''); }}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={ecModalStyles.fieldGroup}>
              <Text style={[ecModalStyles.label, { color: colors.textSecondary }]}>Phone Number</Text>
              <TextInput
                style={[ecModalStyles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="09XX XXX XXXX"
                placeholderTextColor={colors.textTertiary}
                value={ecNumber}
                onFocus={handleEcNumberFocus}
                onBlur={handleEcNumberBlur}
                onChangeText={handleEcNumberChange}
                keyboardType="number-pad"
                returnKeyType="next"
                maxLength={13}
              />
            </View>

            <View style={ecModalStyles.fieldGroup}>
              <Text style={[ecModalStyles.label, { color: colors.textSecondary }]}>Emergency Contact Email</Text>
              <TextInput
                style={[ecModalStyles.input, { color: colors.textPrimary, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="email@example.com"
                placeholderTextColor={colors.textTertiary}
                value={ecEmail}
                onChangeText={(t) => { setEcEmail(t); setError(''); }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
            </View>

            {!!error && (
              <Text style={[ecModalStyles.errorText, { color: colors.error }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[ecModalStyles.saveBtn, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Save emergency contact"
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={[ecModalStyles.saveBtnText, { color: colors.textInverse }]}>Save</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// FONT SIZE MODAL
// ─────────────────────────────────────────────────────────────
function FontSizeModal({ visible, currentKey, onSelect, onClose, colors }) {
  const mStyles = useMemo(() => makeModalStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={mStyles.overlay} onPress={onClose}>
        <Pressable style={mStyles.card} onPress={() => {}}>
          <Text style={mStyles.title}>Font Size</Text>
          <Text style={mStyles.subtitle}>Choose how text appears throughout the app.</Text>
          {FONT_SIZE_OPTIONS.map((opt) => {
            const selected = currentKey === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[
                  fsMStyles.optRow,
                  {
                    borderColor:       selected ? colors.primary : colors.border,
                    backgroundColor:   selected ? colors.primaryLight : 'transparent',
                  },
                ]}
                onPress={() => onSelect(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={opt.label}
              >
                <Text
                  style={[
                    fsMStyles.optLabel,
                    {
                      color:    selected ? colors.primary : colors.textPrimary,
                      fontSize: Math.round(15 * opt.multiplier),
                    },
                  ]}
                >
                  {opt.label}
                </Text>
                {selected && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
            <Text style={mStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// SHARED SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────
function SectionHeader({ title, trailing, colors }) {
  const { fontSizeMultiplier } = useAccessibility();
  const titleSize = Math.round(Typography.label.fontSize * fontSizeMultiplier);
  return (
    <View style={sectStyles.row}>
      <Text
        style={[sectStyles.title, { color: colors.textSecondary, fontSize: titleSize }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}

function InfoRow({ icon, label, value, colors }) {
  const { fontSizeMultiplier } = useAccessibility();
  const labelSize = Math.round(Typography.body.fontSize    * fontSizeMultiplier);
  const valueSize = Math.round(Typography.bodySmall.fontSize * fontSizeMultiplier);
  return (
    <View style={[infoStyles.row, { borderBottomColor: colors.border }]}>
      <View style={[infoStyles.iconWrap, { backgroundColor: colors.borderLight }]}>
        <Ionicons name={icon} size={18} color={colors.textSecondary} />
      </View>
      <Text style={[infoStyles.label, { color: colors.textPrimary, fontSize: labelSize }]} numberOfLines={1}>{label}</Text>
      <Text style={[infoStyles.value, { color: colors.textSecondary, fontSize: valueSize }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ToggleRow({ icon, label, sublabel, value, onChange, accentColor, colors, isLast }) {
  const { fontSizeMultiplier } = useAccessibility();
  const labelSize   = Math.round(Typography.body.fontSize    * fontSizeMultiplier);
  const sublabelSize = Math.round(Typography.caption.fontSize * fontSizeMultiplier);
  return (
    <View style={[
      toggleStyles.row,
      { borderBottomWidth: isLast ? 0 : 1, borderBottomColor: colors.border },
    ]}>
      <View style={[toggleStyles.iconWrap, { backgroundColor: accentColor + '18' }]}>
        <Ionicons name={icon} size={18} color={accentColor} importantForAccessibility="no" />
      </View>
      <View style={toggleStyles.text}>
        <Text style={[toggleStyles.label, { color: colors.textPrimary, fontSize: labelSize }]} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text style={[toggleStyles.sublabel, { color: colors.textSecondary, fontSize: sublabelSize }]} maxFontSizeMultiplier={1.5}>{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary + '60' }}
        thumbColor={value ? colors.primary : colors.textTertiary}
        accessibilityLabel={label}
        accessibilityHint={sublabel}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────
const makeStyles = (c, bw = 1, fsm = 1.0) => {
  const T = fsm === 1.0 ? Typography : Object.fromEntries(
    Object.entries(Typography).map(([k, v]) => [k, { ...v, fontSize: Math.round(v.fontSize * fsm) }])
  );
  return StyleSheet.create({
    safe:    { flex: 1, backgroundColor: c.background },
    content: { padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md },
    profileCard: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radius.lg,
      padding: Spacing.xl,
      borderWidth: 1,
      borderColor: c.border,
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    avatarWrap:    { width: 72, height: 72 },
    avatar:        { width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    avatarLoading: { backgroundColor: c.primary + 'aa' },
    avatarImage:        { width: 72, height: 72, borderRadius: 36 },
    avatarImageAbsolute:{ position: 'absolute', top: 0, left: 0 },
    avatarImageHidden:  { opacity: 0 },
    avatarBadge: {
      position: 'absolute', bottom: 0, right: 0,
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: c.surface,
    },
    avatarText:  { ...T.h1, color: c.textInverse },
    nameRow:     { flexDirection: 'row', alignItems: 'center' },
    displayName: { ...T.h4, color: c.textPrimary },
    email:       { ...T.bodySmall, color: c.textSecondary },
    memberSince: { ...T.caption, color: c.textTertiary },
    section:     { backgroundColor: c.surface, borderRadius: Radius.lg, borderWidth: bw, borderColor: c.border, overflow: 'hidden' },
    tappableRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      padding: Spacing.md, minHeight: MIN_TOUCH,
      borderTopWidth: 1, borderColor: c.border,
    },
    rowIconWrap:  { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: c.borderLight, alignItems: 'center', justifyContent: 'center' },
    rowLabel:     { ...T.body, color: c.textPrimary, flex: 1 },
    rowValue:     { ...T.bodySmall, color: c.textSecondary, flexShrink: 1 },
    actionRow: {
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      padding: Spacing.md, minHeight: MIN_TOUCH,
      borderTopWidth: 1, borderColor: c.border,
    },
    actionIcon:   { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
    actionLabel:  { ...T.body, color: c.textPrimary, flex: 1 },
    logoutBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: Spacing.sm, borderRadius: Radius.full, height: 52,
      borderWidth: 1.5, borderColor: c.error,
      backgroundColor: c.errorLight, marginTop: Spacing.xs,
    },
    logoutText:  { ...T.button, color: c.error },
    btnDisabled: { opacity: 0.6 },
    deleteBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.sm },
    deleteText:  { ...T.bodySmall, color: c.textTertiary },
    footer:      { ...T.caption, color: c.textTertiary, textAlign: 'center', lineHeight: 18 },

    // Presence status card
    presenceCard: {
      backgroundColor: c.surface,
      borderRadius:    Radius.lg,
      padding:         Spacing.md,
      borderWidth:     1,
      borderColor:     c.border,
      gap:             Spacing.sm,
    },
    presenceLabel:   { ...T.label, color: c.textSecondary },
    presencePillRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    presencePill: {
      borderWidth:       1,
      borderColor:       c.border,
      borderRadius:      Radius.full,
      paddingHorizontal: 12,
      paddingVertical:   6,
    },
    presencePillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    presenceDot: { width: 8, height: 8, borderRadius: 4 },
    presencePillText: { ...T.caption, color: c.textSecondary, fontWeight: '600' },
  });
};

const sectStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  title: { ...Typography.label, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const infoStyles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: MIN_TOUCH, borderBottomWidth: 1 },
  iconWrap: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  label:    { ...Typography.body, flex: 1 },
  value:    { ...Typography.bodySmall, flexShrink: 1 },
});

const toggleStyles = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, padding: Spacing.md, minHeight: MIN_TOUCH + 8 },
  iconWrap: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  text:     { flex: 1, gap: 2 },
  label:    { ...Typography.body },
  sublabel: { ...Typography.caption },
});

const makeModalStyles = (c) => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  card: {
    width: '100%', backgroundColor: c.surface,
    borderRadius: Radius.xl, padding: Spacing.lg, gap: Spacing.md, zIndex: 1,
  },
  title:      { ...Typography.h3, color: c.textPrimary },
  subtitle:   { ...Typography.bodySmall, color: c.textSecondary, marginTop: -Spacing.xs },
  input: {
    height: 48, borderWidth: 1.5, borderColor: c.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    ...Typography.body, color: c.textPrimary, backgroundColor: c.background,
  },
  inputError:  { borderColor: c.error },
  errorText:   { ...Typography.bodySmall, color: c.error },
  btnRow:      { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  cancelBtn:   { flex: 1, height: 46, borderRadius: Radius.md, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
  cancelText:  { ...Typography.button, color: c.textSecondary },
  saveBtn:     { flex: 1, height: 46, borderRadius: Radius.md, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  saveText:    { ...Typography.button, color: c.textInverse },
  btnDisabled: { opacity: 0.6 },
});

const delStyles = StyleSheet.create({
  warningBadge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderRadius: Radius.md, paddingHorizontal: Spacing.sm, paddingVertical: 6, alignSelf: 'flex-start' },
  warningText:  { ...Typography.label },
  body:         { ...Typography.bodySmall, lineHeight: 20 },
  deleteBtn:    { flex: 1, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText:{ ...Typography.button },
});

const soStyles = StyleSheet.create({
  iconWrap:    { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: Spacing.xs },
  confirmBtn:  { flex: 1, height: 46, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  confirmText: { ...Typography.button },
});

const hiStyles = StyleSheet.create({
  row:        { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  textBlock:  { flex: 1, gap: 2 },
  fieldLabel: { ...Typography.caption, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { ...Typography.bodySmall, lineHeight: 20 },
});

const ecStyles = StyleSheet.create({
  infoRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  infoText:      { flex: 1, gap: 2 },
  contactName:   { ...Typography.body, fontWeight: '600' },
  contactNumber: { ...Typography.bodySmall },
  btnRow:        { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6,
    height: 40, borderRadius: Radius.md,
  },
  actionBtnText: { ...Typography.button, fontSize: 14, color: '#fff' },
});

const fsMStyles = StyleSheet.create({
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  optLabel: { fontWeight: '500' },
});

const ecModalStyles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.md,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.18)', alignSelf: 'center', marginBottom: Spacing.xs,
  },
  title:       { ...Typography.h3 },
  fieldGroup:  { gap: Spacing.xs },
  label:       { ...Typography.label },
  input: {
    height: 48, borderWidth: 1.5, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, ...Typography.body,
  },
  errorText:   { ...Typography.bodySmall },
  saveBtn:     { height: 52, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { ...Typography.button },
});
