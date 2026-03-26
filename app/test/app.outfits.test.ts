import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  enqueueShopifySync: vi.fn(),
  cancelRunSafely: vi.fn(),
  handleRegenerateOutfit: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: mocks.authenticateAdmin,
  },
}));

vi.mock("../db.server", () => ({
  default: {
    outfit: {
      findFirst: mocks.outfitFindFirst,
      update: mocks.outfitUpdate,
    },
  },
}));

vi.mock("../lib/triggerJobs.server", () => ({
  enqueueShopifySync: mocks.enqueueShopifySync,
  cancelRunSafely: mocks.cancelRunSafely,
}));

vi.mock("../lib/triggerGeneration.server", () => ({
  handleRegenerateOutfit: mocks.handleRegenerateOutfit,
}));

import { action } from "../routes/app.outfits";

describe("app.outfits action publish_to_shopify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue({
      session: { shop: "shop-a.myshopify.com" },
    });
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.enqueueShopifySync.mockResolvedValue({ id: "run_123" });
    mocks.cancelRunSafely.mockResolvedValue(undefined);
  });

  function makeRequest(body: Record<string, unknown>) {
    return new Request("https://example.com/app/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns ok without enqueueing when the outfit is already syncing recently", async () => {
    mocks.outfitFindFirst.mockResolvedValue({
      status: "completed",
      shopifyProductId: "gid://shopify/Product/123",
      shopifySyncStatus: "syncing",
      shopifySyncedAt: new Date(),
    });

    const res = await action({
      request: makeRequest({
        intent: "publish_to_shopify",
        outfitId: "outfit-123",
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, reused: true });
    expect(mocks.enqueueShopifySync).not.toHaveBeenCalled();
    expect(mocks.outfitUpdate).not.toHaveBeenCalled();
  });

  it("enqueues a sync when the outfit is not already syncing recently", async () => {
    mocks.outfitFindFirst.mockResolvedValue({
      status: "completed",
      shopifyProductId: "gid://shopify/Product/123",
      shopifySyncStatus: "failed",
      shopifySyncedAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const res = await action({
      request: makeRequest({
        intent: "publish_to_shopify",
        outfitId: "outfit-123",
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.enqueueShopifySync).toHaveBeenCalledWith({
      outfitId: "outfit-123",
      shopId: "shop-a.myshopify.com",
      shopifyProductId: "gid://shopify/Product/123",
    });
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: "outfit-123" },
      data: { shopifySyncStatus: "syncing", jobId: "run_123" },
    });
  });

  it("swallows already-finished run cancellation during sync cancel", async () => {
    mocks.outfitFindFirst.mockResolvedValueOnce({
      jobId: "run_finished",
    });

    const res = await action({
      request: makeRequest({
        intent: "cancel_sync",
        outfitId: "outfit-123",
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.cancelRunSafely).toHaveBeenCalledWith("run_finished");
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: "outfit-123" },
      data: { shopifySyncStatus: null },
    });
  });

  it("swallows already-finished run cancellation during generation cancel", async () => {
    mocks.outfitFindFirst.mockResolvedValueOnce({
      status: "pending",
      jobId: "run_finished",
    });

    const res = await action({
      request: makeRequest({
        intent: "cancel_generation",
        outfitId: "outfit-123",
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mocks.cancelRunSafely).toHaveBeenCalledWith("run_finished");
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: "outfit-123", shopId: "shop-a.myshopify.com" },
      data: {
        status: "failed",
        errorMessage: "Cancelled by user",
        jobId: null,
      },
    });
  });
});
