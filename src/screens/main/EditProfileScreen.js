import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, SafeAreaView, Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  const [weight,      setWeight]      = useState('');
  const [height,      setHeight]      = useState('');
  const [weightUnit,  setWeightUnit]  = useState('kg');
  const [heightUnit,  setHeightUnit]  = useState('cm');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address,     setAddress]     = useState('');
  const [allergies,          setAllergies]          = useState('');
  const [medicalConditions,  setMedicalConditions]  = useState('');
  const [currentMedications, setCurrentMedications] = useState('');
  const [errors,      setErrors]      = useState({});
  const [loading,     setLoading]     = useState(false);
  const [fetching,       setFetching]       = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Load existing profile ─────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const profile = await getUserProfile(user.uid);
        setDisplayName(profile?.displayName || user.displayName || '');

        // Weight stored in kg — display as-is
        if (profile?.weight != null) {
          setWeight(String(profile.weight));
        }

        // Height stored in cm — display as-is
        if (profile?.height != null) {
          setHeight(String(profile.height));
        }

        const raw = (profile?.phoneNumber || '').replace(/\s/g, '').slice(0, 11);
        if (raw.length > 0) {
          let fmtPhone = raw;
          if (raw.length > 4) fmtPhone = raw.slice(0, 4) + ' ' + raw.slice(4);
          if (raw.length > 7) fmtPhone = fmtPhone.slice(0, 8) + ' ' + raw.slice(7);
          setPhoneNumber(fmtPhone);
        }
        setDateOfBirth(profile?.dateOfBirth || '');
        setAddress(profile?.address || '');
        setAllergies(profile?.allergies || '');
        setMedicalConditions(profile?.medicalConditions || '');
        setCurrentMedications(profile?.currentMedications || '');
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

  const handlePhoneFocus = () => {
    if (!phoneNumber) setPhoneNumber('09');
  };

  const handlePhoneBlur = () => {
    const raw = phoneNumber.replace(/\s/g, '');
    if (raw === '09' || raw.length < 3) setPhoneNumber('');
  };

  const handlePhoneChange = (t) => {
    let digits = t.replace(/[^0-9]/g, '');
    if (digits.length < 2) { setPhoneNumber('09'); return; }
    if (!digits.startsWith('09')) digits = '09' + digits.slice(2);
    digits = digits.slice(0, 11);
    let formatted = digits;
    if (digits.length > 4) formatted = digits.slice(0, 4) + ' ' + digits.slice(4);
    if (digits.length > 7) formatted = formatted.slice(0, 8) + ' ' + digits.slice(7);
    setPhoneNumber(formatted);
    clearError('phoneNumber');
  };

  const handleDobChange = (t) => {
    const digits = t.replace(/[^0-9]/g, '');
    let formatted = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) formatted = formatted.slice(0, 5) + '/' + digits.slice(4, 8);
    setDateOfBirth(formatted);
    clearError('dateOfBirth');
  };

  const maxPickerDate = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 5);
    return d;
  }, []);
  const minPickerDate = useMemo(() => new Date(1900, 0, 1), []);
  const pickerValue = useMemo(() => {
    const parts = dateOfBirth.split('/');
    if (parts.length === 3 && parts[2]?.length === 4) {
      const d = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
      if (!isNaN(d.getTime())) return d;
    }
    return maxPickerDate;
  }, [dateOfBirth, maxPickerDate]);

  const handleDatePickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (event.type === 'dismissed' || !selectedDate) return;
    }
    if (!selectedDate) return;
    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(selectedDate.getDate()).padStart(2, '0');
    const yyyy = selectedDate.getFullYear();
    setDateOfBirth(`${mm}/${dd}/${yyyy}`);
    clearError('dateOfBirth');
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

  const calculateAgeFromDob = (dob) => {
    const parts = dob.split('/');
    if (parts.length !== 3 || parts[2].length !== 4) return null;
    const birthDate = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  // ── Validation ────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!displayName.trim())                         e.displayName = 'Please enter your name.';
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

    if (phoneNumber.trim()) {
      const raw = phoneNumber.replace(/\s/g, '');
      if (raw.length !== 11 || !raw.startsWith('09'))
        e.phoneNumber = 'Phone number must be 11 digits starting with 09.';
    }

    if (dateOfBirth.trim()) {
      const parts = dateOfBirth.split('/');
      const mm = parseInt(parts[0], 10);
      const dd = parseInt(parts[1], 10);
      const yyyy = parseInt(parts[2], 10);
      const currentYear = new Date().getFullYear();
      if (
        parts.length !== 3 || parts[2]?.length !== 4 ||
        isNaN(mm) || mm < 1 || mm > 12 ||
        isNaN(dd) || dd < 1 || dd > 31 ||
        isNaN(yyyy) || yyyy < 1900 || yyyy > currentYear - 5
      ) {
        e.dateOfBirth = 'Enter a valid date of birth.';
      }
    }

    if (!address.trim()) e.address = 'Address is required.';

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

      const updateData = {
        displayName: displayName.trim(),
        age:         calculateAgeFromDob(dateOfBirth),
        weight:      Math.round(toMetricWeight(parseFloat(weight)) * 10) / 10,
        height:      Math.round(toMetricHeight() * 10) / 10,
        address:     address.trim(),
      };
      if (phoneNumber.trim()) updateData.phoneNumber = phoneNumber.replace(/\s/g, '');
      if (dateOfBirth.trim()) updateData.dateOfBirth = dateOfBirth.trim();
      updateData.allergies          = allergies.trim();
      updateData.medicalConditions  = medicalConditions.trim();
      updateData.currentMedications = currentMedications.trim();

      await setDoc(doc(db, COLLECTIONS.USERS, user.uid), updateData, { merge: true });

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

            {/* Phone Number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={[styles.inputWrap, errors.phoneNumber && styles.inputError]}>
                <Ionicons name="call-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="09XX XXX XXXX"
                  placeholderTextColor={colors.textTertiary}
                  value={phoneNumber}
                  onFocus={handlePhoneFocus}
                  onBlur={handlePhoneBlur}
                  onChangeText={handlePhoneChange}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  maxLength={13}
                />
              </View>
              {errors.phoneNumber && <InlineError message={errors.phoneNumber} colors={colors} styles={styles} />}
            </View>

            {/* Date of Birth */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Date of Birth</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={dateOfBirth ? `${dateOfBirth.split('/')[2]}-${dateOfBirth.split('/')[0]}-${dateOfBirth.split('/')[1]}` : ''}
                  max={maxPickerDate.toISOString().split('T')[0]}
                  min="1900-01-01"
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split('-');
                    setDateOfBirth(`${m}/${d}/${y}`);
                  }}
                  style={{
                    width: '100%',
                    height: 48,
                    paddingTop: 8,
                    paddingBottom: 8,
                    paddingLeft: 8,
                    paddingRight: 8,
                    borderRadius: 10,
                    border: '1px solid #E5E7EB',
                    fontSize: 15,
                    backgroundColor: '#F3F4F6',
                    color: '#111827',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              ) : (
                <View style={[styles.inputWrap, errors.dateOfBirth && styles.inputError]}>
                  <Ionicons name="gift-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                  <TextInput
                    style={styles.input}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor={colors.textTertiary}
                    value={dateOfBirth}
                    onChangeText={handleDobChange}
                    keyboardType="numeric"
                    returnKeyType="next"
                    maxLength={10}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      console.log('calendar icon tapped');
                      setShowDatePicker(true);
                    }}
                    style={styles.calendarBtn}
                    accessibilityLabel="Open date picker"
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              )}
              {errors.dateOfBirth && <InlineError message={errors.dateOfBirth} colors={colors} styles={styles} />}
            </View>

            {/* Address */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Address</Text>
              <View style={[styles.inputWrap, errors.address && styles.inputError]}>
                <Ionicons name="location-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your address"
                  placeholderTextColor={colors.textTertiary}
                  value={address}
                  onChangeText={(t) => { setAddress(t); clearError('address'); }}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
              </View>
              {errors.address && <InlineError message={errors.address} colors={colors} styles={styles} />}
            </View>

            {/* Allergies */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Allergies</Text>
              <View style={[styles.inputWrap, styles.multilineWrap]}>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  placeholder="e.g. Peanuts, Penicillin, Pollen"
                  placeholderTextColor={colors.textTertiary}
                  value={allergies}
                  onChangeText={setAllergies}
                  multiline
                  maxLength={200}
                  returnKeyType="default"
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Medical Conditions */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Medical Conditions</Text>
              <View style={[styles.inputWrap, styles.multilineWrap]}>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  placeholder="e.g. Asthma, Diabetes, Hypertension"
                  placeholderTextColor={colors.textTertiary}
                  value={medicalConditions}
                  onChangeText={setMedicalConditions}
                  multiline
                  maxLength={200}
                  returnKeyType="default"
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Current Medications */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Current Medications</Text>
              <View style={[styles.inputWrap, styles.multilineWrap]}>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  placeholder="e.g. Metformin 500mg, Salbutamol inhaler"
                  placeholderTextColor={colors.textTertiary}
                  value={currentMedications}
                  onChangeText={setCurrentMedications}
                  multiline
                  maxLength={200}
                  returnKeyType="default"
                  textAlignVertical="top"
                />
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

      {Platform.OS === 'ios' && showDatePicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
              <View style={styles.pickerHeader}>
                <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>Date of Birth</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={[styles.pickerDone, { color: colors.primary }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={pickerValue}
                mode="date"
                display="spinner"
                onChange={handleDatePickerChange}
                maximumDate={maxPickerDate}
                minimumDate={minPickerDate}
                textColor={colors.textPrimary}
              />
            </View>
          </View>
        </Modal>
      )}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="default"
          onChange={handleDatePickerChange}
          maximumDate={maxPickerDate}
          minimumDate={minPickerDate}
        />
      )}
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
  multilineWrap:   { alignItems: 'flex-start' },
  multilineInput:  { minHeight: 60, paddingTop: Spacing.sm, textAlignVertical: 'top' },
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
  calendarBtn: { padding: 4 },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingBottom: Spacing.xl,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  pickerTitle: { ...Typography.h4, color: c.textPrimary },
  pickerDone:  { ...Typography.button },
});
