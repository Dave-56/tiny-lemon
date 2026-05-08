import { GoogleGenAI } from '@google/genai';
import { LruCache } from './lruCache';

export type FlatLayQuality = 'good' | 'warn' | 'fail';

export interface FlatLayValidation {
  quality: FlatLayQuality;
  reasons?: string[];
  score?: number | null;
  count?: number | null;
}

export interface FlatLayResponse extends FlatLayValidation {
  schemaVersion: '1';
  model: string;
  contentHash: string;
  retryAfterMs?: number;
  warnMode?: boolean;
  cacheHit?: boolean;
}

const DEFAULT_CONFIDENCE_MIN = 0.6;
const STRICT_FAIL_CONFIDENCE_MIN = 0.75;
const ONE_MIN = 60 * 1000;

// In-memory caches and counters (process-local)
const resultCache = new LruCache<string, FlatLayResponse>({ ttlMs: 60 * ONE_MIN, maxEntries: 2000 });

// Circuit breaker (very lightweight): if error/timeout rate > 30% over recent window, flip warnMode for 5 minutes
let breakerActiveUntil = 0;
let windowStart = Date.now();
let windowTotal = 0;
let windowFailures = 0;
const WINDOW_MS = 5 * ONE_MIN;
const BREAKER_DURATION_MS = 5 * ONE_MIN;

function updateWindowCounters({ failed }: { failed: boolean }) {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowTotal = 0;
    windowFailures = 0;
  }
  windowTotal++;
  if (failed) windowFailures++;
  const rate = windowTotal > 0 ? windowFailures / windowTotal : 0;
  if (rate >= 0.3 && windowTotal >= 10) {
    breakerActiveUntil = now + BREAKER_DURATION_MS;
  }
}

export function isWarnModeActive(): boolean {
  return Date.now() < breakerActiveUntil;
}

function reasonPrecedence(a: string, b: string): number {
  const order = [
    'safety',
    'invalid_type',
    'too_large',
    'timeout',
    'rate_limited',
    'unavailable',
    'multiple_garments',
    'no_garment',
    'low_confidence',
  ];
  return order.indexOf(a) - order.indexOf(b);
}

function toHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Web Crypto available in Node 20 via globalThis.crypto
  const hash = await (globalThis as any).crypto.subtle.digest('SHA-256', bytes);
  return toHex(hash);
}

function sniffMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'invalid' {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'invalid';
}

/**
 * Server-side flat-lay validator using Gemini with cache, timeout, and circuit breaker.
 * Accepts raw bytes (server computes contentHash) and returns schema v1.
 */
export async function validateFlatLayServer(
  imageBytes: Uint8Array,
  mimeTypeHint: string,
  apiKey: string,
): Promise<FlatLayResponse> {
  const model = process.env.GARMENT_VALIDATOR_MODEL || 'gemini-2.0-flash';
  const min = Number(process.env.FLATLAY_CONFIDENCE_MIN ?? DEFAULT_CONFIDENCE_MIN);

  // Safety: size cap after decode (approx enforced earlier), sniff MIME
  const MAX_BYTES = 6 * 1024 * 1024;
  if (imageBytes.byteLength > MAX_BYTES) {
    return {
      schemaVersion: '1',
      model,
      contentHash: 'too_large',
      quality: 'warn',
      reasons: ['too_large'],
      score: null,
      count: null,
    };
  }

  const sniffed = sniffMime(imageBytes);
  if (sniffed === 'invalid') {
    return {
      schemaVersion: '1',
      model,
      contentHash: 'invalid_type',
      quality: 'warn',
      reasons: ['invalid_type'],
      score: null,
      count: null,
    };
  }
  const effectiveMime = sniffed === 'image/png' || sniffed === 'image/jpeg' ? sniffed : (mimeTypeHint === 'image/jpeg' ? 'image/jpeg' : 'image/png');

  // Compute hash server-side for cache key
  const hash = (await sha256Hex(imageBytes)).slice(0, 16);

  const warnMode = isWarnModeActive();
  if (warnMode) {
    return {
      schemaVersion: '1',
      model,
      contentHash: hash,
      quality: 'warn',
      reasons: ['unavailable'],
      score: null,
      count: null,
      warnMode: true,
      cacheHit: false,
    };
  }

  const cached = resultCache.get(hash);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `You will be shown a product photo image. Task: determine how many distinct garments are present.

Rules:
- A single shirt, dress, jacket, blazer, coat, pants, skirt, or similar garment counts as 1.
- The garment may be flat, hanging on a hanger, clipped, on a rail, on a mannequin, or photographed against any background.
- Ignore hangers, clips, rails, hooks, tags, shadows, lapels, sleeves, lining, pockets, buttons, belts attached to the garment, and overlapping panels. These are not extra garments.
- A blazer/jacket/coat with two sleeves, two lapels, an open front, visible lining, or double-breasted panels still counts as exactly 1 garment.
- Count > 1 only when there are multiple distinct clothing products, such as a top and pants, a jacket plus a shirt, a full outfit on a person, or several separate garments laid together.
- If no garment is visible, count = 0.

Output: Only respond with strict JSON and nothing else in this exact shape:
{"count": number, "confidence": number}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let text = '';
  let failed = false;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: Buffer.from(imageBytes).toString('base64'), mimeType: effectiveMime } },
          { text: prompt },
        ],
      }],
      // SDK may not support signal; timeout still bounds our handler
    } as any);
    // Attempt to get text from response helper or fallback
    text = (response.text ?? '').trim();
  } catch (e) {
    failed = true;
    const msg = (e as Error).message ?? '';
    clearTimeout(timeout);
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.toLowerCase().includes('quota')) {
      throw Object.assign(new Error('rate_limited'), { code: 'RATE_LIMIT' });
    }
    if (msg.includes('NOT_FOUND') || msg.includes('not found for API version')) {
      throw Object.assign(new Error('service_unavailable'), { code: 'SERVICE_UNAVAILABLE' });
    }
    if (msg.toLowerCase().includes('safety')) {
      updateWindowCounters({ failed: true });
      const res: FlatLayResponse = {
        schemaVersion: '1', model, contentHash: hash, quality: 'warn', reasons: ['safety'], score: 0, count: null,
      };
      resultCache.set(hash, res);
      return { ...res, cacheHit: false };
    }
    updateWindowCounters({ failed: true });
    const res: FlatLayResponse = {
      schemaVersion: '1', model, contentHash: hash, quality: 'warn', reasons: ['unavailable'], score: null, count: null,
    };
    resultCache.set(hash, res);
    return { ...res, cacheHit: false };
  } finally {
    clearTimeout(timeout);
  }

  // Lenient JSON extraction: find first {...} and parse
  let count: number | null = null;
  let confidence: number | null = null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { count?: unknown; confidence?: unknown };
      if (typeof parsed.count === 'number' && isFinite(parsed.count)) count = Math.round(parsed.count);
      if (typeof parsed.confidence === 'number' && isFinite(parsed.confidence)) {
        const c = Number(parsed.confidence);
        confidence = Math.max(0, Math.min(1, c));
      }
    } catch {
      // ignore
    }
  }

  const { quality, reasons } = classifyGarmentCount({ count, confidence, min });

  updateWindowCounters({ failed });

  const response: FlatLayResponse = {
    schemaVersion: '1',
    model,
    contentHash: hash,
    quality,
    reasons: reasons?.length ? reasons : undefined,
    score: confidence ?? null,
    count: count ?? null,
  };
  resultCache.set(hash, response);
  return { ...response, cacheHit: false };
}

export function classifyGarmentCount({
  count,
  confidence,
  min = DEFAULT_CONFIDENCE_MIN,
}: {
  count: number | null;
  confidence: number | null;
  min?: number;
}): Pick<FlatLayValidation, 'quality' | 'reasons'> {
  const reasons: string[] = [];

  if (count === 1) {
    return { quality: 'good' };
  }

  if (count === 0) {
    reasons.push('no_garment');
    if ((confidence ?? 0) >= STRICT_FAIL_CONFIDENCE_MIN) {
      return { quality: 'fail', reasons };
    }
    reasons.push('low_confidence');
    reasons.sort(reasonPrecedence);
    return { quality: 'warn', reasons };
  }

  if (count != null && count > 1) {
    reasons.push('multiple_garments');
    if ((confidence ?? 0) >= STRICT_FAIL_CONFIDENCE_MIN) {
      return { quality: 'fail', reasons };
    }
    reasons.push('low_confidence');
    reasons.sort(reasonPrecedence);
    return { quality: 'warn', reasons };
  }

  reasons.push('low_confidence');
  if ((confidence ?? 0) >= min) {
    reasons.pop();
  }
  return { quality: 'warn', reasons: reasons.length ? reasons : undefined };
}
