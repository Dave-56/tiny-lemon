import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    $transaction: mocks.transaction,
    rateLimitEvent: {
      findMany: mocks.findMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

vi.mock("./observability.server", () => ({
  logServerEvent: mocks.logServerEvent,
}));

import {
  buildRateLimitHeaders,
  consumeRateLimit,
  createRateLimitSubjectDigest,
} from "./rateLimit.server";

describe("rateLimit.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RATE_LIMIT_HMAC_SECRET = "test-rate-limit-secret";
    delete process.env.SHOPIFY_API_SECRET;

    mocks.transaction.mockImplementation(async (callback: any) =>
      callback({
        rateLimitEvent: {
          count: mocks.count,
          create: mocks.create,
          findMany: mocks.findMany,
        },
      }),
    );
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({});
    mocks.findMany.mockResolvedValue([]);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("allows a fixed-window request and returns deterministic reset metadata", async () => {
    const now = new Date("2026-03-24T12:34:56.000Z");

    const decision = await consumeRateLimit({
      namespace: "try-demo",
      subject: "ip:203.0.113.10",
      limit: 1,
      windowMs: 24 * 60 * 60 * 1000,
      algorithm: "fixed",
      now,
    });

    expect(decision).toMatchObject({
      allowed: true,
      enforced: true,
      storeAvailable: true,
      limit: 1,
      remaining: 0,
      retryAfterMs: null,
      algorithm: "fixed",
    });
    expect(decision.resetAt?.toISOString()).toBe("2026-03-25T00:00:00.000Z");
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        namespace: "try-demo",
        algorithm: "fixed",
        windowStart: new Date("2026-03-24T00:00:00.000Z"),
        expiresAt: new Date("2026-03-25T00:00:00.000Z"),
        subjectDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(mocks.logServerEvent).toHaveBeenCalledWith(
      "info",
      "rate_limit.allowed",
      expect.objectContaining({
        namespace: "try-demo",
        subjectDigestPrefix: expect.any(String),
      }),
    );
  });

  it("denies a fixed-window request when the bucket is already full and emits standard headers", async () => {
    const now = new Date("2026-03-24T12:34:56.000Z");
    mocks.count.mockResolvedValueOnce(1);

    const decision = await consumeRateLimit({
      namespace: "try-demo",
      subject: "ip:203.0.113.10",
      limit: 1,
      windowMs: 24 * 60 * 60 * 1000,
      algorithm: "fixed",
      now,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterMs).toBe(41104000);
    expect(mocks.create).not.toHaveBeenCalled();

    const headers = buildRateLimitHeaders(decision);
    expect(headers.get("Retry-After")).toBe("41104");
    expect(headers.get("X-RateLimit-Limit")).toBe("1");
    expect(headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(headers.get("X-RateLimit-Reset")).toBe("1774396800");
  });

  it("preserves sliding-window reset semantics based on the oldest recent hit", async () => {
    const now = new Date("2026-03-24T12:34:56.000Z");
    mocks.findMany.mockResolvedValueOnce([
      { createdAt: new Date("2026-03-24T12:34:10.000Z") },
      { createdAt: new Date("2026-03-24T12:34:40.000Z") },
    ]);

    const decision = await consumeRateLimit({
      namespace: "flatlay-validation",
      subject: "shop:shop-a.myshopify.com:ip:203.0.113.10",
      limit: 2,
      windowMs: 60 * 1000,
      algorithm: "sliding",
      now,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterMs).toBe(14000);
    expect(decision.resetAt?.toISOString()).toBe("2026-03-24T12:35:10.000Z");
  });

  it("fails open when the limiter store remains unavailable after bounded retries", async () => {
    mocks.transaction.mockRejectedValue(new Error("database unavailable"));

    const decision = await consumeRateLimit({
      namespace: "try-demo",
      subject: "ip:unknown",
      limit: 1,
      windowMs: 24 * 60 * 60 * 1000,
      algorithm: "fixed",
      now: new Date("2026-03-24T12:34:56.000Z"),
    });

    expect(decision).toMatchObject({
      allowed: true,
      enforced: false,
      storeAvailable: false,
      remaining: null,
      resetAt: null,
      retryAfterMs: null,
    });
    expect(mocks.logServerEvent).toHaveBeenCalledWith(
      "warn",
      "rate_limit.store_unavailable",
      expect.objectContaining({
        namespace: "try-demo",
        failMode: "open",
      }),
    );
  });

  it("uses an HMAC digest rather than storing the raw subject", () => {
    const digest = createRateLimitSubjectDigest("ip:203.0.113.10");

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain("203.0.113.10");
  });
});
