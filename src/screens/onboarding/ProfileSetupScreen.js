import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, SafeAreaView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Typography, Spacing, Radius, MIN_TOUCH, COLLECTIONS } from '../../utils/constants';

const AVATAR_SIZE = 96;

export default function ProfileSetupScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [displayName,   setDisplayName]   = useState('');
  const [age,           setAge]           = useState('');
  const [weight,        setWeight]        = useState('');
  const [height,        setHeight]        = useState('');
  const [photoUri,      setPhotoUri]      = useState(null);
  const [weightUnit,    setWeightUnit]    = useState('kg');
  const [heightUnit,    setHeightUnit]    = useState('cm');
  const [errors,        setErrors]        = useState({});
  const [loading,       setLoading]       = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  const initials = displayName.trim()
    ? displayName.trim().split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setErrors((prev) => ({ ...prev, photo: 'Permission to access photos is required.' }));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      setErrors((prev) => { const n = { ...prev }; delete n.photo; return n; });
    }
  };

  const uploadPhoto = async (uid) => {
    setAvatarLoading(true);
    try {
      const response = await fetch(photoUri);
      const blob     = await response.blob();
      const photoRef = ref(storage, `profile_pictures/${uid}`);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(photoRef, blob);
        task.on('state_changed', null, reject, resolve);
      });
      return await getDownloadURL(photoRef);
    } finally {
      setAvatarLoading(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!displayName.trim())                          e.displayName = 'Please enter your name.';
    if (!age.trim())                                  e.age         = 'Please enter your age.';
    else if (isNaN(age) || +age <= 0 || +age > 120)  e.age         = 'Please enter a valid age.';
    if (!weight.trim())                               e.weight      = 'Please enter your weight.';
    else if (isNaN(weight) || +weight <= 0)           e.weight      = 'Please enter a valid weight.';
    if (!height.trim())                               e.height      = 'Please enter your height.';
    else if (heightUnit === 'in') {
      const totalIn = parseFeetInches(height);
      if (isNaN(totalIn) || totalIn <= 0)             e.height      = 'Please enter a valid height.';
    } else if (isNaN(height) || +height <= 0)         e.height      = 'Please enter a valid height.';
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setErrors({});
    setLoading(true);
    try {
      let photoURL = null;
      if (photoUri) {
        photoURL = await uploadPhoto(user.uid);
      }

      const authUpdate = { displayName: displayName.trim() };
      if (photoURL) authUpdate.photoURL = photoURL;
      await updateProfile(auth.currentUser, authUpdate);

      const firestoreData = {
        displayName:          displayName.trim(),
        age:                  parseInt(age, 10),
        weight:               Math.round(toMetricWeight(parseFloat(weight)) * 10) / 10,
        height:               Math.round(toMetricHeight() * 10) / 10,
        profileSetupComplete: true,
      };
      if (photoURL) firestoreData.photoURL = photoURL;

      await setDoc(doc(db, COLLECTIONS.USERS, user.uid), firestoreData, { merge: true });
      navigation.replace('Main');
    } catch (err) {
      setErrors({ submit: 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const clearError = (field) => {
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const switchWeightUnit = (unit) => {
    if (unit === weightUnit) return;
    if (weight !== '') {
      const val = parseFloat(weight);
      if (!isNaN(val)) {
        const converted = unit === 'lbs' ? val * 2.20462 : val / 2.20462;
        setWeight(converted.toFixed(1));
      }
    }
    setWeightUnit(unit);
  };

  // Parse a height string that may be cm ("175") or feet/inches ("5'9" or "5'")
  const parseFeetInches = (str) => {
    if (str.includes("'")) {
      const [feetPart, inchesPart] = str.split("'");
      const feet   = parseInt(feetPart, 10)  || 0;
      const inches = parseInt(inchesPart, 10) || 0;
      return feet * 12 + inches; // total inches
    }
    return parseFloat(str);
  };

  const fmtFeetInches = (totalInches) => {
    const ft = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${ft}'${inches}`;
  };

  const switchHeightUnit = (unit) => {
    if (unit === heightUnit) return;
    if (height !== '') {
      if (unit === 'in') {
        // cm → total inches → feet/inches display
        const cm = parseFloat(height);
        if (!isNaN(cm)) {
          const totalInches = cm / 2.54;
          setHeight(fmtFeetInches(totalInches));
        }
      } else {
        // feet/inches → cm
        const totalInches = parseFeetInches(height);
        if (!isNaN(totalInches) && totalInches > 0) {
          setHeight((totalInches * 2.54).toFixed(1));
        }
      }
    }
    setHeightUnit(unit);
  };

  const handleHeightKeyPress = ({ nativeEvent }) => {
    if (heightUnit !== 'in' || nativeEvent.key !== 'Backspace') return;
    // Backspace on "5'" or shorter → clear entirely
    if (/^\d'?$/.test(height)) {
      setHeight('');
    }
  };

  const handleAgeChange = (t) => {
    const cleaned = t.replace(/[^0-9]/g, '');
    if (cleaned.length > 2) return;
    setAge(cleaned);
    clearError('age');
  };

  const handleWeightChange = (t) => {
    // Allow up to 3 digits + optional decimal + 1 decimal digit (e.g. 85.5)
    if (!/^\d{0,3}(\.\d?)?$/.test(t)) return;
    setWeight(t);
    clearError('weight');
  };

  const handleHeightChange = (t) => {
    if (heightUnit === 'in') {
      const cleaned = t.replace(/[^0-9]/g, ''); // only digits; apostrophe is synthetic
      // feet = 1 digit, inches = 1 digit max → total digits ≤ 2
      if (cleaned.length > 2) return;
      if (cleaned === '') {
        setHeight('');
      } else {
        setHeight(cleaned[0] + "'" + cleaned.slice(1));
      }
    } else {
      // Allow up to 3 digits + optional decimal + 1 decimal digit (e.g. 175.5)
      if (!/^\d{0,3}(\.\d?)?$/.test(t)) return;
      setHeight(t);
    }
    clearError('height');
  };

  // Always save in metric
  const toMetricWeight = (val) => weightUnit === 'lbs' ? val / 2.20462 : val;
  const toMetricHeight = () => {
    if (heightUnit === 'in') {
      const [feetPart, inchesPart] = height.split("'");
      const feet   = parseInt(feetPart,   10) || 0;
      const inches = parseInt(inchesPart, 10) || 0;
      return feet * 30.48 + inches * 2.54;
    }
    return parseFloat(height);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerWrap}>
            <Text style={styles.screenTitle}>Set Up Your Profile</Text>
            <Text style={styles.screenSubtitle}>
              Tell us a bit about yourself so we can personalise your health insights.
            </Text>
          </View>

          {/* ── Avatar picker ──────────────────────────────────────────── */}
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={pickImage}
              disabled={avatarLoading}
              accessibilityRole="button"
              accessibilityLabel="Choose profile picture"
            >
              {avatarLoading ? (
                <View style={[styles.avatarCircle, { backgroundColor: colors.borderLight }]}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.avatarCircle} />
              ) : (
                <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}>
                  {displayName.trim() ? (
                    <Text style={[styles.avatarInitials, { color: colors.primary }]}>{initials}</Text>
                  ) : (
                    <Ionicons name="camera" size={28} color={colors.primary} />
                  )}
                </View>
              )}

              {/* Edit badge */}
              <View style={[styles.avatarBadge, { backgroundColor: colors.primary }]}>
                <Ionicons name="pencil" size={10} color="#fff" />
              </View>
            </TouchableOpacity>

            <Text style={styles.avatarHint}>
              {photoUri ? 'Tap to change photo' : 'Add a profile photo (optional)'}
            </Text>
            {errors.photo && (
              <Text style={[styles.avatarError, { color: colors.error }]}>{errors.photo}</Text>
            )}
          </View>

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

            {/* Weight + Height side by side */}
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
              style={[styles.primaryBtn, (loading || avatarLoading) && styles.btnDisabled]}
              onPress={handleSave}
              disabled={loading || avatarLoading}
              accessibilityRole="button"
              accessibilityLabel="Save profile and continue"
              accessibilityState={{ disabled: loading || avatarLoading, busy: loading }}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={styles.primaryBtnText}>Continue</Text>
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
  safe:  { flex: 1, backgroundColor: c.background },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  headerWrap:     { gap: Spacing.xs },
  screenTitle:    { ...Typography.h1, color: c.textPrimary },
  screenSubtitle: { ...Typography.body, color: c.textSecondary },
  avatarSection: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 1,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.background,
  },
  avatarHint:  { ...Typography.caption, color: c.textTertiary },
  avatarError: { ...Typography.caption },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.md,
  },
  fieldGroup: { gap: Spacing.xs },
  labelRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label:      { ...Typography.label, color: c.textPrimary },
  unitToggle: { flexDirection: 'row', gap: 4 },
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
  inputError: { borderColor: c.error },
  icon:  { marginRight: Spacing.xs },
  input: {
    flex: 1,
    ...Typography.body,
    color: c.textPrimary,
    paddingVertical: Spacing.sm,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  inputNoPad: { paddingHorizontal: 0 },
  row:        { flexDirection: 'row', gap: Spacing.sm },
  halfField:  { flex: 1 },
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
