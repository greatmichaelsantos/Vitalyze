/**
 * Vitalyze Cloudflare Worker
 *
 * Routes:
 *   POST /           { uid }              → Firebase custom token (QR login)
 *   POST /send-email { to, subject, html } → Resend email
 *   OPTIONS *                             → CORS preflight
 *
 * Cron:
 *   Daily at 12:00 UTC (8 PM PHT) → check-in reminders for inactive users
 *
 * Required secrets (Cloudflare dashboard → Workers → Settings → Variables):
 *   FIREBASE_SERVICE_ACCOUNT  — full service account JSON string
 *   RESEND_API_KEY            — your Resend API key
 */

const FIRESTORE_PROJECT = 'vitalyze-c5a0b';
const FIRESTORE_BASE    = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents`;

// ── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === 'POST') {
      if (url.pathname === '/' || url.pathname === '') {
        return handleCustomToken(request, env);
      }
      if (url.pathname === '/send-email') {
        return handleSendEmail(request, env);
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkMissingCheckIns(env));
  },
};

// ── Cron: check-in reminders ──────────────────────────────────────────────────

async function checkMissingCheckIns(env) {
  const token = await getAccessToken(env);

  const users = await fetchAllUsers(token);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (const user of users) {
    if (!user.email) continue;

    const name     = user.displayName || user.email.split('@')[0];
    const lastDate = await fetchLatestCheckInDate(user.uid, token);

    // Skip users who have never checked in — no baseline to diff against
    if (!lastDate) continue;

    const diffMs    = today - new Date(lastDate + 'T00:00:00Z');
    const daysSince = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (daysSince === 3) {
      await resendEmail(
        user.email,
        "You haven't checked in for 3 days — Mend",
        `<p>Hi ${name},</p><p>It's been 3 days since your last Mend check-in. Your health insights work best with regular check-ins. Take 2 minutes today to log how you're feeling.</p>`,
        env
      );
    } else if (daysSince === 5) {
      await resendEmail(
        user.email,
        'We miss you — 5 days without a check-in',
        `<p>Hi ${name},</p><p>It's been 5 days since your last check-in. Consistent check-ins help Mend detect patterns and keep you on track. Come back today!</p>`,
        env
      );
    } else if (daysSince === 7) {
      await resendEmail(
        user.email,
        '⚠️ 7 days without a check-in — are you okay?',
        `<p>Hi ${name},</p><p>It's been a week since your last Mend check-in. We're concerned about your wellness. Please take a moment to check in or reach out to someone you trust if you're struggling.</p><p>Philippine crisis lines: Hopeline 8804-4673 | NCMH 1553 | In Touch 0917-800-8654</p>`,
        env
      );
    }

    // Weekly low-score emergency contact alert
    if (user.emergencyContactEmail) {
      const weeklyLogs = await fetchWeeklyScores(user.uid, token);
      if (weeklyLogs.length >= 3 && weeklyLogs.every(c => c.overallScore < 30)) {
        const contactName = user.emergencyContactName || 'Emergency Contact';
        const scoreRows = weeklyLogs
          .map(c => `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${c.date}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;color:#e53e3e;font-weight:600;">${c.overallScore}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${c.physicalScore ?? '—'}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;">${c.mentalScore ?? '—'}</td></tr>`)
          .join('');

        const optionalRow = (label, value) =>
          value ? `<tr><td style="padding:4px 0;color:#718096;font-size:13px;">${label}</td><td style="padding:4px 0;font-size:13px;">${value}</td></tr>` : '';

        const profileTable = [
          optionalRow('Age', user.age),
          optionalRow('Address', user.address),
          optionalRow('Phone', user.phoneNumber),
          optionalRow('Allergies', user.allergies),
          optionalRow('Medical conditions', user.medicalConditions),
          optionalRow('Current medications', user.currentMedications),
        ].join('');

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#8B7FFF;padding:28px 32px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Mend</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">Health Monitoring</div>
        </td></tr>

        <!-- Alert banner -->
        <tr><td style="background:#fff3cd;border-left:4px solid #f59e0b;padding:16px 32px;">
          <div style="font-size:15px;font-weight:600;color:#92400e;">⚠️ Wellness Alert for ${name}</div>
          <div style="font-size:13px;color:#92400e;margin-top:4px;">This person's health scores have been critically low for the past week.</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#1a202c;">Hi ${contactName},</p>
          <p style="margin:0 0 20px;font-size:14px;color:#4a5568;line-height:1.6;">
            You are listed as the emergency contact for <strong>${name}</strong> on Mend, a personal health monitoring app.
            We're reaching out because their recorded health scores over the past 7 days have been critically low, and we want to make sure they're okay.
          </p>

          <!-- Score table -->
          <div style="font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Weekly Health Scores</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
            <tr style="background:#f7f8fa;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#718096;font-weight:600;">Date</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;font-weight:600;">Overall</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;font-weight:600;">Physical</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#718096;font-weight:600;">Mental</th>
            </tr>
            ${scoreRows}
          </table>

          <div style="background:#f0f4ff;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:14px;font-weight:600;color:#3730a3;margin-bottom:8px;">What do these numbers mean?</div>
            <p style="font-size:13px;color:#3730a3;line-height:1.7;margin:0;">
              Mend gives each person a daily score from <strong>0 to 100</strong> based on how they answered questions about their mood, sleep, energy, stress, and emotional wellbeing.<br><br>
              <strong>70–100</strong> = Healthy and doing well<br>
              <strong>40–69</strong> = Some areas need attention<br>
              <strong>0–39</strong> = Struggling — support is recommended<br><br>
              <strong>${name}'s scores have all been below 30 this week</strong>, which is the critical range. This does not mean something is definitely wrong, but it does mean they may be going through a very difficult time emotionally or physically.
            </p>
          </div>

          ${profileTable ? `
          <!-- Profile info -->
          <div style="font-size:13px;font-weight:600;color:#718096;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">Profile Information</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            ${profileTable}
          </table>` : ''}

          <!-- What to do -->
          <div style="background:#ebf8ff;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:14px;font-weight:600;color:#2b6cb0;margin-bottom:8px;">What you can do</div>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:#2c5282;line-height:1.8;">
              <li>Reach out to ${name} to check in on how they're feeling</li>
              <li>Encourage them to talk to a trusted person or professional</li>
              <li>If you believe they are in immediate danger, contact emergency services</li>
            </ul>
          </div>

          <!-- Crisis lines -->
          <div style="background:#fff5f5;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:14px;font-weight:600;color:#c53030;margin-bottom:8px;">Philippine Crisis Hotlines</div>
            <div style="font-size:13px;color:#742a2a;line-height:1.8;">
              Hopeline: <strong>8804-4673</strong><br>
              NCMH: <strong>1553</strong><br>
              In Touch: <strong>0917-800-8654</strong>
            </div>
          </div>

          <p style="margin:0;font-size:13px;color:#a0aec0;line-height:1.6;">
            This alert was sent automatically by Mend because ${name}'s health scores fell below a critical threshold for 7 consecutive days.
            Mend does not share personal health data beyond this alert. If you have concerns, please reach out directly.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f7f8fa;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#a0aec0;">Mend · AI-driven health monitoring</div>
          <div style="font-size:11px;color:#cbd5e0;margin-top:4px;">You received this because you are listed as an emergency contact.</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

        await resendEmail(
          user.emergencyContactEmail,
          `⚠️ Wellness Alert: ${name} has had critically low health scores this week`,
          html,
          env
        );
      }
    }
  }
}

async function fetchAllUsers(token) {
  const users = [];
  let pageToken = null;

  do {
    const url =
      `${FIRESTORE_BASE}/users?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;

    const data = await res.json();
    for (const docSnap of data.documents || []) {
      const fields = docSnap.fields || {};
      const uid    = docSnap.name.split('/').pop();
      users.push({
        uid,
        email:                 fsVal(fields.email),
        displayName:           fsVal(fields.displayName),
        emergencyContactEmail: fsVal(fields.emergencyContactEmail),
        emergencyContactName:  fsVal(fields.emergencyContactName),
        age:                   fsVal(fields.age),
        address:               fsVal(fields.address),
        phoneNumber:           fsVal(fields.phoneNumber),
        allergies:             fsVal(fields.allergies),
        medicalConditions:     fsVal(fields.medicalConditions),
        currentMedications:    fsVal(fields.currentMedications),
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return users;
}

async function fetchLatestCheckInDate(userId, token) {
  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from:  [{ collectionId: 'healthLogs' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op:    'EQUAL',
            value: { stringValue: userId },
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit:   1,
      },
    }),
  });
  if (!res.ok) return null;

  const results = await res.json();
  const hit = results[0];
  if (!hit?.document) return null;

  return fsVal(hit.document.fields?.date) ?? null; // "YYYY-MM-DD"
}

async function fetchWeeklyScores(userId, token) {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutoffIso = cutoff.toISOString();

  const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from:  [{ collectionId: 'healthLogs' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'userId' },
                  op:    'EQUAL',
                  value: { stringValue: userId },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'createdAt' },
                  op:    'GREATER_THAN_OR_EQUAL',
                  value: { timestampValue: cutoffIso },
                },
              },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
        limit: 7,
      },
    }),
  });
  if (!res.ok) return [];

  const results = await res.json();
  return results
    .filter(r => r.document)
    .map(r => {
      const f = r.document.fields || {};
      return {
        date:          fsVal(f.date)         ?? '',
        overallScore:  fsVal(f.overallScore)  ?? 100,
        physicalScore: fsVal(f.physicalScore) ?? null,
        mentalScore:   fsVal(f.mentalScore)   ?? null,
      };
    });
}

async function resendEmail(to, subject, html, env) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: 'onboarding@resend.dev', to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Google OAuth2 access token (for Firestore REST API) ───────────────────────

async function getAccessToken(env) {
  const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const pk = await importPrivateKey(sa.private_key);

  const now     = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/datastore',
    iat:   now,
    exp:   now + 3600,
  }));

  const signingInput = `${header}.${payload}`;
  const signature    = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    pk,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64url(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    throw new Error(`OAuth token error: ${JSON.stringify(tokenData)}`);
  }
  return tokenData.access_token;
}

// ── QR Login — Firebase custom token ─────────────────────────────────────────

async function handleCustomToken(request, env) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.uid) {
      return json({ error: 'Missing required field: uid' }, 400);
    }

    const sa         = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const privateKey = await importPrivateKey(sa.private_key);
    const token      = await generateCustomToken(body.uid, sa.client_email, privateKey);

    return json({ token });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function base64url(data) {
  const str =
    typeof data === 'string'
      ? data
      : String.fromCharCode(...new Uint8Array(data));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function generateCustomToken(uid, serviceAccountEmail, privateKey) {
  const now     = Math.floor(Date.now() / 1000);
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: serviceAccountEmail,
    sub: serviceAccountEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.openidconnect.v1.token',
    iat: now,
    exp: now + 3600,
    uid,
  }));
  const signingInput = `${header}.${payload}`;
  const signature    = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64url(signature)}`;
}

// ── Email — Resend (fetch handler) ────────────────────────────────────────────

async function handleSendEmail(request, env) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.to || !body?.subject || !body?.html) {
      return json({ error: 'Missing required fields: to, subject, html' }, 400);
    }

    const { to, subject, html } = body;

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: 'onboarding@resend.dev', to, subject, html }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => String(res.status));
      return json({ error: errBody }, res.status);
    }

    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ── Firestore value extractor ─────────────────────────────────────────────────

function fsVal(field) {
  if (!field) return null;
  if ('stringValue'    in field) return field.stringValue;
  if ('integerValue'   in field) return Number(field.integerValue);
  if ('doubleValue'    in field) return field.doubleValue;
  if ('booleanValue'   in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  return null;
}
