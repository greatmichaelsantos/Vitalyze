import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { register, getFriendlyAuthError } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';

// ── Password requirement checks ──────────────────────────────────────────────
function getChecks(pw) {
  return {
    length:  pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    lower:   /[a-z]/.test(pw),
    number:  /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
}

const CHECKLIST = [
  { key: 'length',  label: 'At least 8 characters' },
  { key: 'upper',   label: '1 uppercase letter (A–Z)' },
  { key: 'lower',   label: '1 lowercase letter (a–z)' },
  { key: 'number',  label: '1 number (0–9)' },
  { key: 'special', label: '1 special character (!@#$%^&*...)' },
];

// 0-1 met → Weak | 2-3 → Fair | 4 → Good | 5 → Strong
const STRENGTH_LABEL = ['Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = ['#EF4444', '#F59E0B', '#EAB308', '#22C55E'];

function metToStrength(met) {
  if (met <= 1) return 0;
  if (met <= 3) return 1;
  if (met === 4) return 2;
  return 3;
}

export default function RegisterScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [passDisplay,    setPassDisplay]    = useState('');
  const [confirm,        setConfirm]        = useState('');
  const [confirmDisplay, setConfirmDisplay] = useState('');
  const [showPass,       setShowPass]       = useState(false);
  const [showConfirm,    setShowConfirm]    = useState(false);
  const [passFocused,    setPassFocused]    = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [fieldErrors,    setFieldErrors]    = useState({});
  const [agreed,         setAgreed]         = useState(false);
  const [hasOpenedTerms, setHasOpenedTerms] = useState(false);

  const passTimer    = useRef(null);
  const confirmTimer = useRef(null);

  useEffect(() => () => {
    clearTimeout(passTimer.current);
    clearTimeout(confirmTimer.current);
  }, []);

  // ── Masked password input handlers ────────────────────────────────────────
  const handlePassChange = (t) => {
    const oldLen = passDisplay.length;
    const newLen = t.length;
    let newPass = password;
    if (newLen > oldLen) {
      newPass = password + t.slice(oldLen);
    } else if (newLen < oldLen) {
      newPass = password.slice(0, password.length - (oldLen - newLen));
    }
    setPassword(newPass);
    clearFieldError('password');
    if (showPass) {
      setPassDisplay(newPass);
    } else {
      clearTimeout(passTimer.current);
      const lastChar = newPass.length > 0 ? newPass[newPass.length - 1] : '';
      const masked = newPass.length > 1 ? '•'.repeat(newPass.length - 1) + lastChar : lastChar;
      setPassDisplay(masked);
      passTimer.current = setTimeout(() => setPassDisplay('•'.repeat(newPass.length)), 800);
    }
  };

  const handleConfirmChange = (t) => {
    const oldLen = confirmDisplay.length;
    const newLen = t.length;
    let newConfirm = confirm;
    if (newLen > oldLen) {
      newConfirm = confirm + t.slice(oldLen);
    } else if (newLen < oldLen) {
      newConfirm = confirm.slice(0, confirm.length - (oldLen - newLen));
    }
    setConfirm(newConfirm);
    clearFieldError('confirm');
    if (showConfirm) {
      setConfirmDisplay(newConfirm);
    } else {
      clearTimeout(confirmTimer.current);
      const lastChar = newConfirm.length > 0 ? newConfirm[newConfirm.length - 1] : '';
      const masked = newConfirm.length > 1 ? '•'.repeat(newConfirm.length - 1) + lastChar : lastChar;
      setConfirmDisplay(masked);
      confirmTimer.current = setTimeout(() => setConfirmDisplay('•'.repeat(newConfirm.length)), 800);
    }
  };

  const clearFieldError = (field) =>
    setFieldErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  // ── Derived strength values ────────────────────────────────────────────────
  const checks       = getChecks(password);
  const metCount     = Object.values(checks).filter(Boolean).length;
  const strength     = metToStrength(metCount);
  const strengthLabel = password.length > 0 ? STRENGTH_LABEL[strength] : null;
  const strengthColor = STRENGTH_COLOR[strength];
  const showChecklist = passFocused || password.length > 0;

  // Real-time confirm mismatch
  const confirmMismatch = confirm.length > 0 && password !== confirm;

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (!email.trim()) {
      e.email = 'This field is required.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      e.email = 'Please enter a valid email address (e.g. you@example.com).';
    }
    if (!password) {
      e.password = 'This field is required.';
    } else if (metCount < 5) {
      e.password = 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';
    }
    if (!confirm) {
      e.confirm = 'This field is required.';
    } else if (password !== confirm) {
      e.confirm = 'Passwords do not match. Please try again.';
    }
    return e;
  };

  const handleRegister = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) { setFieldErrors(e); return; }
    setFieldErrors({});
    setLoading(true);
    try {
      await register(email.trim().toLowerCase(), password);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setFieldErrors({ email: 'An account with this email already exists. Try signing in instead.' });
      } else {
        setFieldErrors({ submit: getFriendlyAuthError(err.code) });
      }
    } finally {
      setLoading(false);
    }
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
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerWrap}>
            <Text style={styles.screenTitle}>Create Account</Text>
            <Text style={styles.screenSubtitle}>Start your personalised health journey today.</Text>
          </View>

          <View style={styles.card}>
            {/* ── Email ─────────────────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email address</Text>
              <View style={[styles.inputWrap, fieldErrors.email && styles.inputError]}>
                <Ionicons name="mail-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearFieldError('email'); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </View>
              {fieldErrors.email && <InlineError message={fieldErrors.email} colors={colors} styles={styles} />}
            </View>

            {/* ── Password ──────────────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputWrap, fieldErrors.password && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.textTertiary}
                  value={passDisplay}
                  onChangeText={handlePassChange}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  secureTextEntry={false}
                  selection={!showPass ? { start: passDisplay.length, end: passDisplay.length } : undefined}
                  textContentType="newPassword"
                  returnKeyType="next"
                  accessibilityLabel="Password"
                  accessibilityHint={strengthLabel ? `Password strength: ${strengthLabel}` : 'Enter at least 8 characters'}
                />
                <TouchableOpacity
                  onPress={() => {
                    const next = !showPass;
                    setShowPass(next);
                    clearTimeout(passTimer.current);
                    setPassDisplay(next ? password : '•'.repeat(password.length));
                  }}
                  style={styles.eyeBtn}
                  accessibilityLabel={showPass ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                  accessibilityState={{ checked: showPass }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              {/* Strength bar */}
              {strengthLabel && (
                <View
                  style={styles.strengthRow}
                  accessible={true}
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={`Password strength: ${strengthLabel}`}
                >
                  <View style={styles.strengthBars}>
                    {[0, 1, 2, 3].map((lvl) => (
                      <View
                        key={lvl}
                        style={[
                          styles.strengthBar,
                          { backgroundColor: lvl <= strength ? strengthColor : colors.border },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={[styles.strengthText, { color: strengthColor }]} maxFontSizeMultiplier={1.3}>
                    {strengthLabel}
                  </Text>
                </View>
              )}

              {/* Requirements checklist */}
              {showChecklist && (
                <View style={styles.checklist} accessibilityLiveRegion="polite">
                  {CHECKLIST.map(({ key, label }) => {
                    const met = checks[key];
                    return (
                      <View key={key} style={styles.checkItem}>
                        <Ionicons
                          name={met ? 'checkmark-circle' : 'close-circle-outline'}
                          size={14}
                          color={met ? '#22C55E' : colors.textTertiary}
                        />
                        <Text
                          style={[styles.checkLabel, { color: met ? '#22C55E' : colors.textTertiary }]}
                          maxFontSizeMultiplier={1.3}
                        >
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {fieldErrors.password && <InlineError message={fieldErrors.password} colors={colors} styles={styles} />}
            </View>

            {/* ── Confirm Password ──────────────────────────────────────── */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={[styles.inputWrap, (fieldErrors.confirm || confirmMismatch) && styles.inputError]}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} style={styles.icon} />
                <TextInput
                  style={styles.input}
                  placeholder="Repeat your password"
                  placeholderTextColor={colors.textTertiary}
                  value={confirmDisplay}
                  onChangeText={handleConfirmChange}
                  secureTextEntry={false}
                  selection={!showConfirm ? { start: confirmDisplay.length, end: confirmDisplay.length } : undefined}
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                  accessibilityLabel="Confirm password"
                  accessibilityHint={confirmMismatch ? 'Passwords do not match' : 'Repeat your password'}
                />
                <TouchableOpacity
                  onPress={() => {
                    const next = !showConfirm;
                    setShowConfirm(next);
                    clearTimeout(confirmTimer.current);
                    setConfirmDisplay(next ? confirm : '•'.repeat(confirm.length));
                  }}
                  style={styles.eyeBtn}
                  accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  accessibilityRole="button"
                  accessibilityState={{ checked: showConfirm }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {confirmMismatch && !fieldErrors.confirm && (
                <InlineError message="Passwords do not match. Please try again." colors={colors} styles={styles} />
              )}
              {fieldErrors.confirm && <InlineError message={fieldErrors.confirm} colors={colors} styles={styles} />}
            </View>

            {/* Submit-level error (network, unknown) */}
            {fieldErrors.submit && (
              <View
                style={styles.errorBox}
                accessible={true}
                accessibilityLiveRegion="polite"
                accessibilityLabel={fieldErrors.submit}
              >
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText} maxFontSizeMultiplier={1.5}>{fieldErrors.submit}</Text>
              </View>
            )}

            <View style={styles.privacyBox}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.primaryContrast} />
              <Text style={styles.privacyText}>
                Your health data is private and only accessible to you. We never share or sell your data.
              </Text>
            </View>

            {/* T&C agreement row */}
            <View style={styles.agreeRow}>
              <TouchableOpacity
                onPress={() => hasOpenedTerms && setAgreed(!agreed)}
                activeOpacity={hasOpenedTerms ? 0.7 : 1}
                disabled={!hasOpenedTerms}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agreed, disabled: !hasOpenedTerms }}
                accessibilityLabel="I agree to the Terms and Conditions"
                accessibilityHint={!hasOpenedTerms ? 'Open the Terms and Conditions link first' : undefined}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={agreed ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={agreed ? colors.primary : colors.textTertiary}
                />
              </TouchableOpacity>
              <Text style={styles.agreeText} maxFontSizeMultiplier={1.3}>
                {'I agree to the '}
              </Text>
              <TouchableOpacity
                onPress={() => { setHasOpenedTerms(true); navigation.navigate('TermsAndConditions'); }}
                accessibilityRole="link"
                accessibilityLabel="Read Terms and Conditions"
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
              >
                <Text style={styles.agreeLink} maxFontSizeMultiplier={1.3}>
                  Terms and Conditions
                </Text>
              </TouchableOpacity>
            </View>
            {!hasOpenedTerms && (
              <View
                style={styles.tcHint}
                accessibilityLiveRegion="polite"
                accessible={true}
                accessibilityLabel="Please read the Terms and Conditions before checking this box."
              >
                <Ionicons name="information-circle-outline" size={13} color={isDark ? '#D4921F' : '#BA7517'} />
                <Text style={[styles.tcHintText, { color: isDark ? '#D4921F' : '#BA7517' }]} maxFontSizeMultiplier={1.3}>
                  Please read the Terms and Conditions before checking this box.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, (!agreed || !hasOpenedTerms || loading) && styles.btnDisabled]}
              onPress={handleRegister}
              disabled={loading || !agreed || !hasOpenedTerms}
              accessibilityRole="button"
              accessibilityLabel="Create your account"
              accessibilityState={{ disabled: loading || !agreed || !hasOpenedTerms, busy: loading }}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={styles.primaryBtnText}>Create Account</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              style={styles.footerLink}
              accessibilityRole="link"
            >
              <Text style={styles.footerLinkText}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function InlineError({ message, colors, styles }) {
  return (
    <View style={styles.inlineError} accessible={true} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={13} color={colors.error} />
      <Text style={[styles.inlineErrorText, { color: colors.error }]} maxFontSizeMultiplier={1.3}>
        {message}
      </Text>
    </View>
  );
}

const makeStyles = (c) => StyleSheet.create({
  safe:  { flex: 1, backgroundColor: c.background },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  backBtn: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, justifyContent: 'center', marginBottom: Spacing.sm },
  headerWrap:     { gap: Spacing.xs },
  screenTitle:    { ...Typography.h1, color: c.textPrimary },
  screenSubtitle: { ...Typography.body, color: c.textSecondary },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.md,
  },
  fieldGroup: { gap: Spacing.xs },
  label:      { ...Typography.label, color: c.textPrimary },
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
  icon:   { marginRight: Spacing.xs },
  input: {
    flex: 1,
    ...Typography.body,
    color: c.textPrimary,
    paddingVertical: Spacing.sm,
  },
  eyeBtn: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: c.errorLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  errorText:       { ...Typography.bodySmall, color: c.error, flex: 1 },
  strengthRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  strengthBars:    { flexDirection: 'row', gap: 4, flex: 1 },
  strengthBar:     { flex: 1, height: 4, borderRadius: 2 },
  strengthText:    { ...Typography.caption, fontWeight: '600', minWidth: 36 },
  checklist:       { gap: 4, marginTop: 6 },
  checkItem:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkLabel:      { ...Typography.caption, flex: 1 },
  inlineError:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  inlineErrorText: { ...Typography.caption, flex: 1 },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: c.primaryLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  privacyText: { ...Typography.bodySmall, color: c.primaryContrast, flex: 1, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled:    { opacity: 0.5 },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MIN_TOUCH,
  },
  agreeText:      { ...Typography.bodySmall, color: c.textSecondary, lineHeight: 20 },
  agreeLink:      { ...Typography.bodySmall, color: c.primary, fontWeight: '600', lineHeight: 20, textDecorationLine: 'underline' },
  tcHint:         { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 6 },
  tcHintText:     { ...Typography.caption, flex: 1, lineHeight: 18 },
  primaryBtnText: { ...Typography.button, color: c.textInverse },
  footer:         { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.xs },
  footerText:     { ...Typography.body, color: c.textSecondary },
  footerLink:     { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: Spacing.xs },
  footerLinkText: { ...Typography.body, color: c.primaryContrast, fontWeight: '600' },
});
