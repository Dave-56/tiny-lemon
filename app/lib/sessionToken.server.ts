import { createHmac } from "node:crypto";

/**
 * Shopify session tokens are JWTs signed with HS256 (HMAC-SHA256) using the app's API secret.
 * Payload includes: dest (shop host, e.g. "https://store.myshopify.com"), exp, nbf, aud.
 * Returns the shop domain (e.g. "store.myshopify.com") or null if invalid/expired.
 */
export function getShopFromSessionToken(
  bearerToken: string | null,
  secret: string
): string | null {
  if (!bearerToken?.startsWith("Bearer ")) return null;
  const token = bearerToken.slice(7).trim();
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;

  // Base64url to base64: replace - with +, _ with /, add padding so length % 4 === 0
  const base64 = (s: string) => {
    let b = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b.length % 4)) % 4;
    return b + "=".repeat(pad);
  };

  const message = `${headerB64}.${payloadB64}`;
  const signature = Buffer.from(base64(sigB64), "base64");
  const expected = createHmac("sha256", secret)
    .update(message)
    .digest();
  if (signature.length !== expected.length || !expected.equals(signature)) return null;

  let payload: { dest?: string; exp?: number; nbf?: number };
  try {
    payload = JSON.parse(
      Buffer.from(base64(payloadB64), "base64").toString("utf8")
    ) as { dest?: string; exp?: number; nbf?: number };
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp != null && payload.exp < now) return null;
  if (payload.nbf != null && payload.nbf > now) return null;

  const dest = payload.dest;
  if (!dest || typeof dest !== "string") return null;
  try {
    const url = new URL(dest.startsWith("http") ? dest : `https://${dest}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}
