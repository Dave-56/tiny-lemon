import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
}));

vi.mock("./rateLimit.server", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import {
  consumeReplicatePredictionCreateSlot,
  getReplicatePredictionCreateWindowMs,
  getReplicateThrottleRetryAfterMs,
} from "./replicatePredictionThrottle.server";

describe("replicatePredictionThrottle.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.REPLICATE_PREDICTION_CREATE_LIMIT;
    delete process.env.REPLICATE_PREDICTION_CREATE_WINDOW_MS;
    mocks.consumeRateLimit.mockResolvedValue({
      allowed: true,
      enforced: true,
      storeAvailable: true,
      limit: 1,
      remaining: 0,
      resetAt: null,
      retryAfterMs: null,
      subjectDigest: "digest",
      algorithm: "sliding",
    });
  });

  it("uses a durable sliding-window limiter for replicate prediction creation", async () => {
    await consumeReplicatePredictionCreateSlot();

    expect(mocks.consumeRateLimit).toHaveBeenCalledWith({
      namespace: "replicate-prediction-create",
      subject: "replicate-account",
      limit: 1,
      windowMs: 10_000,
      algorithm: "sliding",
    });
  });

  it("parses retry-after from response headers", () => {
    const error = {
      response: {
        status: 429,
        headers: new Headers({ "retry-after": "9" }),
      },
    };

    expect(getReplicateThrottleRetryAfterMs(error)).toBe(9000);
  });

  it("falls back to the configured window when retry-after is missing", () => {
    process.env.REPLICATE_PREDICTION_CREATE_WINDOW_MS = "12000";

    const error = {
      message: "Request failed with status 429 Too Many Requests",
      response: {
        status: 429,
        headers: new Headers(),
      },
    };

    expect(getReplicatePredictionCreateWindowMs()).toBe(12_000);
    expect(getReplicateThrottleRetryAfterMs(error)).toBe(12_000);
  });
});
