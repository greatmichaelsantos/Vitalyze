import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserProfile } from '../../services/firestoreService';
import { Typography, Spacing, Radius, MIN_TOUCH, COLLECTIONS, STORAGE_KEYS } from '../../utils/constants';

export default function EditProfileScreen({ navigation }) {
  const { user, refreshUser } = useAuth();
  const { colors, isDark }    = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [displayName, setDisplayName] = useState('');
  const [age,         setAge]         = useState('');
  const [weight,      setWeight]      = useState('');
  const [height,      setHeight]      = useState('');
  const [weightUnit,  setWeightUnit]  = useState('kg');
  const [heightUnit,  setHeightUnit]  = useState('cm');
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);
  const [fetching,    setFetching]    = useState(true);

  // ── Load existing profile ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const profile = await getUserProfile(user.uid);
        setDisplayName(profile?.displayName || user.displayName || '');
        setAge(profile?.age != null ? String(profile.age) : '');

        // Weight stored in kg — display as-is
        if (profile?.weight != null) {
          setWeight(String(profile.weight));
        }

        // Height stored in cm — display as-is
        if (profile?.height != null) {
          setHeight(String(profile.height));
        }
      } catch {
        // Prefill from Auth if Firestore unavailable
        setDisplayName(user.displayName || '');
      } finally {
        setFetching(false);
      }
    })();
  }, []);

  // ── Unit switch helpers ───────────────────────────────────
  const switchWeightUnit = (unit) => {
    if (unit === weightUnit) return;
    if (weight !== '') {
      const val = parseFloat(weight);
      if (!isNaN(val)) {
        setWeight((unit === 'lbs' ? val * 2.20462 : val / 2.20462).toFixed(1));
      }
    }
    setWeightUnit(unit);
  };

  const fmtFeetInches = (totalInches) => {
    const ft  = Math.floor(totalInches / 12);
    const ins = Math.round(totalInches % 12);
    return `${ft}'${ins}`;
  };

  const switchHeightUnit = (unit) => {
    if (unit === heightUnit) return;
    if (height !== '') {
      if (unit === 'in') {
        const cm = parseFloat(height);
        if (!isNaN(cm)) setHeight(fmtFeetInches(cm / 2.54));
      } else {
        const [fPart, iPart] = height.split("'");
        const feet   = parseInt(fPart, 10) || 0;
        const inches = parseInt(iPart, 10) || 0;
        setHeight((feet * 30.48 + inches * 2.54).toFixed(1));
      }
    }
    setHeightUnit(unit);
  };

  // ── Input handlers ────────────────────────────────────────
  const clearError = (field) =>
    setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  const handleAgeChange = (t) => {
    const cleaned = t.replace(/[^0-9]/g, '');
    if (cleaned.length > 2) return;
    setAge(cleaned);
    clearError('age');
  };

  const handleWeightChange = (t) => {
    if (!/^\d{0,3}(\.\d?)?$/.test(t)) return;
    setWeight(t);
    clearError('weight');
  };

  const handleHeightKeyPress = ({ nativeEvent }) => {
    if (heightUnit !== 'in' || nativeEvent.key !== 'Backspace') return;
    if (/^\d'?$/.test(height)) setHeight('');
  };

  const handleHeightChange = (t) => {
    if (heightUnit === 'in') {
      const cleaned = t.replace(/[^0-9]/g, '');
      if (cleaned.length > 2) return;
      setHeight(cleaned === '' ? '' : cleaned[0] + "'" + cleaned.slice(1));
    } else {
      if (!/^\d{0,3}(\.\d?)?$/.test(t)) return;
      setHeight(t);
    }
    clearError('height');
  };

  // ── Metric converters ─────────────────────────────────────
  const toMetricWeight = (val) => (weightUnit === 'lbs' ? val / 2.20462 : val);

  const toMetricHeight = () => {
    if (heightUnit === 'in') {
      const [fPart, iPart] = height.split("'");
      const feet   = parseInt(fPart, 10) || 0;
      const inches = parseInt(iPart, 10) || 0;
      return feet * 30.48 + inches * 2.54;
    }
    return parseFloat(height);
  };

  // ── Validation ────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!displayName.trim())                         e.displayName = 'Please enter your name.';
    if (!age.trim())                                 e.age         = 'Please enter your age.';
    else if (isNaN(age) || +age <= 0 || +age > 120) e.age         = 'Please enter a valid age.';
    if (!weight.trim())                              e.weight      = 'Please enter your weight.';
    else if (isNaN(weight) || +weight <= 0)          e.weight      = 'Please enter a valid weight.';
    if (!height.trim())                              e.height      = 'Please enter your height.';
    else if (heightUnit === 'in') {
      const [fPart, iPart] = height.split("'");
      const feet   = parseInt(fPart, 10) || 0;
      const inches = parseInt(iPart, 10) || 0;
      const cm     = feet * 30.48 + inches * 2.54;
      if (cm <= 0)                                   e.height      = 'Please enter a valid height.';
    } else if (isNaN(height) || +height <= 0)        e.height      = 'Please enter a valid height.';
    return e;
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    setLoading(true);
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });

      await setDoc(
        doc(db, COLLECTIONS.USERS, user.uid),
        {
          displayName: displayName.trim(),
          age:         parseInt(age, 10),
          weight:      Math.round(toMetricWeight(parseFloat(weight)) * 10) / 10,
          height:      Math.round(toMetricHeight() * 10) / 10,
        },
        { merge: true }
      );

      // Bust the cached insight so the next getLatestInsight call reads fresh
      // from Firestore instead of returning scores computed with the old height.
      await AsyncStorage.removeItem(STORAGE_KEYS.CACHED_INSIGHTS);

      await refreshUser();
      navigation.goBack();
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────
  if (fetching) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>

            {/* Display Name */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Display name</Text>
              <View style={[styles.inputWrap, errors.displayName && styles.inputError]}>
                <Ionicons name="person-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={colors.textTertiary}
                  value={displayName}
                  onChangeText={(t) => { setDisplayName(t); clearError('displayName'); }}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                />
              </View>
              {errors.displayName && <InlineError message={errors.displayName} colors={colors} styles={styles} />}
            </View>

            {/* Age */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Age</Text>
              <View style={[styles.inputWrap, errors.age && styles.inputError]}>
                <Ionicons name="calendar-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 21"
                  placeholderTextColor={colors.textTertiary}
                  value={age}
                  onChangeText={handleAgeChange}
                  keyboardType="number-pad"
                  returnKeyType="next"
                />
              </View>
              {errors.age && <InlineError message={errors.age} colors={colors} styles={styles} />}
            </View>

            {/* Weight + Height */}
            <View style={styles.row}>
              <View style={[styles.fieldGroup, styles.halfField]}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Weight</Text>
                  <UnitToggle
                    options={['kg', 'lbs']}
                    active={weightUnit}
                    onSelect={switchWeightUnit}
                    colors={colors}
                    styles={styles}
                  />
                </View>
                <View style={[styles.inputWrap, errors.weight && styles.inputError]}>
                  <TextInput
                    style={[styles.input, styles.inputNoPad]}
                    placeholder={weightUnit}
                    placeholderTextColor={colors.textTertiary}
                    value={weight}
                    onChangeText={handleWeightChange}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                {errors.weight && <InlineError message={errors.weight} colors={colors} styles={styles} />}
              </View>

              <View style={[styles.fieldGroup, styles.halfField]}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Height</Text>
                  <UnitToggle
                    options={['cm', 'in']}
                    active={heightUnit}
                    onSelect={switchHeightUnit}
                    colors={colors}
                    styles={styles}
                  />
                </View>
                <View style={[styles.inputWrap, errors.height && styles.inputError]}>
                  <TextInput
                    style={[styles.input, styles.inputNoPad]}
                    placeholder={heightUnit === 'cm' ? "e.g. 175" : "e.g. 5'9"}
                    placeholderTextColor={colors.textTertiary}
                    value={height}
                    onChangeText={handleHeightChange}
                    onKeyPress={handleHeightKeyPress}
                    keyboardType={heightUnit === 'in' ? 'number-pad' : 'decimal-pad'}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                </View>
                {errors.height && <InlineError message={errors.height} colors={colors} styles={styles} />}
              </View>
            </View>

            {errors.submit && (
              <View style={styles.errorBox} accessible={true} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText}>{errors.submit}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleSave}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Save profile changes"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={styles.primaryBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function UnitToggle({ options, active, onSelect, colors, styles }) {
  return (
    <View style={styles.unitToggle}>
      {options.map((opt) => {
        const isActive = opt === active;
        return (
          <TouchableOpacity
            key={opt}
            style={[
              styles.unitBtn,
              isActive
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: 'transparent', borderColor: colors.border },
            ]}
            onPress={() => onSelect(opt)}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${opt}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[styles.unitBtnText, { color: isActive ? '#fff' : colors.textSecondary }]}>
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function InlineError({ message, colors, styles }) {
  return (
    <View style={styles.inlineError} accessible={true} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={13} color={colors.error} />
      <Text style={[styles.inlineErrorText, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  safe:   { flex: 1, backgroundColor: c.background },
  flex:   { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    backgroundColor: c.background,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h4, color: c.textPrimary },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.md,
  },
  fieldGroup:  { gap: Spacing.xs },
  labelRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:       { ...Typography.label, color: c.textPrimary },
  unitToggle:  { flexDirection: 'row', gap: 4 },
  unitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  unitBtnText: { ...Typography.caption, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.borderLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: Spacing.sm,
  },
  inputError:  { borderColor: c.error },
  icon:        { marginRight: Spacing.xs },
  input: {
    flex: 1,
    ...Typography.body,
    color: c.textPrimary,
    paddingVertical: Spacing.sm,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  inputNoPad:      { paddingHorizontal: 0 },
  row:             { flexDirection: 'row', gap: Spacing.sm },
  halfField:       { flex: 1 },
  inlineError:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineErrorText: { ...Typography.caption, flex: 1 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: c.errorLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  errorText:      { ...Typography.bodySmall, color: c.error, flex: 1 },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled:    { opacity: 0.5 },
  primaryBtnText: { ...Typography.button, color: c.textInverse },
});
