import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { jwtVerify, createRemoteJWKSet } from 'jose';

let ratelimit = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_URL.startsWith('https://')) {
    ratelimit = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(3, '10 m'),
      analytics: false,
    });
  }
} catch (e) {
  console.warn('Upstash init failed:', e.message);
}

const ALLOWED_ORIGINS = new Set([
  process.env.APP_ORIGIN ?? '',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
]);

function getEmailHtml(link) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { margin: 0; padding: 0; background-color: #0a0a0a; font-family: 'Inter', sans-serif; color: #ffffff; }
  .wrapper { width: 100%; max-width: 480px; padding: 40px 20px; margin: 0 auto; box-sizing: border-box; }
  
  .auth-card {
    --r: 20px;
    --stub-h: 80px;
    --bg: #141414;
    width: 100%;
    margin: 0 auto;
    text-align: center;
    border-radius: 20px;
    background:
      radial-gradient(circle at 0 100%, transparent var(--r), var(--bg) calc(var(--r) + 0.5px)) top left / 50.5% calc(100% - var(--stub-h)) no-repeat,
      radial-gradient(circle at 100% 100%, transparent var(--r), var(--bg) calc(var(--r) + 0.5px)) top right / 50.5% calc(100% - var(--stub-h)) no-repeat,
      radial-gradient(circle at 0 0, transparent var(--r), var(--bg) calc(var(--r) + 0.5px)) bottom left / 50.5% var(--stub-h) no-repeat,
      radial-gradient(circle at 100% 0, transparent var(--r), var(--bg) calc(var(--r) + 0.5px)) bottom right / 50.5% var(--stub-h) no-repeat;
    filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.6));
    border: none;
    outline: none;
  }
  
  .auth-main { padding: 40px 32px 32px 32px; }
  .ticket-divider { margin: 0 20px; border-bottom: 2px dashed rgba(255, 255, 255, 0.1); }
  .auth-footer { padding: 20px 24px; height: 80px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; }

  .logo { max-width: 120px; margin: 0 auto 24px auto; display: block; }
  h2 { font-size: 22px; font-weight: 700; margin: 0 0 12px 0; color: #ffffff; text-align: center; }
  p { color: #a8a6a5; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5; text-align: center; }
  
  .btn { display: inline-block; background-color: #eab308; color: #0a0a0a !important; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 700; margin-bottom: 8px; transition: transform 0.2s; }
  .footer-text { font-size: 12px; color: #666; margin: 0; text-align: center; line-height: 1.5; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="auth-card">
    <div class="auth-main">
      <img class="logo" src="https://raw.githubusercontent.com/amorish/CineQ/main/assets/images/cineqLogoDarkmode.png" alt="CineQ">
      <h2>Verify your email</h2>
      <p>Welcome to CineQ! Click the golden button below to verify your account and activate your shared watchlist.</p>
      <a href="${link}" class="btn">Verify Account</a>
    </div>
    <div class="ticket-divider"></div>
    <div class="auth-footer">
      <p class="footer-text">Please ignore if you didn't create an account.<br>For safety, this link will expire in 24 hours.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
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

  const idToken = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }

  let email;
  try {
    const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`,
      audience: process.env.FIREBASE_PROJECT_ID,
    });
    email = payload.email;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (ratelimit) {
    const { success } = await ratelimit.limit(`verify:${email}`);
    if (!success) {
      return res.status(429).json({ error: 'Too many verification emails — wait a few minutes.' });
    }
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        idToken,
        returnOobLink: true,
        continueUrl: req.body.continueUrl || (process.env.APP_ORIGIN || 'https://cineq.vercel.app/')
      }),
    }
  );

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    console.error('Firebase sendOobCode error:', err);
    return res.status(502).json({ error: 'Could not generate verification link' });
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
      subject: 'Verify your email address for CineQ',
      html: getEmailHtml(oobLink),
    }),
  });

  if (!emailRes.ok) {
    console.error('Resend error:', await emailRes.text());
    return res.status(502).json({ error: 'Failed to send verification email' });
  }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unhandled server error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
