/**
 * scripts/testEmails.js
 *
 * Sends one test email per type to greatmichaelsantos15@gmail.com.
 * Monthly report fetches REAL Firestore data for the supplied Firebase UID.
 *
 * Usage:
 *   node scripts/testEmails.js <firebase-uid>
 *   TEST_UID=abc123 node scripts/testEmails.js
 *
 * Setup (service account — only needed for the monthly report):
 *   Option A — env var:  FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
 *   Option B — file:     scripts/service-account.json  (copy from Cloudflare secret)
 *
 * Find your UID: Firebase Console → Authentication → Users → copy the User UID column.
 *
 * Note: generateMonthlyReport() in src/utils/generateHealthReport.js cannot run in
 * Node — it depends on expo-print, expo-sharing, and the React Native Firebase SDK.
 * This script ports the pure-JS stats + HTML logic and replaces Firebase SDK calls
 * with the Firestore REST API (same approach as the Cloudflare Worker).
 */

'use strict';

const { readFileSync } = require('fs');
const { createSign }   = require('crypto');
const path             = require('path');

const WORKER_URL        = 'https://vitalyze-auth.greatmichaelsantos15.workers.dev/send-email';
const TO                = 'greatmichaelsantos15@gmail.com';
const FIRESTORE_PROJECT = 'vitalyze-c5a0b';
const FIRESTORE_BASE    = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;
const PURPLE            = '#6C63FF';

// ── Config ────────────────────────────────────────────────────────────────────

const UID = process.argv[2] || process.env.TEST_UID;
if (!UID) {
  console.error(
    '❌  Firebase UID required.\n' +
    '    Pass as first arg:  node scripts/testEmails.js <uid>\n' +
    '    Or set env var:     TEST_UID=<uid> node scripts/testEmails.js'
  );
  process.exit(1);
}

let SA = null;
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ||
    readFileSync(path.join(__dirname, 'service-account.json'), 'utf8');
  SA = JSON.parse(raw);
} catch {
  // SA stays null — we'll warn when the report step runs
}

// ── Email sender ──────────────────────────────────────────────────────────────

async function send(label, subject, html) {
  try {
    const res = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to: TO, subject, html }),
    });
    if (res.ok) {
      console.log(`✅ ${label} sent`);
    } else {
      const body = await res.text().catch(() => String(res.status));
      console.log(`❌ ${label} failed — ${res.status}: ${body}`);
    }
  } catch (e) {
    console.log(`❌ ${label} failed — ${e.message}`);
  }
}

// ── Firestore REST helpers ────────────────────────────────────────────────────

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

async function getAccessToken() {
  const now     = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss:   SA.client_email,
    sub:   SA.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat:   now,
    exp:   now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const sig = sign.sign(SA.private_key).toString('base64url');
  const jwt = `${signingInput}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function fsVal(field) {
  if (!field) return null;
  if ('stringValue'    in field) return field.stringValue;
  if ('integerValue'   in field) return Number(field.integerValue);
  if ('doubleValue'    in field) return field.doubleValue;
  if ('booleanValue'   in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('arrayValue'     in field) return (field.arrayValue.values || []).map(fsVal);
  if ('mapValue'       in field) return fsDocToObj(field.mapValue.fields || {});
  return null;
}

function fsDocToObj(fields) {
  const obj = {};
  for (const [k, v] of Object.entries(fields || {})) obj[k] = fsVal(v);
  return obj;
}

async function fetchProfile(uid, token) {
  const res = await fetch(`${FIRESTORE_BASE}/users/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return {};
  const doc = await res.json();
  return fsDocToObj(doc.fields || {});
}

async function fetchCollection(collectionId, uid, fetchLimit, token) {
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      structuredQuery: {
        from:    [{ collectionId }],
        where:   {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op:    'EQUAL',
            value: { stringValue: uid },
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   fetchLimit,
      },
    }),
  });
  if (!res.ok) return [];
  const results = await res.json();
  return results
    .filter(r => r.document)
    .map(r => ({ id: r.document.name.split('/').pop(), ...fsDocToObj(r.document.fields || {}) }));
}

// ── Stats computation (ported from src/utils/generateHealthReport.js) ─────────

function avg(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function computeStats(logs, insights, days) {
  const overallScores  = insights.map(i => i.overallScore).filter(v => v != null);
  const physicalScores = insights.map(i => i.physicalScore).filter(v => v != null);
  const mentalScores   = insights.map(i => i.mentalScore).filter(v => v != null);

  let bestDay = null, worstDay = null;
  for (const ins of insights) {
    const s = ins.overallScore ?? 0;
    if (!bestDay  || s > bestDay.score)  bestDay  = { date: ins.date, score: s };
    if (!worstDay || s < worstDay.score) worstDay = { date: ins.date, score: s };
  }
  if (bestDay && worstDay && bestDay.date === worstDay.date) worstDay = null;

  const logDates = new Set(logs.map(l => l.date));
  const dayStr = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toISOString().split('T')[0];
  };
  let streak = 0;
  const startOffset = logDates.has(dayStr(0)) ? 0 : 1;
  for (let i = startOffset; i <= days; i++) {
    if (logDates.has(dayStr(i))) streak++;
    else break;
  }

  const moodCount = {};
  for (const l of logs) {
    if (l.mood != null) moodCount[l.mood] = (moodCount[l.mood] || 0) + 1;
  }
  const topMoodEntry = Object.entries(moodCount).sort((a, b) => b[1] - a[1])[0];
  const MOOD_LABEL = { 1: 'Very Low', 2: 'Low', 3: 'Neutral', 4: 'Good', 5: 'Great' };
  const mostCommonMood = topMoodEntry ? (MOOD_LABEL[topMoodEntry[0]] ?? `Mood ${topMoodEntry[0]}`) : null;

  const sleepVals = logs.map(l => l.sleep).filter(s => s != null && s > 0);
  const avgSleep  = sleepVals.length
    ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1) : null;

  const waterVals = logs.map(l => l.water).filter(w => w != null);
  const avgWater  = waterVals.length
    ? (waterVals.reduce((a, b) => a + b, 0) / waterVals.length).toFixed(1) : null;

  const exerciseDays = logs.filter(l => l.exercise && l.exercise !== 'none').length;
  const exercisePct  = logs.length > 0 ? Math.round((exerciseDays / logs.length) * 100) : 0;

  const patternCount = {};
  for (const ins of insights) {
    const pats = ins.patterns ?? ins.detectedPatterns ?? [];
    for (const p of Array.isArray(pats) ? pats : []) {
      const key = typeof p === 'string' ? p : (p.title || p.type || p.name || null);
      if (key) patternCount[key] = (patternCount[key] || 0) + 1;
    }
  }
  const topPatterns = Object.entries(patternCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const riskCounts = { Low: 0, Medium: 0, High: 0 };
  for (const ins of insights) {
    const r = ins.riskLevel;
    if (r != null && riskCounts[r] !== undefined) riskCounts[r]++;
  }

  let trend = 'Stable';
  if (overallScores.length >= 4) {
    const mid    = Math.floor(overallScores.length / 2);
    const first  = avg(overallScores.slice(0, mid));
    const second = avg(overallScores.slice(mid));
    if (second - first >= 5)      trend = 'Improving';
    else if (first - second >= 5) trend = 'Declining';
  }

  const aggBreak = (field) => {
    const map = {};
    for (const ins of insights) {
      const items = Array.isArray(ins[field]) ? ins[field] : [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const k = item.factor ?? item.name ?? '';
        if (!k) continue;
        if (!map[k]) map[k] = { total: 0, count: 0, note: '' };
        map[k].total += item.points ?? 0;
        map[k].count++;
        if (item.note) map[k].note = item.note;
      }
    }
    return Object.entries(map).map(([factor, v]) => ({
      factor, points: Math.round(v.total / v.count), note: v.note,
    }));
  };

  return {
    totalCheckIns: logs.length,
    avgOverall:    avg(overallScores),
    avgPhysical:   avg(physicalScores),
    avgMental:     avg(mentalScores),
    bestDay, worstDay, streak, mostCommonMood,
    avgSleep, avgWater, exerciseDays, exercisePct,
    topPatterns, riskCounts, trend,
    physicalBreakdown: aggBreak('physicalBreakdown'),
    mentalBreakdown:   aggBreak('mentalBreakdown'),
  };
}

// ── HTML builder (ported from src/utils/generateHealthReport.js) ──────────────

function scoreColor(score) {
  if (score == null) return '#CBD5E1';
  if (score >= 70)   return '#22C55E';
  if (score >= 40)   return '#F59E0B';
  return '#EF4444';
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

function scoreInterpretation(score) {
  if (score == null) return '';
  if (score >= 70) return `A score of ${score} means you're in a healthy range. Scores above 70 are considered healthy — great job!`;
  if (score >= 40) return `A score of ${score} means some areas of your health need attention. Scores above 70 are considered healthy.`;
  return `A score of ${score} means you may be struggling in several health areas. Scores above 70 are considered healthy.`;
}

function closingMessage(score) {
  if (score == null) return null;
  if (score > 70)  return "You're doing great this month. Keep up the healthy habits!";
  if (score >= 50) return "You're making progress. Focus on the areas flagged above to improve your score.";
  return "Your scores this month suggest you may be going through a tough time. Please reach out to someone you trust or use the crisis lines below.<br><br><strong>Philippine crisis lines:</strong> Hopeline 8804-4673 &nbsp;|&nbsp; NCMH 1553 &nbsp;|&nbsp; In Touch 0917-800-8654";
}

function buildReportHTML(stats, profile, days, startStr, endStr) {
  const reportLabel = days === 7 ? 'Weekly' : 'Monthly';
  const userName    = (profile.displayName && profile.displayName.length > 3)
    ? profile.displayName : 'Health Report';
  const dateRange   = `${fmtDate(startStr)} – ${fmtDate(endStr)}`;
  const generated   = fmtDate(new Date().toISOString().split('T')[0]);

  const trendArrow = stats.trend === 'Improving' ? '&#8593;' : stats.trend === 'Declining' ? '&#8595;' : '&#8594;';
  const trendColor = stats.trend === 'Improving' ? '#16a34a' : stats.trend === 'Declining' ? '#dc2626' : '#ca8a04';
  const trendBg    = stats.trend === 'Improving' ? '#dcfce7' : stats.trend === 'Declining' ? '#fee2e2' : '#fef9c3';

  const scoreCell = (label, score) => `
    <td style="width:33%;padding:0 6px;text-align:center;vertical-align:top">
      <div style="background:#ffffff;border-radius:10px;padding:18px 10px;border:1px solid #ede9ff">
        <div style="font-size:40px;font-weight:800;line-height:1;color:${scoreColor(score)}">${score ?? '&mdash;'}</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#444444;margin-top:6px">${label}</div>
      </div>
    </td>`;

  const statCell = (label, value, sub) => `
    <td style="width:100%;padding:0 0 10px;vertical-align:top">
      <div style="background:#ffffff;border-radius:10px;padding:14px 12px;border:1px solid #ede9ff">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:#444444">${label}</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-top:4px">${value}</div>
        ${sub ? `<div style="font-size:11px;color:#444444;margin-top:2px">${sub}</div>` : ''}
      </div>
    </td>`;

  const patternRows = stats.topPatterns.length
    ? stats.topPatterns.map(p => `
        <tr>
          <td style="padding:8px 14px;font-size:13px;color:#374151;font-weight:500;background:#ffffff;border-radius:8px">${p.name}</td>
          <td style="padding:8px 10px;text-align:right;background:#ffffff;border-radius:8px">
            <span style="background:${PURPLE};color:#fff;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:700">${p.count}&times;</span>
          </td>
        </tr>
        <tr><td colspan="2" style="height:6px"></td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:12px;text-align:center;font-size:13px;color:#444444">No patterns detected in this period.</td></tr>`;

  const dayPills = [
    stats.bestDay  ? `<span style="background:#dcfce7;color:#15803d;border-radius:99px;padding:4px 12px;font-size:12px;font-weight:600;margin-right:8px">&#8593; Best: ${fmtDate(stats.bestDay.date)} &nbsp;${stats.bestDay.score}</span>` : '',
    stats.worstDay ? `<span style="background:#fee2e2;color:#b91c1c;border-radius:99px;padding:4px 12px;font-size:12px;font-weight:600">&#8595; Lowest: ${fmtDate(stats.worstDay.date)} &nbsp;${stats.worstDay.score}</span>` : '',
  ].filter(Boolean).join('');

  const statData = [
    ['Check-in Streak',  `${stats.streak} day${stats.streak !== 1 ? 's' : ''}`, 'consecutive days'],
    ['Total Check-ins',  String(stats.totalCheckIns), 'in this period'],
    ['Avg Sleep',        stats.avgSleep  != null ? `${stats.avgSleep}h`       : '&mdash;', 'per night'],
    ['Avg Hydration',    stats.avgWater  != null ? `${stats.avgWater} glasses` : '&mdash;', 'per day'],
    ['Exercise Days',    String(stats.exerciseDays), `${stats.exercisePct}% of check-ins`],
    stats.mostCommonMood ? ['Common Mood', stats.mostCommonMood, 'most frequent'] : null,
  ].filter(Boolean);

  const statRows = statData.map(item => `<tr>${statCell(item[0], item[1], item[2])}</tr>`).join('');

  const breakdownSection = (title, items) => {
    if (!items || !items.length) return '';
    const rows = items.map(item => `
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

  const closingMsg  = closingMessage(stats.avgOverall);
  const closingHtml = closingMsg ? `
  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px;text-align:center;">
    <p style="font-size:14px;color:#374151;margin:0;line-height:1.7;">${closingMsg}</p>
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a2e;font-size:14px">
<div style="max-width:680px;margin:0 auto;padding:28px 24px">

  <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #ede9ff;margin-bottom:20px">
    <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;color:${PURPLE}">Mend</div>
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

  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:14px">Health Score Summary</div>
    <table style="width:100%;border-collapse:collapse;margin:0 -6px">
      <tr>
        ${scoreCell('Overall',  stats.avgOverall)}
        ${scoreCell('Physical', stats.avgPhysical)}
        ${scoreCell('Mental',   stats.avgMental)}
      </tr>
    </table>
    <p style="font-size:13px;color:#555555;margin:12px 0 0;line-height:1.5;">${scoreInterpretation(stats.avgOverall)}</p>
    <div style="display:flex;align-items:center;gap:10px;margin-top:14px;background:${trendBg};border-radius:10px;padding:12px 16px">
      <span style="font-size:20px;font-weight:800;color:${trendColor}">${trendArrow}</span>
      <span style="font-size:15px;font-weight:700;color:${trendColor}">${stats.trend}</span>
      <span style="font-size:11px;color:#555555;margin-left:auto">first half vs. second half of period</span>
    </div>
    ${dayPills ? `<div style="margin-top:12px">${dayPills}</div>` : ''}
  </div>

  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:14px">Activity &amp; Habits</div>
    <table style="width:100%;border-collapse:collapse">${statRows}</table>
  </div>

  ${physBreakHtml}
  ${mentBreakHtml}

  <div style="background:#f5f4ff;border-radius:14px;padding:20px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${PURPLE};margin-bottom:6px">Top Detected Patterns</div>
    <p style="font-size:13px;color:#555555;margin:0 0 12px;line-height:1.5;">These are recurring patterns Mend noticed in your check-ins:</p>
    <table style="width:100%;border-collapse:collapse">${patternRows}</table>
  </div>

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

  <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;color:#444444">Generated on ${generated} by <span style="color:${PURPLE};font-weight:700">Mend</span></div>
    <div style="font-size:11px;color:#444444;margin-top:4px">This report is generated by Mend. It is not a medical diagnosis.</div>
    <div style="font-size:11px;color:#444444;margin-top:2px">For medical concerns, please consult a qualified healthcare professional.</div>
  </div>

</div>
</body>
</html>`;
}

// ── Static email templates ────────────────────────────────────────────────────

const loginHtml = `
<p>Hi Great Michael,</p>
<p>You just logged in to Mend on May 13, 2026 at 8:00 PM GMT+8.
If this wasn't you, please change your password immediately.</p>`;

const threeDayHtml = `
<p>Hi Great Michael,</p>
<p>It's been 3 days since your last Mend check-in. Your health insights work best with
regular check-ins. Take 2 minutes today to log how you're feeling.</p>`;

const fiveDayHtml = `
<p>Hi Great Michael,</p>
<p>It's been 5 days since your last check-in. Consistent check-ins help Mend detect
patterns and keep you on track. Come back today!</p>`;

const sevenDayHtml = `
<p>Hi Great Michael,</p>
<p>It's been a week since your last Mend check-in. We're concerned about your wellness.
Please take a moment to check in or reach out to someone you trust if you're struggling.</p>
<p>Philippine crisis lines: Hopeline 8804-4673 | NCMH 1553 | In Touch 0917-800-8654</p>`;

const fakeDays = [
  { date: '2026-05-07', overallScore: 25, physicalScore: 28, mentalScore: 22 },
  { date: '2026-05-08', overallScore: 22, physicalScore: 24, mentalScore: 20 },
  { date: '2026-05-09', overallScore: 28, physicalScore: 30, mentalScore: 26 },
  { date: '2026-05-10', overallScore: 20, physicalScore: 22, mentalScore: 18 },
  { date: '2026-05-11', overallScore: 27, physicalScore: 29, mentalScore: 25 },
  { date: '2026-05-12', overallScore: 15, physicalScore: 18, mentalScore: 12 },
  { date: '2026-05-13', overallScore: 18, physicalScore: 20, mentalScore: 16 },
];

const ecScoreRows = fakeDays.map(c =>
  `<tr>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;">${c.date}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;color:#e53e3e;font-weight:600;">${c.overallScore}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${c.physicalScore}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${c.mentalScore}</td>
  </tr>`
).join('');

const emergencyHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <tr><td style="background:#8B7FFF;padding:28px 32px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Mend</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Health Monitoring</div>
        </td></tr>

        <tr><td style="background:#fff3cd;border-left:4px solid #f59e0b;padding:16px 32px;">
          <div style="font-size:15px;font-weight:600;color:#92400e;">⚠️ Wellness Alert for Great Michael</div>
          <div style="font-size:13px;color:#92400e;margin-top:4px;">This person's health scores have been critically low for the past week.</div>
        </td></tr>

        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a202c;">Hi Test Contact,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.6;">
            You are listed as the emergency contact for <strong>Great Michael</strong> on Mend, a personal health monitoring app.
            We're reaching out because their recorded health scores over the past 7 days have been critically low, and we want to make sure they're okay.
          </p>

          <div style="font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Weekly Health Scores</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr style="background:#f7f8fa;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;font-weight:600;">Date</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;font-weight:600;">Overall</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;font-weight:600;">Physical</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;font-weight:600;">Mental</th>
            </tr>
            ${ecScoreRows}
          </table>

          <div style="background:#f0f4ff;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:14px;font-weight:600;color:#3730a3;margin-bottom:8px;">What do these numbers mean?</div>
            <p style="font-size:13px;color:#3730a3;line-height:1.7;margin:0;">
              Mend gives each person a daily score from <strong>0 to 100</strong> based on how they answered questions about their mood, sleep, energy, stress, and emotional wellbeing.<br><br>
              <strong>70–100</strong> = Healthy and doing well<br>
              <strong>40–69</strong> = Some areas need attention<br>
              <strong>0–39</strong> = Struggling — support is recommended<br><br>
              <strong>Great Michael's scores have all been below 30 this week</strong>, which is the critical range. This does not mean something is definitely wrong, but it does mean they may be going through a very difficult time emotionally or physically.
            </p>
          </div>

          <div style="font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Profile Information</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:4px 0;color:#718096;font-size:13px;">Age</td>
              <td style="padding:4px 0;font-size:13px;">20</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#718096;font-size:13px;">Address</td>
              <td style="padding:4px 0;font-size:13px;">Kalaklan Olongapo</td>
            </tr>
          </table>

          <div style="background:#ebf8ff;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:14px;font-weight:600;color:#2b6cb0;margin-bottom:8px;">What you can do</div>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:#2c5282;line-height:1.8;">
              <li>Reach out to Great Michael to check in on how they're feeling</li>
              <li>Encourage them to talk to a trusted person or professional</li>
              <li>If you believe they are in immediate danger, contact emergency services</li>
            </ul>
          </div>

          <div style="background:#fff5f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:14px;font-weight:600;color:#c53030;margin-bottom:8px;">Philippine Crisis Hotlines</div>
            <div style="font-size:13px;color:#742a2a;line-height:1.8;">
              Hopeline: <strong>8804-4673</strong><br>
              NCMH: <strong>1553</strong><br>
              In Touch: <strong>0917-800-8654</strong>
            </div>
          </div>

          <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">
            This alert was sent automatically by Mend because Great Michael's health scores fell below a critical threshold for 7 consecutive days.
            Mend does not share personal health data beyond this alert. If you have concerns, please reach out directly.
          </p>
        </td></tr>

        <tr><td style="background:#f7f8fa;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#a0aec0;">Mend · AI-driven health monitoring</div>
          <div style="font-size:11px;color:#cbd5e0;margin-top:4px;">You received this because you are listed as an emergency contact.</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`Sending test emails to ${TO} (UID: ${UID}) …\n`);

  // 1–4: static emails (no Firestore needed)
  await send('Login notification',    '[TEST] New login to your Mend account',                    loginHtml);
  await send('3-day check-in reminder', "[TEST] You haven't checked in for 3 days — Mend",       threeDayHtml);
  await send('5-day check-in reminder', '[TEST] We miss you — 5 days without a check-in',        fiveDayHtml);
  await send('7-day check-in reminder', '[TEST] ⚠️ 7 days without a check-in — are you okay?', sevenDayHtml);

  // 5: real monthly report
  if (!SA) {
    console.log('⚠️  Monthly health report skipped — no service account found.\n   Set FIREBASE_SERVICE_ACCOUNT env var or place scripts/service-account.json');
  } else {
    try {
      console.log('   Fetching Firestore data for monthly report…');
      const token = await getAccessToken();

      const today    = new Date();
      const startDay = new Date(today);
      startDay.setDate(today.getDate() - 29); // 30-day window
      const startStr = startDay.toISOString().split('T')[0];
      const endStr   = today.toISOString().split('T')[0];

      const [rawLogs, rawInsights, profile] = await Promise.all([
        fetchCollection('healthLogs', UID, 80, token),
        fetchCollection('insights',   UID, 80, token),
        fetchProfile(UID, token),
      ]);

      const logs     = rawLogs.filter(l => l.date >= startStr && l.date <= endStr);
      const insights = rawInsights.filter(i => i.date >= startStr && i.date <= endStr);

      console.log(`   Found ${logs.length} logs and ${insights.length} insights in the past 30 days.`);

      const stats = computeStats(logs, insights, 30);
      const html  = buildReportHTML(stats, profile, 30, startStr, endStr);

      await send('Monthly health report', '[TEST] Your Monthly Mend Health Report', html);
    } catch (e) {
      console.log(`❌ Monthly health report failed — ${e.message}`);
    }
  }

  // 6: emergency contact alert
  await send(
    'Emergency contact alert',
    '[TEST] ⚠️ Wellness Alert: Great Michael has had critically low health scores this week',
    emergencyHtml
  );

  console.log('\nDone.');
})();
