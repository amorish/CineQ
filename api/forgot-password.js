import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  analytics: false,
});

const ALLOWED_ORIGINS = new Set([
  process.env.APP_ORIGIN ?? '',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
]);

const BodySchema = z.object({
  email: z.string().email().max(254),
});

function getEmailHtml(link) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Inter', sans-serif; color: #ffffff; }
  .wrapper { width: 100%; max-width: 480px; padding: 40px 20px; margin: 0 auto; box-sizing: border-box; }
  .auth-card { background: #141414; border-radius: 20px; padding: 40px; text-align: center; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); }
  .logo { max-width: 120px; margin: 0 auto 24px auto; display: block; }
  h2 { font-size: 22px; font-weight: 700; margin: 0 0 8px 0; color: #ffffff; }
  p { color: #a8a6a5; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5; }
  .btn { display: inline-block; background-color: #eab308; color: #0a0a0a !important; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 700; margin-bottom: 24px; transition: transform 0.2s; }
  .footer { font-size: 12px; color: #666; margin: 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="auth-card">
    <img class="logo" src="https://raw.githubusercontent.com/amorish/CineQ/main/assets/images/cineqLogoDarkmode.png" alt="CineQ">
    <h2>Reset your password</h2>
    <p>You recently requested to reset your password for your CineQ account. Click the golden button below to choose a new password.</p>
    <a href="${link}" class="btn">Reset Password</a>
    <p class="footer">If you didn't request a password reset, you can safely ignore this email.<br>For safety, this link will expire in 1 hour.</p>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { email } = parsed.data;

  const { success } = await ratelimit.limit(`reset:${email}`);
  if (!success) {
    return res.status(429).json({ error: 'Too many reset emails — wait a few minutes.' });
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email,
        returnOobLink: true
      }),
    }
  );

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    console.error('Firebase sendOobCode error:', err);
    return res.status(502).json({ error: 'Could not generate reset link' });
  }

  const data = await verifyRes.json();
  const oobLink = data.oobLink;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: email,
      subject: 'Reset your password for CineQ',
      html: getEmailHtml(oobLink),
    }),
  });

  if (!emailRes.ok) {
    console.error('Resend error:', await emailRes.text());
    return res.status(502).json({ error: 'Failed to send reset email' });
  }

  return res.status(200).json({ ok: true });
}
