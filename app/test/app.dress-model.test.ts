import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  handleTriggerGeneration: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, readFileSync: vi.fn() };
});

vi.mock("../shopify.server", () => ({
  authenticate: { admin: mocks.authenticateAdmin },
}));

vi.mock("../db.server", () => ({
  default: {
    brandStyle: { findUnique: vi.fn() },
    betaFeedback: { findFirst: vi.fn() },
    model: { findMany: vi.fn() },
    outfit: { findFirst: vi.fn(), update: vi.fn() },
  },
  ensureShop: vi.fn(),
}));

vi.mock("../lib/billing.server", () => ({
  getEffectiveEntitlements: vi.fn(),
  getMonthlyUsage: vi.fn(),
}));

vi.mock("../lib/triggerGeneration.server", () => ({
  handleTriggerGeneration: mocks.handleTriggerGeneration,
}));

vi.mock("../lib/support.server", () => ({ getSupportEmail: () => "help@example.com" }));
vi.mock("../lib/flatlayCache", () => ({ getCachedFlatLay: vi.fn(), setCachedFlatLay: vi.fn() }));

import {
  action,
  shouldRefreshUsageAfterGenerationFailure,
} from "../routes/app.dress-model";

function makeRequest(body: Record<string, unknown>) {
  return new Request("https://example.com/app/dress-model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app.dress-model action trigger_generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue({
      session: { shop: "shop-a.myshopify.com" },
    });
    mocks.handleTriggerGeneration.mockResolvedValue(
      Response.json({ outfitId: "outfit-1", shopId: "shop-a.myshopify.com", reused: false }),
    );
  });

  it("forwards shopifyProductId through to handleTriggerGeneration", async () => {
    await action({
      request: makeRequest({
        intent: "trigger_generation",
        modelId: "model-01",
        frontB64: "ZmFrZQ==",
        shopifyProductId: "gid://shopify/Product/42",
      }),
      params: {},
      context: {},
    } as any);

    expect(mocks.handleTriggerGeneration).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      expect.objectContaining({ shopifyProductId: "gid://shopify/Product/42" }),
    );
  });

  it("forwards null shopifyProductId when none is supplied", async () => {
    await action({
      request: makeRequest({
        intent: "trigger_generation",
        modelId: "model-01",
        frontB64: "ZmFrZQ==",
      }),
      params: {},
      context: {},
    } as any);

    expect(mocks.handleTriggerGeneration).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      expect.objectContaining({ shopifyProductId: null }),
    );
  });
});

describe("shouldRefreshUsageAfterGenerationFailure", () => {
  it("refreshes usage for refunded generation failures", () => {
    expect(
      shouldRefreshUsageAfterGenerationFailure(
        "We hit a storage issue while saving your image. This attempt was not counted. Please try again.",
      ),
    ).toBe(true);
  });

  it("does not refresh usage for non-refunded failures", () => {
    expect(
      shouldRefreshUsageAfterGenerationFailure(
        "Image generation failed. Please try again.",
      ),
    ).toBe(false);
    expect(shouldRefreshUsageAfterGenerationFailure(null)).toBe(false);
  });
});
