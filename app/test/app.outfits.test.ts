import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  triggerTask: vi.fn(),
  runsCancel: vi.fn(),
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

vi.mock("../trigger.server", () => ({
  tasks: { trigger: mocks.triggerTask },
  runs: { cancel: mocks.runsCancel },
}));

vi.mock("../lib/triggerGeneration.server", () => ({
  handleRegenerateOutfit: vi.fn(),
}));

import { action } from "../routes/app.outfits";

describe("app.outfits action publish_to_shopify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue({
      session: { shop: "shop-a.myshopify.com" },
    });
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.triggerTask.mockResolvedValue({ id: "run_123" });
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
    expect(mocks.triggerTask).not.toHaveBeenCalled();
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
    expect(mocks.triggerTask).toHaveBeenCalledWith("sync-outfit-to-shopify", {
      outfitId: "outfit-123",
      shopId: "shop-a.myshopify.com",
      shopifyProductId: "gid://shopify/Product/123",
    });
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: "outfit-123" },
      data: { shopifySyncStatus: "syncing", jobId: "run_123" },
    });
  });
});
