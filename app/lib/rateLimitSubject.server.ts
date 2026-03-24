function normalizeIpCandidate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.toLowerCase() : null;
}

export function getClientIp(request: Request): string {
  const cfConnectingIp = normalizeIpCandidate(
    request.headers.get("cf-connecting-ip"),
  );
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstHop = normalizeIpCandidate(xForwardedFor.split(",")[0] ?? null);
    if (firstHop) return firstHop;
  }

  const xRealIp = normalizeIpCandidate(request.headers.get("x-real-ip"));
  if (xRealIp) return xRealIp;

  return "unknown";
}

export function getNormalizedRateLimitSubject(
  request: Request,
  options: { shopId?: string } = {},
): string {
  const ip = getClientIp(request);
  if (options.shopId) {
    return `shop:${options.shopId}:ip:${ip}`;
  }
  return `ip:${ip}`;
}
