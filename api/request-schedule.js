import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '1 h'), // Limit to 3 requests per hour
  analytics: false,
});

const RequestSchema = z.object({
  email: z.string().email(),
  uid: z.string().min(1),
});

const ALLOWED_ORIGINS = new Set([
  process.env.APP_ORIGIN ?? '',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
]);

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

  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const verified = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`,
      audience: process.env.FIREBASE_PROJECT_ID,
    });
    
    // Ensure the token's UID matches the requested UID
    const parsed = RequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    
    if (verified.payload.user_id !== parsed.data.uid) {
        return res.status(403).json({ error: 'Forbidden' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? '127.0.0.1';
  const { success, limit, remaining, reset } = await ratelimit.limit(`schedule-req:${ip}`);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);

  if (!success) {
    return res.status(429).json({ error: 'Too many requests — try again later.' });
  }

  const parsed = RequestSchema.safeParse(req.body);
  const { email, uid } = parsed.data;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: 'mycineq@gmail.com', // Sending directly to developer
      reply_to: email,
      subject: `[CineQ] Schedule Access Request from ${email}`,
      html: `
        <h2>Google Calendar Schedule Access Request</h2>
        <p><strong>User Email:</strong> ${escHtml(email)}</p>
        <p><strong>User UID:</strong> ${escHtml(uid)}</p>
        <hr/>
        <p>To approve this request, open the Firebase Console, locate the document <code>users/${escHtml(uid)}</code>, and set the <code>scheduleStatus</code> field to <code>"approved"</code>.</p>
      `,
    }),
  });

  if (!emailRes.ok) {
    console.error('Resend error:', await emailRes.text());
    return res.status(502).json({ error: 'Failed to send email' });
  }

  return res.status(200).json({ ok: true });
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
