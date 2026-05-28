import { z } from 'zod';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: false,
});

const FeedbackSchema = z.object({
  email: z.string().max(254).default('Anonymous'),
  message: z.string().min(1).max(5000).trim(),
  attachment: z
    .string()
    .max(2_800_000)
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .optional()
    .or(z.literal('')),
  filename: z.string().optional(),
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

  // Auth is optional for feedback, but verify if present
  const token = (req.headers.authorization ?? '').replace('Bearer ', '');
  if (token) {
    try {
      await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`,
        audience: process.env.FIREBASE_PROJECT_ID,
      });
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? '127.0.0.1';
  const { success, limit, remaining, reset } = await ratelimit.limit(`feedback:${ip}`);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);

  if (!success) {
    return res.status(429).json({ error: 'Too many requests — try again later.' });
  }

  const parsed = FeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { email, message, attachment, filename } = parsed.data;

  const attachments = attachment && attachment.trim() !== ''
    ? [
        {
          filename: filename || 'screenshot.png',
          content: attachment.split(',')[1],
        },
      ]
    : [];

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: process.env.FEEDBACK_TO,
      reply_to: email !== 'Anonymous' ? email : undefined,
      subject: `[CineQ Feedback] from ${email}`,
      html: `
        <p><strong>Email:</strong> ${escHtml(email)}</p>
        <hr/>
        <p>${escHtml(message).replace(/\n/g, '<br/>')}</p>
      `,
      attachments,
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
