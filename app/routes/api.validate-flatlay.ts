import type { ActionFunctionArgs } from 'react-router';
import { logServerEvent } from '../lib/observability.server';
import { buildRateLimitHeaders, consumeRateLimit } from '../lib/rateLimit.server';
import { getNormalizedRateLimitSubject } from '../lib/rateLimitSubject.server';
import { getShopFromSessionToken } from '../lib/sessionToken.server';
import { validateFlatLayServer } from '../lib/validateFlatLay.server';

export const config = { maxDuration: 15 };

type ReqBody = { imageB64: string; mimeType: 'image/png' | 'image/jpeg' };

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10; // per minute

export const action = async ({ request }: ActionFunctionArgs) => {
  const jsonNoStore = (
    body: unknown,
    init?: ResponseInit,
    rateLimitHeaders?: Headers,
  ) => {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'no-store');
    if (rateLimitHeaders) {
      for (const [key, value] of rateLimitHeaders.entries()) {
        headers.set(key, value);
      }
    }
    return Response.json(body, { ...init, headers });
  };

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

  const rateLimit = await consumeRateLimit({
    namespace: 'flatlay-validation',
    subject: getNormalizedRateLimitSubject(request, { shopId }),
    limit: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
    algorithm: 'sliding',
  });
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);

  let body: ReqBody;
  try {
    body = (await request.json()) as ReqBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { imageB64, mimeType } = body || ({} as ReqBody);
  if (!imageB64 || (mimeType !== 'image/png' && mimeType !== 'image/jpeg')) {
    return jsonNoStore({ error: 'invalid_request' }, { status: 400 }, rateLimitHeaders);
  }
  // Rough size cap ~6MB decoded
  const approxBytes = Math.ceil(imageB64.length * 0.75);
  const MAX_BYTES = 6 * 1024 * 1024;
  if (approxBytes > MAX_BYTES) {
    return jsonNoStore({ error: 'payload_too_large' }, { status: 400 }, rateLimitHeaders);
  }

  if (!rateLimit.allowed) {
    return jsonNoStore(
      { error: 'rate_limited', retryAfterMs: rateLimit.retryAfterMs },
      { status: 429 },
      rateLimitHeaders,
    );
  }

  if (process.env.FLATLAY_VALIDATE_STUB === 'true') {
    return jsonNoStore(
      { schemaVersion: '1', model: 'stub', contentHash: 'stub', quality: 'good', reasons: ['stub'], score: 1.0, count: 1, cacheHit: false },
      undefined,
      rateLimitHeaders,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonNoStore({ error: 'service_unavailable' }, { status: 503 }, rateLimitHeaders);
  }

  try {
    const bytes = Buffer.from(imageB64, 'base64');
    const res = await validateFlatLayServer(new Uint8Array(bytes), mimeType, apiKey);
    // Always include schemaVersion/model/warnMode when present; no-store responses
    return jsonNoStore(res, undefined, rateLimitHeaders);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if ((e as any)?.code === 'RATE_LIMIT' || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('quota')) {
      logServerEvent('warn', 'validator.upstream_rate_limited', {
        shopId,
        route: 'api.validate-flatlay',
      });
      return jsonNoStore({ error: 'rate_limited' }, { status: 503 }, rateLimitHeaders);
    }
    if ((e as any)?.code === 'SERVICE_UNAVAILABLE' || msg.includes('service_unavailable')) {
      logServerEvent('warn', 'validator.upstream_unavailable', {
        shopId,
        route: 'api.validate-flatlay',
      });
      return jsonNoStore({ error: 'service_unavailable' }, { status: 503 }, rateLimitHeaders);
    }
    // Non-blocking: default to warn on safety/ambiguous
    logServerEvent('warn', 'validator.validation_unavailable', {
      shopId,
      route: 'api.validate-flatlay',
      error: msg || 'unknown_error',
    });
    return jsonNoStore(
      { schemaVersion: '1', model: 'unknown', contentHash: 'unknown', quality: 'warn', reasons: ['validation_unavailable'], score: 0, count: null },
      undefined,
      rateLimitHeaders,
    );
  }
};
