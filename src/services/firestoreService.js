import {
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../../firebase';
import { COLLECTIONS, STORAGE_KEYS } from '../utils/constants';
import { buildGraph, mergeGraphHistory } from './knowledgeGraphEngine';
import { analyzeHealthData, generatePersonalizedRecommendations } from './aiPatternDetection';

// ────────────────────────────────────────────────────────────
// HEALTH LOGS
// ────────────────────────────────────────────────────────────

/**
 * Save a complete check-in. Builds the knowledge graph, runs AI
 * analysis, and writes all three documents to Firestore.
 * Also caches the result locally for offline access.
 */
export const saveCheckIn = async (userId, checkInData) => {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // 1. Save raw health log
  const logRef = await addDoc(collection(db, COLLECTIONS.HEALTH_LOGS), {
    userId,
    date,
    ...checkInData,
    createdAt: serverTimestamp(),
  });

  // 2. Build knowledge graph
  const graph = buildGraph(checkInData, userId, date);

  // 3. Fetch existing graph history and merge
  const graphDocRef = doc(db, COLLECTIONS.KNOWLEDGE_GRAPH, userId);
  let existingGraph = null;
  try {
    const snap = await getDoc(graphDocRef);
    if (snap.exists()) existingGraph = snap.data();
  } catch {
    // Offline — will sync later
  }
  const mergedGraph = mergeGraphHistory(existingGraph, graph);
  await setDoc(graphDocRef, mergedGraph);

  // 4. Load user profile for personalised analysis (non-fatal if unavailable)
  let userProfile = null;
  try {
    const profileSnap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
    if (profileSnap.exists()) userProfile = profileSnap.data();
  } catch {
    // Offline or missing — analysis proceeds without profile context
  }

  // 5. Run AI analysis
  const analysis = analyzeHealthData(checkInData, graph, userProfile);

  // 5b. Generate Gemini-powered personalised recommendations (non-fatal)
  const personalizedRecommendations = await generatePersonalizedRecommendations(
    checkInData.openEndedResponses,
    analysis
  );
  console.log('[Gemini] recommendations result:', JSON.stringify(personalizedRecommendations));

  // 6. Save insights
  const insightRef = await addDoc(collection(db, COLLECTIONS.INSIGHTS), {
    userId,
    date,
    logId: logRef.id,
    ...analysis,
    personalizedRecommendations,
    createdAt: serverTimestamp(),
  });

  const result = {
    userId,           // stored so cache reads can validate ownership
    logId: logRef.id,
    insightId: insightRef.id,
    date,
    checkIn: checkInData,
    analysis: { ...analysis, personalizedRecommendations },
    graph,
  };

  // 7. Cache latest insights locally
  await AsyncStorage.setItem(
    STORAGE_KEYS.CACHED_INSIGHTS,
    JSON.stringify(result)
  );

  return result;
};

/**
 * Sync any pending offline check-ins to Firestore.
 */
export const syncPendingCheckIns = async (userId) => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_CHECKINS);
  if (!raw) return;

  const pending = JSON.parse(raw);
  for (const item of pending) {
    try {
      await saveCheckIn(userId, item);
    } catch {
      // Keep in queue if still offline
      return;
    }
  }
  await AsyncStorage.removeItem(STORAGE_KEYS.PENDING_CHECKINS);
};

/**
 * Queue a check-in for offline submission.
 */
export const queueOfflineCheckIn = async (checkInData) => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_CHECKINS);
  const pending = raw ? JSON.parse(raw) : [];
  pending.push({ ...checkInData, queuedAt: new Date().toISOString() });
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_CHECKINS, JSON.stringify(pending));
};

// ────────────────────────────────────────────────────────────
// INSIGHTS
// ────────────────────────────────────────────────────────────

/**
 * Get the most recent insight for the current user.
 */
export const getLatestInsight = async (userId) => {
  // Try cache first — only use it when it belongs to the requesting user
  const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_INSIGHTS);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.userId === userId && parsed.analysis) {
      // Merge top-level date/id into the analysis object so screens can display them
      return {
        ...parsed.analysis,
        date: parsed.date,
        id: parsed.insightId,
      };
    }
    // Cache belongs to a different user — discard it
    if (parsed.userId !== userId) {
      await AsyncStorage.removeItem(STORAGE_KEYS.CACHED_INSIGHTS);
    }
  }

  // Fallback to Firestore
  const q = query(
    collection(db, COLLECTIONS.INSIGHTS),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};

/**
 * Get insights for the last N days (default 7) for trend chart.
 */
export const getRecentInsights = async (userId, days = 7) => {
  console.log(`[firestoreService] getRecentInsights — collection: "${COLLECTIONS.INSIGHTS}", userId: "${userId}", limit: ${days}`);
  console.log(`[firestoreService] getRecentInsights — query: where('userId','==','${userId}') + orderBy('createdAt','desc') + limit(${days})`);
  try {
    const q = query(
      collection(db, COLLECTIONS.INSIGHTS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(days)
    );
    const snap = await getDocs(q);
    console.log(`[firestoreService] getRecentInsights — docs returned: ${snap.size}, empty: ${snap.empty}`);
    const results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return results.reverse(); // oldest first for chart
  } catch (e) {
    console.error('[firestoreService] getRecentInsights ERROR:', e.message);
    console.error('[firestoreService] getRecentInsights error code:', e.code);
    // If the error message contains a URL, that URL will create the missing index:
    console.error('[firestoreService] getRecentInsights full error:', e);
    throw e;
  }
};

/**
 * Get all health logs for the user (for history view).
 */
export const getHealthLogs = async (userId, limitCount = 14) => {
  console.log(`[firestoreService] getHealthLogs — collection: "${COLLECTIONS.HEALTH_LOGS}", userId: "${userId}", limit: ${limitCount}`);
  console.log(`[firestoreService] getHealthLogs — query: where('userId','==','${userId}') + orderBy('createdAt','desc') + limit(${limitCount})`);
  try {
    const q = query(
      collection(db, COLLECTIONS.HEALTH_LOGS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    console.log(`[firestoreService] getHealthLogs — docs returned: ${snap.size}, empty: ${snap.empty}`);
    if (!snap.empty) {
      // Log the userId field from the first doc so we can compare it to the queried userId
      const firstDoc = snap.docs[0].data();
      console.log(`[firestoreService] getHealthLogs — first doc id: ${snap.docs[0].id}`);
      console.log(`[firestoreService] getHealthLogs — first doc userId field: "${firstDoc.userId}"`);
      console.log(`[firestoreService] getHealthLogs — userId match: ${firstDoc.userId === userId}`);
      console.log(`[firestoreService] getHealthLogs — first doc fields: ${Object.keys(firstDoc).join(', ')}`);
    }
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('[firestoreService] getHealthLogs ERROR:', e.message);
    console.error('[firestoreService] getHealthLogs error code:', e.code);
    // Firestore missing-index errors include an https://console.firebase.google.com/...
    // URL directly in e.message — copy it from the Metro log and open it to auto-create the index.
    console.error('[firestoreService] getHealthLogs full error:', e);
    throw e;
  }
};

// ────────────────────────────────────────────────────────────
// KNOWLEDGE GRAPH
// ────────────────────────────────────────────────────────────

/**
 * Get the user's full knowledge graph document.
 */
export const getKnowledgeGraph = async (userId) => {
  const snap = await getDoc(doc(db, COLLECTIONS.KNOWLEDGE_GRAPH, userId));
  if (!snap.exists()) return null;
  return snap.data();
};

// ────────────────────────────────────────────────────────────
// USER PROFILE
// ────────────────────────────────────────────────────────────

export const getUserProfile = async (userId) => {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

/**
 * Merge an updated displayName into the user's Firestore profile document.
 */
export const updateUserDisplayName = async (userId, displayName) => {
  await setDoc(
    doc(db, COLLECTIONS.USERS, userId),
    { displayName: displayName.trim() },
    { merge: true }
  );
};

/**
 * Permanently delete every Firestore document belonging to the user.
 * Processes in 499-op batches to stay under Firestore's 500-op limit.
 * Order: insights → healthLogs → knowledgeGraph doc → user doc.
 */
export const deleteUserData = async (userId) => {
  const deleteSnap = async (snap) => {
    const CHUNK = 499;
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  // Fetch all docs for this user across both collections simultaneously
  const [insSnap, logsSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.INSIGHTS),    where('userId', '==', userId))),
    getDocs(query(collection(db, COLLECTIONS.HEALTH_LOGS), where('userId', '==', userId))),
  ]);

  await Promise.all([deleteSnap(insSnap), deleteSnap(logsSnap)]);

  // Single-doc deletions: knowledgeGraph and user profile
  const finalBatch = writeBatch(db);
  finalBatch.delete(doc(db, COLLECTIONS.KNOWLEDGE_GRAPH, userId));
  finalBatch.delete(doc(db, COLLECTIONS.USERS, userId));
  await finalBatch.commit();

  // Clear local AsyncStorage cache
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.CACHED_INSIGHTS,
    STORAGE_KEYS.PENDING_CHECKINS,
  ]);
};

/**
 * Get a specific insight by its log date (for detail view).
 */
export const getInsightByDate = async (userId, date) => {
  const q = query(
    collection(db, COLLECTIONS.INSIGHTS),
    where('userId', '==', userId),
    where('date', '==', date),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
};
