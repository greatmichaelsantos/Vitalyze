import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, StatusBar,
  ActivityIndicator, SafeAreaView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../firebase';
import { login, getFriendlyAuthError } from '../../services/authService';
import { sendEmail } from '../../services/emailService';
import { useTheme } from '../../context/ThemeContext';
import { useAccessibility } from '../../context/AccessibilityContext';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';

const gcLogo  = require('../../assets/gc-logo.png');
const ccsLogo = require('../../assets/ccs-logo.png');

export default function LoginScreen({ navigation }) {
  const { colors, isDark }     = useTheme();
  const { fontSizeMultiplier } = useAccessibility();
  const styles = useMemo(() => makeStyles(colors, fontSizeMultiplier), [colors, fontSizeMultiplier]);

  const [email,       setEmail]      = useState('');
  const [password,    setPassword]   = useState('');
  const [passDisplay, setPassDisplay] = useState('');
  const [showPass,    setShowPass]   = useState(false);
  const [loading,     setLoading]    = useState(false);
  const [error,       setError]      = useState('');
  const [resetMsg,    setResetMsg]   = useState('');
  const [resetErr,    setResetErr]   = useState('');
  const passTimer = useRef(null);

  useEffect(() => () => { clearTimeout(passTimer.current); }, []);

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
    setError('');
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

  const validate = () => {
    if (!email.trim())        return 'Please enter your email address.';
    if (!password)            return 'Please enter your password.';
    if (password.length < 6)  return 'Password must be at least 6 characters.';
    return null;
  };

  const handleForgotPassword = async () => {
    setResetMsg('');
    setResetErr('');
    if (!email.trim()) {
      setResetErr('Please enter your email address first.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim() + '@gordoncollege.edu.ph');
      setResetMsg('Password reset email sent. Check your inbox.');
    } catch {
      setResetErr('Failed to send reset email. Please try again.');
    }
  };

  const handleLogin = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setResetMsg('');
    setResetErr('');
    setLoading(true);
    try {
      await login(email.trim() + '@gordoncollege.edu.ph', password);
      const u = auth.currentUser;
      if (u?.email) {
        const name = u.displayName || u.email.split('@')[0];
        const when = new Date().toLocaleString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
        });
        sendEmail(
          u.email,
          'New login to your Mend account',
          `<p>Hi ${name},</p><p>You just logged in to Mend on ${when}. If this wasn't you, please change your password immediately.</p>`
        ).catch(() => {});
      }
    } catch (e) {
      setError(getFriendlyAuthError(e.code));
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
          {/* Brand */}
          <View style={styles.brandWrap}>
            <Image
              source={require('../../assets/icon.png')}
              style={{ width: 80, height: 80 }}
              accessible={true}
              accessibilityRole="image"
              accessibilityLabel="Mend app logo"
            />
            <Text style={styles.appName} accessibilityRole="header">Mend</Text>
            <Text style={styles.tagline} maxFontSizeMultiplier={1.5}>AI-driven health monitoring</Text>
            <View style={styles.instLogoRow}>
              <View style={[styles.instLogoClip, isDark && { backgroundColor: 'white' }]}>
                <Image source={gcLogo}  style={styles.instLogo} resizeMode="contain" />
              </View>
              <View style={[styles.instLogoClip, isDark && { backgroundColor: 'white' }]}>
                <Image source={ccsLogo} style={styles.instLogo} resizeMode="contain" />
              </View>
            </View>
            <Text style={[styles.instText, { color: colors.textSecondary }]}>
              Gordon College • College of Computer Studies
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSubtitle}>Welcome back. Enter your credentials to continue.</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>GC ID Number</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="2021-00123"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(''); }}
                  keyboardType="numeric"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="none"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textTertiary}
                  value={passDisplay}
                  onChangeText={handlePassChange}
                  secureTextEntry={false}
                  selection={!showPass ? { start: passDisplay.length, end: passDisplay.length } : undefined}
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your account password"
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
                  <Ionicons
                    name={showPass ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.forgotWrap}
              onPress={handleForgotPassword}
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {resetErr ? (
              <View
                style={styles.resetMsgBox}
                accessible={true}
                accessibilityLiveRegion="polite"
                accessibilityLabel={resetErr}
              >
                <Ionicons name="alert-circle-outline" size={14} color={colors.error} />
                <Text style={[styles.resetMsgText, { color: colors.error }]} maxFontSizeMultiplier={1.5}>{resetErr}</Text>
              </View>
            ) : null}

            {resetMsg ? (
              <View
                style={styles.resetMsgBox}
                accessible={true}
                accessibilityLiveRegion="polite"
                accessibilityLabel={resetMsg}
              >
                <Ionicons name="checkmark-circle-outline" size={14} color={colors.success} />
                <Text style={[styles.resetMsgText, { color: colors.success }]} maxFontSizeMultiplier={1.5}>{resetMsg}</Text>
              </View>
            ) : null}

            {error ? (
              <View
                style={styles.errorBox}
                accessible={true}
                accessibilityLiveRegion="polite"
                accessibilityLabel={error}
              >
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorText} maxFontSizeMultiplier={1.5}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in to your account"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading
                ? <ActivityIndicator color={colors.textInverse} />
                : <Text style={styles.primaryBtnText}>Sign In</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.qrBtn}
              onPress={() => navigation.navigate('QRLogin')}
              accessibilityRole="button"
              accessibilityLabel="Login with QR Code"
            >
              <Ionicons name="qr-code-outline" size={18} color={colors.primary} />
              <Text style={styles.qrBtnText}>Login with QR Code</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              style={styles.footerLink}
              accessibilityRole="link"
            >
              <Text style={styles.footerLinkText}>Create one</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c, f) => StyleSheet.create({
  safe:  { flex: 1, backgroundColor: c.background },
  flex:  { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
    gap: Spacing.xl,
  },
  brandWrap:  { alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.lg },
  instLogoRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  instLogoClip: { width: 50, height: 50, borderRadius: 25, overflow: 'hidden', marginHorizontal: 8 },
  instLogo:     { width: 50, height: 50 },
  instText:    { fontSize: 11, textAlign: 'center' },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: c.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  appName:  { ...Typography.h1, color: c.primaryContrast },
  tagline:  { ...Typography.bodySmall, color: c.textSecondary },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
    gap: Spacing.md,
  },
  cardTitle:    { ...Typography.h2, color: c.textPrimary },
  cardSubtitle: { ...Typography.bodySmall, color: c.textSecondary, marginTop: -Spacing.sm },
  fieldGroup:   { gap: Spacing.xs },
  label:        { ...Typography.label, color: c.textPrimary },
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
  inputIcon: { marginRight: Spacing.xs },
  input: {
    flex: 1,
    ...Typography.body,
    color: c.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    outlineStyle: 'none',
    outlineWidth: 0,
  },
  eyeBtn: {
    padding: Spacing.xs,
    minWidth: MIN_TOUCH, minHeight: MIN_TOUCH,
    alignItems: 'center', justifyContent: 'center',
  },
  forgotWrap: { alignSelf: 'flex-end', minHeight: MIN_TOUCH, justifyContent: 'center' },
  forgotText: { fontSize: 13 * f, color: c.primary },
  resetMsgBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  resetMsgText: { ...Typography.caption, flex: 1 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: c.errorLight,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
  },
  errorText:      { ...Typography.bodySmall, color: c.error, flex: 1, lineHeight: 20 },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: Radius.full,
    height: 52,
    alignItems: 'center', justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  btnDisabled:    { opacity: 0.7 },
  primaryBtnText: { ...Typography.button, color: c.textInverse },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: c.primary,
    borderRadius: Radius.full,
    height: 52,
    marginTop: Spacing.xs,
  },
  qrBtnText: { ...Typography.button, color: c.primaryContrast },
  footer: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: Spacing.xs,
  },
  footerText:     { ...Typography.body, color: c.textSecondary },
  footerLink:     { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: Spacing.xs },
  footerLinkText: { ...Typography.body, color: c.primaryContrast, fontWeight: '600' },
});
