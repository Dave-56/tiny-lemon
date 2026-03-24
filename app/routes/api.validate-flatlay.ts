import type { ActionFunctionArgs } from 'react-router';
import { getClientIp } from '../lib/rateLimitSubject.server';
import { getShopFromSessionToken } from '../lib/sessionToken.server';
import { validateFlatLayServer } from '../lib/validateFlatLay.server';

export const config = { maxDuration: 15 };

type ReqBody = { imageB64: string; mimeType: 'image/png' | 'image/jpeg' };

// Simple per-shop+IP sliding window (process-local) to discourage abuse
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10; // per minute
const rl: Record<string, number[]> = Object.create(null);

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'method_not_allowed' }, { status: 405 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return Response.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const auth = request.headers.get('Authorization');
  const shopId = getShopFromSessionToken(auth, secret);
  if (!shopId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { imageB64, mimeType } = body || ({} as ReqBody);
  if (!imageB64 || (mimeType !== 'image/png' && mimeType !== 'image/jpeg')) {
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  // Rough size cap ~6MB decoded
  const approxBytes = Math.ceil(imageB64.length * 0.75);
  const MAX_BYTES = 6 * 1024 * 1024;
  if (approxBytes > MAX_BYTES) {
    return Response.json({ error: 'payload_too_large' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  // Rate limit per shop+IP
  const ip = getClientIp(request);
  const key = `${shopId}:${ip}`;
  const now = Date.now();
  rl[key] = (rl[key] || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (rl[key].length >= RATE_LIMIT_MAX) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - rl[key][0]);
    return Response.json(
      { error: 'rate_limited', retryAfterMs },
      { status: 429, headers: { 'Retry-After': Math.ceil(retryAfterMs / 1000).toString(), 'Cache-Control': 'no-store' } },
    );
  }
  rl[key].push(now);

  if (process.env.FLATLAY_VALIDATE_STUB === 'true') {
    return Response.json(
      { schemaVersion: '1', model: 'stub', contentHash: 'stub', quality: 'good', reasons: ['stub'], score: 1.0, count: 1, cacheHit: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const bytes = Buffer.from(imageB64, 'base64');
    const res = await validateFlatLayServer(new Uint8Array(bytes), mimeType, apiKey);
    // Always include schemaVersion/model/warnMode when present; no-store responses
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if ((e as any)?.code === 'RATE_LIMIT' || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('quota')) {
      return Response.json({ error: 'rate_limited' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    if ((e as any)?.code === 'SERVICE_UNAVAILABLE' || msg.includes('service_unavailable')) {
      return Response.json({ error: 'service_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    // Non-blocking: default to warn on safety/ambiguous
    return Response.json(
      { schemaVersion: '1', model: 'unknown', contentHash: 'unknown', quality: 'warn', reasons: ['validation_unavailable'], score: 0, count: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
