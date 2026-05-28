import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '10 m'),
  analytics: false,
});

const BodySchema = z.object({
  email: z.string().email().max(254),
  username: z.string().optional(),
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

  // Extract token from Authorization header instead of body
  const idToken = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { email } = parsed.data;

  const { success } = await ratelimit.limit(`verify:${email}`);
  if (!success) {
    return res.status(429).json({ error: 'Too many verification emails — wait a few minutes.' });
  }

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        idToken,
      }),
    }
  );

  if (!verifyRes.ok) {
    const err = await verifyRes.json().catch(() => ({}));
    console.error('Firebase sendOobCode error:', err);
    return res.status(502).json({ error: 'Could not send verification email' });
  }

  return res.status(200).json({ ok: true });
}
