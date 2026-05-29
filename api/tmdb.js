export const config = { runtime: 'edge' };

import { jwtVerify, createRemoteJWKSet } from 'jose';

const TMDB_BASE  = 'https://api.themoviedb.org';


const SAFE_PATH = /^\/3\/[a-z_/]+/i;

// Initialize JWKS once globally for the Edge function
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export default async function handler(req) {
  // 1. Universal CORS (Protected by Auth)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  // 2. Authentication
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return json({ error: 'Unauthorized: No token provided' }, 401, corsHeaders);
  }

  try {
    await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`,
      audience: process.env.FIREBASE_PROJECT_ID,
    });
  } catch (e) {
    return json({ error: 'Invalid or expired token', details: e.message }, 401, corsHeaders);
  }

  // 3. Path Validation & Extraction
  const url = new URL(req.url);
  let path = url.searchParams.get('path') ?? '';

  // Edge functions sometimes execute before query rewrites, so we manually extract if empty
  if (!path && url.pathname.includes('/3/')) {
    path = url.pathname.substring(url.pathname.indexOf('/3/'));
  }
  
  if (path && !path.startsWith('/')) {
    path = '/' + path;
  }

  if (!SAFE_PATH.test(path)) {
    return json({ error: 'Invalid path format', pathReceived: path }, 400, corsHeaders);
  }

  // 4. Proxy to TMDB
  const forward = new URLSearchParams(url.searchParams);
  forward.delete('path');
  const tmdbUrl = `${TMDB_BASE}${path}?${forward}`;

  const tmdbRes = await fetch(tmdbUrl, {
    headers: {
      Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
      Accept: 'application/json',
    },
  });

  const body = await tmdbRes.text();

  return new Response(body, {
    status: tmdbRes.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      ...corsHeaders,
    },
  });
}

// Helper function
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}
