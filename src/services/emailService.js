const WORKER_URL = 'https://vitalyze-auth.greatmichaelsantos15.workers.dev';

export async function sendEmail(to, subject, html) {
  const res = await fetch(`${WORKER_URL}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html }),
  });
  return res.json();
}
