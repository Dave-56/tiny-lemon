import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  validateFlatLayServer: vi.fn(),
  consumeRateLimit: vi.fn(),
  buildRateLimitHeaders: vi.fn(),
  getNormalizedRateLimitSubject: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("../lib/sessionToken.server", () => ({
  getShopFromSessionToken: mocks.getShopFromSessionToken,
}));

vi.mock("../lib/validateFlatLay.server", () => ({
  validateFlatLayServer: mocks.validateFlatLayServer,
}));

vi.mock("../lib/rateLimit.server", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  buildRateLimitHeaders: mocks.buildRateLimitHeaders,
}));

vi.mock("../lib/rateLimitSubject.server", () => ({
  getNormalizedRateLimitSubject: mocks.getNormalizedRateLimitSubject,
}));

vi.mock("../lib/observability.server", () => ({
  logServerEvent: mocks.logServerEvent,
}));

import { action } from "../routes/api.validate-flatlay";

describe("api.validate-flatlay action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "shopify-secret";
    process.env.GEMINI_API_KEY = "gemini-key";
    delete process.env.FLATLAY_VALIDATE_STUB;

    mocks.getShopFromSessionToken.mockReturnValue("shop-a.myshopify.com");
    mocks.getNormalizedRateLimitSubject.mockReturnValue(
      "shop:shop-a.myshopify.com:ip:203.0.113.10",
    );
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      enforced: true,
      storeAvailable: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date("2026-03-24T19:00:00.000Z"),
      retryAfterMs: null,
      subjectDigest: "abc123",
      algorithm: "sliding",
    });
    mocks.buildRateLimitHeaders.mockReturnValue(
      new Headers({
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "9",
        "X-RateLimit-Reset": "1774388400",
      }),
    );
    mocks.validateFlatLayServer.mockResolvedValue({
      schemaVersion: "1",
      model: "gemini-2.0-flash",
      contentHash: "hash123",
      quality: "good",
      score: 0.99,
      count: 1,
      cacheHit: false,
    });
  });

  function makeRequest(body: Record<string, unknown>) {
    return new Request("https://example.com/api/validate-flatlay", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer session-token",
      },
      body: JSON.stringify(body),
    });
  }

  it("returns a 429 app-level deny with retry metadata and standard headers", async () => {
    mocks.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      enforced: true,
      storeAvailable: true,
      limit: 10,
      remaining: 0,
      resetAt: new Date("2026-03-24T19:00:10.000Z"),
      retryAfterMs: 12000,
      subjectDigest: "abc123",
      algorithm: "sliding",
    });
    mocks.buildRateLimitHeaders.mockReturnValueOnce(
      new Headers({
        "Retry-After": "12",
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1774388410",
      }),
    );

    const res = await action({
      request: makeRequest({ imageB64: "ZmFrZQ==", mimeType: "image/png" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: "rate_limited",
      retryAfterMs: 12000,
    });
    expect(res.headers.get("Retry-After")).toBe("12");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe("1774388410");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.validateFlatLayServer).not.toHaveBeenCalled();
  });

  it("returns validator success with shared rate-limit headers", async () => {
    const res = await action({
      request: makeRequest({ imageB64: "ZmFrZQ==", mimeType: "image/png" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      schemaVersion: "1",
      model: "gemini-2.0-flash",
      contentHash: "hash123",
      quality: "good",
      score: 0.99,
      count: 1,
      cacheHit: false,
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(res.headers.get("X-RateLimit-Reset")).toBe("1774388400");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps upstream Gemini quota failures distinct from app-level denies", async () => {
    mocks.validateFlatLayServer.mockRejectedValueOnce(
      Object.assign(new Error("rate_limited"), { code: "RATE_LIMIT" }),
    );

    const res = await action({
      request: makeRequest({ imageB64: "ZmFrZQ==", mimeType: "image/png" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
    expect(mocks.logServerEvent).toHaveBeenCalledWith(
      "warn",
      "validator.upstream_rate_limited",
      expect.objectContaining({
        shopId: "shop-a.myshopify.com",
      }),
    );
  });
});
