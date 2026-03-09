/**
 * In-memory rate limit for /try demo generations: 1 per IP per 24h.
 * Resets on serverless cold start. For production at scale, use KV (e.g. Vercel KV / Upstash).
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const store = new Map<string, number>();

export function checkDemoRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const last = store.get(ip);
  if (last != null && now - last < WINDOW_MS) {
    return { allowed: false };
  }
  store.set(ip, now);
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
