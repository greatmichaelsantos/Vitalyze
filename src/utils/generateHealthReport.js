import {
  collection, getDocs, query, where, orderBy, limit, getDoc, doc,
} from 'firebase/firestore';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { db } from '../../firebase';
import { COLLECTIONS } from './constants';
import { sendEmail } from '../services/emailService';

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateWeeklyReport(userId) {
  return _generate(userId, 7);
}

export async function generateMonthlyReport(userId) {
  return _generate(userId, 30);
}

// ─── Core pipeline ────────────────────────────────────────────────────────────

async function _generate(userId, days) {
  // Date range: today back (days-1) so a 7-day report includes today
  const today    = new Date();
  const startDay = new Date(today);
  startDay.setDate(today.getDate() - (days - 1));
  const startStr = startDay.toISOString().split('T')[0]; // "YYYY-MM-DD"
  const endStr   = today.toISOString().split('T')[0];

  // Fetch generously so in-JS date filter covers the whole window
  const fetchLimit = days === 7 ? 30 : 80;

  const [rawLogs, rawInsights, profile] = await Promise.all([
    _fetchDocs(COLLECTIONS.HEALTH_LOGS, userId, fetchLimit),
    _fetchDocs(COLLECTIONS.INSIGHTS,    userId, fetchLimit),
    _fetchProfile(userId),
  ]);

  // Filter to requested date range (date field is "YYYY-MM-DD" — lexicographic compare works)
  const logs     = rawLogs.filter((l) => l.date >= startStr && l.date <= endStr);
  const insights = rawInsights.filter((i) => i.date >= startStr && i.date <= endStr);

  const stats = _computeStats(logs, insights, days);
  const html  = _buildHTML(stats, profile, days, startStr, endStr);

  // Generate PDF file — printToFileAsync writes to the app's cache dir and returns the URI
  const { uri } = await Print.printToFileAsync({ html });

  // Share / save via native share sheet
  await Sharing.shareAsync(uri, {
    mimeType:    'application/pdf',
    UTI:         'com.adobe.pdf',
    dialogTitle: `Mend ${days === 7 ? 'Weekly' : 'Monthly'} Report`,
  });

  // Email the monthly report HTML to the user (fire-and-forget)
  if (days === 30 && profile.email) {
    sendEmail(
      profile.email,
      'Your Monthly Mend Health Report',
      html
    ).catch(() => {});
  }
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function _fetchDocs(collectionName, userId, fetchLimit) {
  const q = query(
    collection(db, collectionName),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(fetchLimit)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function _fetchProfile(userId) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
  return snap.exists() ? snap.data() : {};
}

// ─── Stats computation ────────────────────────────────────────────────────────

function _avg(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function _computeStats(logs, insights, days) {
  // Scores (from AI insight documents)
  const overallScores  = insights.map((i) => i.overallScore).filter((v) => v != null);
  const physicalScores = insights.map((i) => i.physicalScore).filter((v) => v != null);
  const mentalScores   = insights.map((i) => i.mentalScore).filter((v) => v != null);

  // Best and worst scoring days
  let bestDay = null;
  let worstDay = null;
  for (const ins of insights) {
    const s = ins.overallScore ?? 0;
    if (!bestDay  || s > bestDay.score)  bestDay  = { date: ins.date, score: s };
    if (!worstDay || s < worstDay.score) worstDay = { date: ins.date, score: s };
  }
  // Suppress worst when it equals best (only one day logged)
  if (bestDay && worstDay && bestDay.date === worstDay.date) worstDay = null;

  // Check-in streak — count consecutive days from today (or yesterday) backward
  const logDates = new Set(logs.map((l) => l.date));
  const dayStr = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().split('T')[0];
  };
  let streak = 0;
  const startOffset = logDates.has(dayStr(0)) ? 0 : 1; // allow not yet checked in today
  for (let i = startOffset; i <= days; i++) {
    if (logDates.has(dayStr(i))) streak++;
    else break;
  }

  // Most common mood
  const moodCount = {};
  for (const l of logs) {
    if (l.mood != null) moodCount[l.mood] = (moodCount[l.mood] || 0) + 1;
  }
  const topMoodEntry = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
  const MOOD_LABEL = { 1: 'Very Low', 2: 'Low', 3: 'Neutral', 4: 'Good', 5: 'Great' };
  const mostCommonMood = topMoodEntry ? (MOOD_LABEL[topMoodEntry[0]] ?? `Mood ${topMoodEntry[0]}`) : null;

  // Sleep (hours)
  const sleepVals = logs.map((l) => l.sleep).filter((s) => s != null && s > 0);
  const avgSleep  = sleepVals.length
    ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1)
    : null;

  // Hydration (glasses)
  const waterVals = logs.map((l) => l.water).filter((w) => w != null);
  const avgWater  = waterVals.length
    ? (waterVals.reduce((a, b) => a + b, 0) / waterVals.length).toFixed(1)
    : null;

  // Exercise (days with any activity)
  const exerciseDays = logs.filter((l) => l.exercise && l.exercise !== 'none').length;
  const exercisePct  = logs.length > 0 ? Math.round((exerciseDays / logs.length) * 100) : 0;

  // Top patterns (aggregated across all insight documents)
  const patternCount = {};
  for (const ins of insights) {
    const pats = ins.patterns ?? ins.detectedPatterns ?? [];
    for (const p of pats) {
      const key = (typeof p === 'string') ? p : (p.title || p.type || p.name || null);
      if (key) patternCount[key] = (patternCount[key] || 0) + 1;
    }
  }
  const topPatterns = Object.entries(patternCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Risk level breakdown
  const riskCounts = { Low: 0, Medium: 0, High: 0 };
  for (const ins of insights) {
    const r = ins.riskLevel;
    if (r != null && riskCounts[r] !== undefined) riskCounts[r]++;
  }

  // Overall trend: compare first-half scores vs second-half scores
  let trend = 'Stable';
  if (overallScores.length >= 4) {
    const mid    = Math.floor(overallScores.length / 2);
    const first  = _avg(overallScores.slice(0, mid));
    const second = _avg(overallScores.slice(mid));
    if (second - first >= 5)  trend = 'Improving';
    else if (first - second >= 5) trend = 'Declining';
  }

  // Breakdown factors — average points per factor across all insights
  const physBreakMap = {};
  for (const ins of insights) {
    for (const item of ins.physicalBreakdown ?? []) {
      const k = item.factor ?? item.name ?? '';
      if (!k) continue;
      if (!physBreakMap[k]) physBreakMap[k] = { total: 0, count: 0, note: '' };
      physBreakMap[k].total += item.points ?? 0;
      physBreakMap[k].count++;
      if (item.note) physBreakMap[k].note = item.note;
    }
  }
  const mentBreakMap = {};
  for (const ins of insights) {
    for (const item of ins.mentalBreakdown ?? []) {
      const k = item.factor ?? item.name ?? '';
      if (!k) continue;
      if (!mentBreakMap[k]) mentBreakMap[k] = { total: 0, count: 0, note: '' };
      mentBreakMap[k].total += item.points ?? 0;
      mentBreakMap[k].count++;
      if (item.note) mentBreakMap[k].note = item.note;
    }
  }
  const physicalBreakdown = Object.entries(physBreakMap).map(([factor, v]) => ({
    factor, points: Math.round(v.total / v.count), note: v.note,
  }));
  const mentalBreakdown = Object.entries(mentBreakMap).map(([factor, v]) => ({
    factor, points: Math.round(v.total / v.count), note: v.note,
  }));

  return {
    totalCheckIns: logs.length,
    avgOverall:    _avg(overallScores),
    avgPhysical:   _avg(physicalScores),
    avgMental:     _avg(mentalScores),
    bestDay,
    worstDay,
    streak,
    mostCommonMood,
    avgSleep,
    avgWater,
    exerciseDays,
    exercisePct,
    topPatterns,
    riskCounts,
    trend,
    physicalBreakdown,
    mentalBreakdown,
  };
}

// ─── HTML / PDF builder ───────────────────────────────────────────────────────

const PURPLE = '#6C63FF';

function _scoreColor(score) {
  if (score == null) return '#CBD5E1';
  if (score >= 70)   return '#22C55E';
  if (score >= 40)   return '#F59E0B';
  return '#EF4444';
}

function _fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function _scoreInterpretation(score) {
  if (score == null) return '';
  if (score >= 70) return `A score of ${score} means you're in a healthy range. Scores above 70 are considered healthy — great job!`;
  if (score >= 40) return `A score of ${score} means some areas of your health need attention. Scores above 70 are considered healthy.`;
  return `A score of ${score} means you may be struggling in several health areas. Scores above 70 are considered healthy.`;
}

function _closingMessage(score) {
  if (score == null) return null;
  if (score > 70) return "You're doing great this month. Keep up the healthy habits!";
  if (score >= 50) return "You're making progress. Focus on the areas flagged above to improve your score.";
  return "Your scores this month suggest you may be going through a tough time. Please reach out to someone you trust or use the crisis lines below.<br><br><strong>Philippine crisis lines:</strong> Hopeline 8804-4673 &nbsp;|&nbsp; NCMH 1553 &nbsp;|&nbsp; In Touch 0917-800-8654";
}

function _buildHTML(stats, profile, days, startStr, endStr) {
  const reportLabel = days === 7 ? 'Weekly' : 'Monthly';
  // Show display name only if it's meaningful (more than 3 chars)
  const userName    = (profile.displayName && profile.displayName.length > 3)
    ? profile.displayName
    : 'Health Report';
  const dateRange   = `${_fmtDate(startStr)} – ${_fmtDate(endStr)}`;
  const generated   = _fmtDate(new Date().toISOString().split('T')[0]);

  const trendArrow = stats.trend === 'Improving' ? '&#8593;' : stats.trend === 'Declining' ? '&#8595;' : '&#8594;';
  const trendColor = stats.trend === 'Improving' ? '#16a34a' : stats.trend === 'Declining' ? '#dc2626' : '#ca8a04';
  const trendBg    = stats.trend === 'Improving' ? '#dcfce7' : stats.trend === 'Declining' ? '#fee2e2' : '#fef9c3';

  // Score table cells
  const scoreCell = (label, score) => `
    <td style="width:33%;padding:0 6px;text-align:center;vertical-align:top">
      <div style="background:#ffffff;border-radius:10px;padding:18px 10px;border:1px solid #ede9ff">
        <div style="font-size:40px;font-weight:800;line-height:1;color:${_scoreColor(score)}">${score ?? '&mdash;'}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#444444;margin-top:6px">${label}</div>
      </div>
    </td>`;

  // Stat cells — single column, full width per row
  const statCell = (label, value, sub) => `
    <td style="width:100%;padding:0 0 10px;vertical-align:top">
      <div style="background:#ffffff;border-radius:10px;padding:14px 12px;border:1px solid #ede9ff">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#444444">${label}</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-top:4px">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#444444;margin-top:2px">${sub}</div>` : ''}
      </div>
    </td>`;

  // Pattern rows
  const patternRows = stats.topPatterns.length
    ? stats.topPatterns.map((p) => `
        <tr>
          <td style="padding:8px 14px;font-size:13px;color:#374151;font-weight:500;background:#ffffff;border-radius:8px">${p.name}</td>
          <td style="padding:8px 10px;text-align:right;background:#ffffff;border-radius:8px">
            <span style="background:${PURPLE};color:#fff;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:700">${p.count}&times;</span>
          </td>
        </tr>
        <tr><td colspan="2" style="height:6px"></td></tr>`
      ).join('')
    : `<tr><td colspan="2" style="padding:12px;text-align:center;font-size:13px;color:#444444">No patterns detected in this period.</td></tr>`;

  // Best / worst day row
  const dayPills = [
    stats.bestDay  ? `<span style="background:#dcfce7;color:#15803d;border-radius:99px;padding:4px 12px;font-size:12px;font-weight:600;margin-right:8px">&#8593; Best: ${_fmtDate(stats.bestDay.date)} &nbsp;${stats.bestDay.score}</span>` : '',
    stats.worstDay ? `<span style="background:#fee2e2;color:#b91c1c;border-radius:99px;padding:4px 12px;font-size:12px;font-weight:600">&#8595; Lowest: ${_fmtDate(stats.worstDay.date)} &nbsp;${stats.worstDay.score}</span>` : '',
  ].filter(Boolean).join('');

  // Stat data — one per row, single column
  const statData = [
    ['Check-in Streak', `${stats.streak} day${stats.streak !== 1 ? 's' : ''}`, 'consecutive days'],
    ['Total Check-ins', String(stats.totalCheckIns), 'in this period'],
    ['Avg Sleep', stats.avgSleep != null ? `${stats.avgSleep}h` : '&mdash;', 'per night'],
    ['Avg Hydration', stats.avgWater != null ? `${stats.avgWater} glasses` : '&mdash;', 'per day'],
    ['Exercise Days', String(stats.exerciseDays), `${stats.exercisePct}% of check-ins`],
    stats.mostCommonMood ? ['Common Mood', stats.mostCommonMood, 'most frequent'] : null,
  ].filter(Boolean);

  const statRows = statData.map((item) => `
    <tr>
      ${statCell(item[0], item[1], item[2])}
    </tr>`);

  const interpretation = _scoreInterpretation(stats.avgOverall);

  const breakdownSection = (title, items) => {
    if (!items || !items.length) return '';
    const rows = items.map((item) => `
        <tr>
          <td style="padding:9px 0;font-size:13px;color:#374151;font-weight:500;border-bottom:1px solid #ede9ff;">${item.factor}</td>
          <td style="padding:9px 8px;text-align:center;border-bottom:1px solid #ede9ff;">
            <span style="font-size:13px;font-weight:700;color:${item.points >= 0 ? '#16a34a' : '#dc2626'};">${item.points > 0 ? '+' : ''}${item.points}</span>
          </td>
          <td style="padding:9px 0;font-size:12px;color:#6b7280;border-bottom:1px solid #ede9ff;">${item.note || ''}</td>
        </tr>`).join('');
    return `
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:14px">${title}</div>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <th style="padding:6px 0;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Factor</th>
        <th style="padding:6px 8px;text-align:center;font-size:11px;color:#6b7280;font-weight:600;">Points</th>
        <th style="padding:6px 0;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Note</th>
      </tr>
      ${rows}
    </table>
  </div>`;
  };

  const physBreakHtml = breakdownSection('What Affected Your Physical Score', stats.physicalBreakdown);
  const mentBreakHtml = breakdownSection('What Affected Your Mental Score',   stats.mentalBreakdown);

  const closingMsg = _closingMessage(stats.avgOverall);
  const closingHtml = closingMsg ? `
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px;text-align:center;">
    <p style="font-size:14px;color:#374151;margin:0;line-height:1.7;">${closingMsg}</p>
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a2e;font-size:14px">
<div style="max-width:680px;margin:0 auto;padding:28px 24px">

  <!-- ── Header ── -->
  <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #ede9ff;margin-bottom:20px">
    <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:#6C63FF">Mend</div>
    <div style="font-size:16px;font-weight:600;color:#111111;margin-top:3px">${reportLabel} Health Report</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0 16px">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="vertical-align:bottom">
          <div style="font-size:18px;font-weight:700;color:#111111">${userName}</div>
          <div style="font-size:13px;color:#444444;margin-top:2px">${dateRange}</div>
        </td>
        <td style="text-align:right;vertical-align:bottom;font-size:13px;color:#444444">
          ${stats.totalCheckIns} check-in${stats.totalCheckIns !== 1 ? 's' : ''} logged
        </td>
      </tr>
    </table>
  </div>

  <!-- ── Score Summary ── -->
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:14px">Health Score Summary</div>
    <table style="width:100%;border-collapse:collapse;margin:0 -6px">
      <tr>
        ${scoreCell('Overall',  stats.avgOverall)}
        ${scoreCell('Physical', stats.avgPhysical)}
        ${scoreCell('Mental',   stats.avgMental)}
      </tr>
    </table>

    <p style="font-size:13px;color:#555555;margin:12px 0 0;line-height:1.5;">${interpretation}</p>

    <!-- Trend -->
    <div style="display:flex;align-items:center;gap:10px;margin-top:14px;background:${trendBg};border-radius:10px;padding:12px 16px">
      <span style="font-size:20px;font-weight:800;color:${trendColor}">${trendArrow}</span>
      <span style="font-size:15px;font-weight:700;color:${trendColor}">${stats.trend}</span>
      <span style="font-size:11px;color:#555555;margin-left:auto">first half vs. second half of period</span>
    </div>

    ${dayPills ? `<div style="margin-top:12px">${dayPills}</div>` : ''}
  </div>

  <!-- ── Activity & Habits ── -->
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:14px">Activity &amp; Habits</div>
    <table style="width:100%;border-collapse:collapse">
      ${statRows.join('')}
    </table>
  </div>

  ${physBreakHtml}
  ${mentBreakHtml}

  <!-- ── Detected Patterns ── -->
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:6px">Top Detected Patterns</div>
    <p style="font-size:13px;color:#555555;margin:0 0 12px;line-height:1.5;">These are recurring patterns Mend noticed in your check-ins:</p>
    <table style="width:100%;border-collapse:collapse">
      ${patternRows}
    </table>
  </div>

  <!-- ── Risk Level Summary ── -->
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:14px">Self-Harm Risk Summary</div>
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="width:33%;padding:0 5px 0 0">
          <div style="background:#dcfce7;border-radius:10px;padding:16px 10px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#16a34a">${stats.riskCounts.Low}</div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#16a34a;margin-top:4px">Low Risk</div>
          </div>
        </td>
        <td style="width:33%;padding:0 3px">
          <div style="background:#fef9c3;border-radius:10px;padding:16px 10px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#ca8a04">${stats.riskCounts.Medium}</div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#ca8a04;margin-top:4px">Medium Risk</div>
          </div>
        </td>
        <td style="width:33%;padding:0 0 0 5px">
          <div style="background:#fee2e2;border-radius:10px;padding:16px 10px;text-align:center">
            <div style="font-size:32px;font-weight:800;color:#dc2626">${stats.riskCounts.High}</div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#dc2626;margin-top:4px">High Risk</div>
          </div>
        </td>
      </tr>
    </table>
    <div style="font-size:11px;color:#444444;margin-top:10px;text-align:center">Days in each risk category based on your check-in data</div>
  </div>

  ${closingHtml}

  <!-- ── Footer ── -->
  <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;color:#444444">Generated on ${generated} by <span style="color:${PURPLE};font-weight:700">Mend</span></div>
    <div style="font-size:11px;color:#444444;margin-top:4px">This report is generated by Mend. It is not a medical diagnosis.</div>
    <div style="font-size:11px;color:#444444;margin-top:2px">For medical concerns, please consult a qualified healthcare professional.</div>
  </div>

</div>
</body>
</html>`;
}
