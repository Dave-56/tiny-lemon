import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  modelFindFirst: vi.fn(),
  brandStyleFindUnique: vi.fn(),
  outfitFindFirst: vi.fn(),
  outfitUpsert: vi.fn(),
  outfitUpdate: vi.fn(),
  ensureShop: vi.fn(),
  uploadBufferToBlob: vi.fn(),
  triggerTask: vi.fn(),
  reserveGenerations: vi.fn(),
  refundReservedGeneration: vi.fn(),
  getMonthlyUsage: vi.fn(),
  getEffectiveEntitlements: vi.fn(),
  claimGenerateRequestIdempotency: vi.fn(),
  claimRegenerateRequestIdempotency: vi.fn(),
  markRequestEnqueued: vi.fn(),
  markRequestFailed: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    model: { findFirst: mocks.modelFindFirst },
    brandStyle: { findUnique: mocks.brandStyleFindUnique },
    outfit: {
      upsert: mocks.outfitUpsert,
      update: mocks.outfitUpdate,
      findFirst: mocks.outfitFindFirst,
    },
  },
  ensureShop: mocks.ensureShop,
}));

vi.mock("../blob.server", () => ({
  uploadBufferToBlob: mocks.uploadBufferToBlob,
}));

vi.mock("../trigger.server", () => ({
  tasks: { trigger: mocks.triggerTask },
}));

vi.mock("./billing.server", () => ({
  DEMO_SHOP_ID: "__demo__",
  PLAN_LIMITS: {
    free: 3,
    Starter: 30,
    Growth: 100,
    Scale: 300,
  },
  PLAN_ANGLES: {
    free: ["front"],
    Starter: ["front", "three-quarter", "back"],
    Growth: ["front", "three-quarter", "back"],
    Scale: ["front", "three-quarter", "back"],
  },
  reserveGenerations: mocks.reserveGenerations,
  refundReservedGeneration: mocks.refundReservedGeneration,
  getMonthlyUsage: mocks.getMonthlyUsage,
  getEffectiveEntitlements: mocks.getEffectiveEntitlements,
}));

vi.mock("./requestIdempotency.server", () => ({
  claimGenerateRequestIdempotency: mocks.claimGenerateRequestIdempotency,
  claimRegenerateRequestIdempotency: mocks.claimRegenerateRequestIdempotency,
  markRequestEnqueued: mocks.markRequestEnqueued,
  markRequestFailed: mocks.markRequestFailed,
}));

import {
  handleRegenerateOutfit,
  handleTriggerGeneration,
} from "./triggerGeneration.server";

describe("handleTriggerGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandStyleFindUnique.mockResolvedValue(null);
    mocks.outfitFindFirst.mockResolvedValue({
      status: "completed",
      cleanFlatLayUrl: "https://blob.example/flat.png",
      modelId: "model-01",
      brandStyleId: "minimal",
    });
    mocks.outfitUpsert.mockResolvedValue({ id: "outfit-123" });
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.uploadBufferToBlob.mockResolvedValue("https://blob.example/outfit.png");
    mocks.triggerTask.mockResolvedValue({ id: "run_123" });
    mocks.reserveGenerations.mockResolvedValue({
      publicPlan: "Starter",
      isBeta: false,
      betaStatus: null,
      effectiveLimit: 30,
      effectiveAngles: ["front", "three-quarter", "back"],
      showUpgradePrompt: true,
    });
    mocks.refundReservedGeneration.mockResolvedValue(true);
    mocks.getMonthlyUsage.mockResolvedValue(0);
    mocks.getEffectiveEntitlements.mockResolvedValue({
      publicPlan: "Starter",
      isBeta: false,
      betaStatus: null,
      effectiveLimit: 30,
      effectiveAngles: ["front", "three-quarter", "back"],
      showUpgradePrompt: true,
    });
    mocks.claimGenerateRequestIdempotency.mockResolvedValue({
      disposition: "owned",
      outfitId: "outfit-123",
      jobId: null,
      runToken: "run-token-generate",
      status: "pending",
    });
    mocks.claimRegenerateRequestIdempotency.mockResolvedValue({
      disposition: "owned",
      outfitId: "outfit-123",
      jobId: null,
      runToken: "run-token-regenerate",
      status: "pending",
    });
    mocks.markRequestEnqueued.mockResolvedValue(true);
    mocks.markRequestFailed.mockResolvedValue(true);
  });

  it("rejects unknown models before reserving credits", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "missing-model",
      modelImageUrl: "https://evil.example/spoof.png",
      frontB64: "ZmFrZQ==",
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Model not found." });
    expect(mocks.reserveGenerations).not.toHaveBeenCalled();
    expect(mocks.outfitUpsert).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("rejects models owned by another shop before reserving credits", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "custom-model-from-shop-b",
      modelImageUrl: "https://axuxhuif6aiflbu8.public.blob.vercel-storage.com/spoof.png",
      frontB64: "ZmFrZQ==",
    });

    expect(res.status).toBe(400);
    expect(mocks.reserveGenerations).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("reuses an in-flight generate request before reserving credits", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.claimGenerateRequestIdempotency.mockResolvedValueOnce({
      disposition: "reused",
      outfitId: "outfit-reused",
      jobId: "run_reused",
      status: "pending",
    });

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "model-01",
      frontB64: "ZmFrZQ==",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      outfitId: "outfit-reused",
      shopId: "shop-a.myshopify.com",
      reused: true,
      jobId: "run_reused",
    });
    expect(mocks.reserveGenerations).not.toHaveBeenCalled();
    expect(mocks.outfitUpsert).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("uses the server-resolved preset model instead of client-supplied model data", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "model-01",
      modelImageUrl: "https://attacker.example/not-used.png",
      modelGender: "Wrong",
      modelHeight: "Wrong",
      frontB64: "ZmFrZQ==",
      frontMime: "image/png",
    });

    expect(res.status).toBe(200);
    expect(mocks.reserveGenerations).toHaveBeenCalledTimes(1);
    expect(mocks.markRequestEnqueued).toHaveBeenCalledWith({
      shopId: "shop-a.myshopify.com",
      operation: "generate",
      requestKey: expect.any(String),
      runToken: "run-token-generate",
      jobId: "run_123",
    });
    expect(mocks.triggerTask).toHaveBeenCalledWith(
      "generate-outfit",
      expect.objectContaining({
        modelImageUrl:
          "https://axuxhuif6aiflbu8.public.blob.vercel-storage.com/preset-models/v3/model-01.png",
        modelGender: "Female",
        modelHeight: "5'10\" (178cm)",
      })
    );
  });

  it("returns plan usage details when credits are exhausted", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.reserveGenerations.mockRejectedValueOnce(new Error("insufficient_credits"));
    mocks.getMonthlyUsage.mockResolvedValueOnce(3);
    mocks.getEffectiveEntitlements.mockResolvedValueOnce({
      publicPlan: "free",
      isBeta: false,
      betaStatus: null,
      effectiveLimit: 3,
      effectiveAngles: ["front"],
      showUpgradePrompt: true,
    });

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "model-01",
      frontB64: "ZmFrZQ==",
    });

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toEqual({
      error: "limit_reached",
      used: 3,
      limit: 3,
      plan: "free",
      isBeta: false,
      message: "You've used all your generations this month. Upgrade to continue.",
    });
    expect(mocks.outfitUpsert).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("refunds when enqueue fails after reservation succeeds", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.triggerTask.mockRejectedValueOnce(new Error("Trigger unavailable"));

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "model-01",
      frontB64: "ZmFrZQ==",
    });

    expect(res.status).toBe(500);
    expect(mocks.refundReservedGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      expect.objectContaining({
        reservationDescription: expect.stringMatching(/^generation reservation:generate:model-01:/),
        refundDescription: expect.stringMatching(/^generation refund:generate:model-01:.*:pre_enqueue_failure$/),
      }),
    );
    expect(mocks.markRequestFailed).toHaveBeenCalledWith({
      shopId: "shop-a.myshopify.com",
      operation: "generate",
      requestKey: expect.any(String),
      runToken: "run-token-generate",
    });
  });

  it("does not refund when enqueue succeeded but jobId persistence fails", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.outfitUpdate.mockRejectedValueOnce(new Error("DB write failed"));

    const res = await handleTriggerGeneration("shop-a.myshopify.com", {
      modelId: "model-01",
      frontB64: "ZmFrZQ==",
    });

    expect(res.status).toBe(500);
    expect(mocks.refundReservedGeneration).not.toHaveBeenCalled();
    expect(mocks.markRequestFailed).not.toHaveBeenCalled();
  });
});

describe("handleRegenerateOutfit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandStyleFindUnique.mockResolvedValue(null);
    mocks.outfitFindFirst.mockResolvedValue({
      status: "completed",
      cleanFlatLayUrl: "https://blob.example/flat.png",
      modelId: "model-01",
      brandStyleId: "minimal",
    });
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.triggerTask.mockResolvedValue({ id: "run_123" });
    mocks.reserveGenerations.mockResolvedValue({
      publicPlan: "Starter",
      isBeta: false,
      betaStatus: null,
      effectiveLimit: 30,
      effectiveAngles: ["front", "three-quarter", "back"],
      showUpgradePrompt: true,
    });
    mocks.refundReservedGeneration.mockResolvedValue(true);
    mocks.getMonthlyUsage.mockResolvedValue(0);
    mocks.getEffectiveEntitlements.mockResolvedValue({
      publicPlan: "Starter",
      isBeta: false,
      betaStatus: null,
      effectiveLimit: 30,
      effectiveAngles: ["front", "three-quarter", "back"],
      showUpgradePrompt: true,
    });
    mocks.claimRegenerateRequestIdempotency.mockResolvedValue({
      disposition: "owned",
      outfitId: "outfit-123",
      jobId: null,
      runToken: "run-token-regenerate",
      status: "pending",
    });
    mocks.markRequestEnqueued.mockResolvedValue(true);
    mocks.markRequestFailed.mockResolvedValue(true);
  });

  it("reuses an in-flight regenerate request before reserving credits", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.claimRegenerateRequestIdempotency.mockResolvedValueOnce({
      disposition: "reused",
      outfitId: "outfit-123",
      jobId: "run_reused",
      status: "enqueued",
    });

    const res = await handleRegenerateOutfit(
      "shop-a.myshopify.com",
      "outfit-123",
      "warmer lighting",
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      outfitId: "outfit-123",
      reused: true,
      jobId: "run_reused",
    });
    expect(mocks.reserveGenerations).not.toHaveBeenCalled();
    expect(mocks.triggerTask).not.toHaveBeenCalled();
  });

  it("refunds regenerate when enqueue fails after reservation succeeds", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.triggerTask.mockRejectedValueOnce(new Error("Trigger unavailable"));

    const res = await handleRegenerateOutfit(
      "shop-a.myshopify.com",
      "outfit-123",
      "warmer lighting",
    );

    expect(res.status).toBe(500);
    expect(mocks.refundReservedGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      expect.objectContaining({
        reservationDescription: expect.stringMatching(/^generation reservation:regenerate:outfit-123:/),
        refundDescription: expect.stringMatching(/^generation refund:regenerate:outfit-123:.*:pre_enqueue_failure$/),
      }),
    );
    expect(mocks.markRequestFailed).toHaveBeenCalledWith({
      shopId: "shop-a.myshopify.com",
      operation: "regenerate",
      requestKey: expect.any(String),
      runToken: "run-token-regenerate",
    });
  });

  it("does not refund regenerate when enqueue succeeded but jobId persistence fails", async () => {
    mocks.modelFindFirst.mockResolvedValue(null);
    mocks.outfitUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("DB write failed"));

    const res = await handleRegenerateOutfit(
      "shop-a.myshopify.com",
      "outfit-123",
    );

    expect(res.status).toBe(500);
    expect(mocks.refundReservedGeneration).not.toHaveBeenCalled();
    expect(mocks.markRequestFailed).not.toHaveBeenCalled();
  });
});
