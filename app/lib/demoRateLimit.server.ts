/**
 * In-memory rate limit for /try demo generations: 10 per IP per 24h.
 * Resets on serverless cold start. For production at scale, use KV (e.g. Vercel KV / Upstash).
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const store = new Map<string, { count: number; windowStart: number }>();

export function checkDemoRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const entry = store.get(ip);
  if (entry == null || now - entry.windowStart >= WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (entry.count >= MAX_PER_WINDOW) {
    return { allowed: false };
  }
  entry.count += 1;
  return { allowed: true };
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri;
  return "unknown";
}
