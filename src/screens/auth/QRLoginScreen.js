import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { signInWithCustomToken } from 'firebase/auth';
import {
  doc, setDoc, getDoc, updateDoc, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db, auth } from '../../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Typography, Spacing, Radius, MIN_TOUCH } from '../../utils/constants';

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ── Screen ─────────────────────────────────────────────────────────────────

export default function QRLoginScreen({ navigation }) {
  const { user }           = useAuth();
  const { colors, isDark } = useTheme();
  const styles             = useMemo(() => makeStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState(user ? 'generate' : 'scan');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>QR Login</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {['generate', 'scan'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary }]}
            onPress={() => setActiveTab(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primaryContrast : colors.textTertiary, fontWeight: activeTab === tab ? '700' : '500' }]}>
              {tab === 'generate' ? 'Generate QR' : 'Scan QR'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'generate' ? (
        <GeneratePane user={user} colors={colors} styles={styles} />
      ) : (
        <ScanPane colors={colors} styles={styles} navigation={navigation} />
      )}
    </SafeAreaView>
  );
}

// ── Generate Pane ───────────────────────────────────────────────────────────

function GeneratePane({ user, colors, styles }) {
  const [token,       setToken]       = useState(null);
  const [generating,  setGenerating]  = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const [status,      setStatus]      = useState('idle'); // idle | waiting | scanned | expired
  const timerRef = useRef(null);
  const unsubRef = useRef(null);

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const handleGenerate = useCallback(async () => {
    if (!user) return;
    cleanup();
    setGenerating(true);
    setStatus('idle');
    console.log('generating QR token');
    try {
      const t = generateToken();
      const expiresAt = Timestamp.fromDate(new Date(Date.now() + TOKEN_TTL_MS));
      await setDoc(doc(db, 'qrTokens', t), {
        userId:    user.uid,
        email:     user.email,
        expiresAt,
        used:      false,
        createdAt: Timestamp.now(),
      });
      console.log('token saved:', t);
      setToken(t);
      setSecondsLeft(300);
      setStatus('waiting');

      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setStatus('expired');
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      unsubRef.current = onSnapshot(doc(db, 'qrTokens', t), (snap) => {
        if (snap.exists() && snap.data().used === true) {
          cleanup();
          setStatus('scanned');
        }
      });
    } catch (err) {
      console.log('QR generate error:', err);
      setStatus('idle');
    } finally {
      setGenerating(false);
    }
  }, [user, cleanup]);

  if (!user) {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="lock-closed-outline" size={44} color={colors.primaryContrast} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>Sign in first</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>
          You must be logged in to generate a QR code for another device.
        </Text>
      </View>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  if (status === 'scanned') {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="checkmark-circle" size={44} color={colors.primaryContrast} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>QR Scanned!</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>
          You are now signed in!
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleGenerate}
        >
          <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Generate New QR</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'expired') {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.errorLight ?? '#FEE2E2' }]}>
          <Ionicons name="time-outline" size={44} color={colors.error} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>QR Expired</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>
          This QR code has expired. Generate a new one to try again.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={handleGenerate}
        >
          <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Regenerate</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === 'idle') {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="qr-code-outline" size={44} color={colors.primaryContrast} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>Share Your Login</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>
          Generate a QR code to sign in on another device without entering your password.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: generating ? 0.6 : 1 }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating
            ? <ActivityIndicator color={colors.textInverse} />
            : <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Generate QR Code</Text>
          }
        </TouchableOpacity>
      </View>
    );
  }

  // status === 'waiting'
  return (
    <View style={styles.pane}>
      <View style={[styles.qrWrap, { borderColor: colors.border }]}>
        <QRCode value={token} size={200} backgroundColor="#FFFFFF" color="#000000" />
      </View>
      <View style={[styles.timerPill, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name="time-outline" size={14} color={colors.primaryContrast} />
        <Text style={[styles.timerText, { color: colors.primaryContrast }]}>
          Expires in {mm}:{ss}
        </Text>
      </View>
      <View style={styles.waitingRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.waitingText, { color: colors.textSecondary }]}>Waiting for scan…</Text>
      </View>
      <Text style={[styles.hintText, { color: colors.textTertiary }]}>
        Scan this with another device running Mend
      </Text>
      <TouchableOpacity
        style={[styles.outlinedBtn, { borderColor: colors.border }]}
        onPress={() => { cleanup(); setToken(null); setStatus('idle'); }}
      >
        <Text style={[styles.outlinedBtnText, { color: colors.textSecondary }]}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Scan Pane ───────────────────────────────────────────────────────────────

function ScanPane({ colors, styles, navigation }) {
  const { user }     = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,   setScanning]       = useState(true);
  const [scanStatus, setScanStatus]     = useState('idle'); // idle | processing | success | error
  const [message,    setMessage]        = useState('');
  const [email,      setEmail]          = useState('');
  const processingRef = useRef(false);

  // Navigate as soon as Firebase auth state confirms the user is signed in
  useEffect(() => {
    if (user && scanStatus === 'success') {
      navigation.replace('Main');
    }
  }, [user, scanStatus]);

  const handleBarcodeScan = useCallback(async ({ data }) => {
    if (processingRef.current || !scanning) return;
    processingRef.current = true;
    setScanning(false);
    setScanStatus('processing');

    try {
      const tokenRef  = doc(db, 'qrTokens', data);
      const tokenSnap = await getDoc(tokenRef);
      console.log('getDoc done — exists:', tokenSnap.exists());

      if (!tokenSnap.exists()) {
        setMessage('Invalid QR code. This token does not exist.');
        setScanStatus('error');
        return;
      }

      const tokenData = tokenSnap.data();

      if (tokenData.used) {
        setMessage('This QR code has already been used.');
        setScanStatus('error');
        return;
      }

      if (new Date() > tokenData.expiresAt.toDate()) {
        setMessage('This QR code has expired. Ask for a new one.');
        setScanStatus('error');
        return;
      }

      await updateDoc(tokenRef, { used: true, usedAt: Timestamp.now() });
      console.log('updateDoc done — token marked used');

      const userId = tokenData.userId;
      console.log('fetching worker for uid:', userId);

      const workerRes = await fetch('https://vitalyze-auth.greatmichaelsantos15.workers.dev', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid: userId }),
      });
      console.log('worker response status:', workerRes.status);

      if (!workerRes.ok) {
        const errBody = await workerRes.text().catch(() => '(unreadable)');
        console.log('worker error body:', errBody);
        throw new Error(`Worker responded ${workerRes.status}: ${errBody}`);
      }

      const workerJson = await workerRes.json();
      console.log('worker response body:', JSON.stringify(workerJson));
      const { customToken } = workerJson;

      if (!customToken) {
        throw new Error('Worker returned no customToken');
      }

      console.log('customToken received, length:', customToken.length);

      await signInWithCustomToken(auth, customToken);
      console.log('signInWithCustomToken done');

      setScanStatus('success');
      setTimeout(() => navigation.replace('Main'), 1500);
    } catch (err) {
      console.log('QR scan error:', err);
      console.log('QR scan error message:', err.message);
      console.log('QR scan error code:', err.code);
      setMessage(`Scan failed: ${err.message || 'Unknown error'}`);
      setScanStatus('error');
    } finally {
      processingRef.current = false;
    }
  }, [scanning]);

  const reset = useCallback(() => {
    setScanStatus('idle');
    setMessage('');
    setEmail('');
    setScanning(true);
    processingRef.current = false;
  }, []);

  // ── Permission not yet resolved
  if (!permission) {
    return (
      <View style={styles.pane}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // ── Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="camera-outline" size={44} color={colors.primaryContrast} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>Camera Access Needed</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>
          Allow camera access so you can scan QR codes to log in.
        </Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={requestPermission}
        >
          <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Success
  if (scanStatus === 'success') {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="checkmark-circle-outline" size={44} color={colors.primaryContrast} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>Signed In!</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>
          You've been signed in successfully. Taking you to the app…
        </Text>
      </View>
    );
  }

  // ── Error
  if (scanStatus === 'error') {
    return (
      <View style={styles.pane}>
        <View style={[styles.iconCircle, { backgroundColor: colors.errorLight ?? '#FEE2E2' }]}>
          <Ionicons name="close-circle" size={44} color={colors.error} />
        </View>
        <Text style={[styles.paneTitle, { color: colors.textPrimary }]}>Scan Failed</Text>
        <Text style={[styles.paneBody, { color: colors.textSecondary }]}>{message}</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={reset}
        >
          <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera (idle + processing)
  return (
    <View style={styles.cameraPane}>
      {scanStatus === 'processing' ? (
        <View style={[styles.processingOverlay, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.processingText, { color: colors.textPrimary }]}>Validating code…</Text>
        </View>
      ) : (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={handleBarcodeScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        >
          <View style={styles.scanOverlay}>
            {/* Dim sides */}
            <View style={styles.scanDimRow}>
              <View style={styles.scanDim} />
              <View style={styles.scanWindow} />
              <View style={styles.scanDim} />
            </View>

            {/* Corner markers */}
            <View style={styles.scanFrameWrap}>
              <View style={[styles.cornerTL, { borderColor: colors.primary }]} />
              <View style={[styles.cornerTR, { borderColor: colors.primary }]} />
              <View style={[styles.cornerBL, { borderColor: colors.primary }]} />
              <View style={[styles.cornerBR, { borderColor: colors.primary }]} />
            </View>

            <Text style={styles.scanHint}>Point camera at a Mend QR code</Text>
          </View>
        </CameraView>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const SCAN_WINDOW = 220;
const CORNER_SIZE = 32;

const makeStyles = (c) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },

  header: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    borderBottomWidth: 1,
  },
  backBtn:     { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { ...Typography.body },

  // Shared pane layout
  pane: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  iconCircle: {
    width: 80, height: 80,
    borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  paneTitle: { ...Typography.h2, textAlign: 'center' },
  paneBody:  { ...Typography.body, textAlign: 'center', lineHeight: 22 },

  // Generate — waiting state
  qrWrap: {
    padding: 20,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.xs,
    borderRadius: Radius.full,
  },
  timerText:  { ...Typography.bodySmall, fontWeight: '700' },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  waitingText: { ...Typography.body },
  hintText:   { ...Typography.bodySmall, textAlign: 'center' },

  // Buttons
  primaryBtn: {
    borderRadius: Radius.full,
    height: 52,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 220,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  primaryBtnText: { ...Typography.button },
  outlinedBtn: {
    borderWidth: 1,
    borderRadius: Radius.full,
    height: 52,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 220,
  },
  outlinedBtnText: { ...Typography.button },

  // Camera / Scan pane
  cameraPane:       { flex: 1, overflow: 'hidden' },
  processingOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md,
  },
  processingText: { ...Typography.body },
  scanOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanDimRow: {
    flexDirection: 'row',
    width: SCAN_WINDOW,
    height: SCAN_WINDOW,
  },
  scanDim:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanWindow: { width: SCAN_WINDOW, height: SCAN_WINDOW },
  scanFrameWrap: {
    position: 'absolute',
    width:    SCAN_WINDOW,
    height:   SCAN_WINDOW,
  },
  cornerTL: {
    position: 'absolute', top: 0, left: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: 3, borderLeftWidth: 3, borderRadius: 2,
  },
  cornerTR: {
    position: 'absolute', top: 0, right: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: 3, borderRightWidth: 3, borderRadius: 2,
  },
  cornerBL: {
    position: 'absolute', bottom: 0, left: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: 3, borderLeftWidth: 3, borderRadius: 2,
  },
  cornerBR: {
    position: 'absolute', bottom: 0, right: 0,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: 3, borderRightWidth: 3, borderRadius: 2,
  },
  scanHint: {
    ...Typography.bodySmall,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: Spacing.xl,
    textShadowColor:  'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
