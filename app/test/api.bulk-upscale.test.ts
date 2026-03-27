import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  getEffectiveEntitlements: vi.fn(),
  canUpscale: vi.fn(),
  outfitFindFirst: vi.fn(),
  generatedImageUpdate: vi.fn(),
  enqueueUpscaleImage: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("../lib/sessionToken.server", () => ({
  getShopFromSessionToken: mocks.getShopFromSessionToken,
}));

vi.mock("../lib/billing.server", () => ({
  getEffectiveEntitlements: mocks.getEffectiveEntitlements,
}));

vi.mock("../lib/plans", () => ({
  canUpscale: mocks.canUpscale,
}));

vi.mock("../db.server", () => ({
  default: {
    outfit: {
      findFirst: mocks.outfitFindFirst,
    },
    generatedImage: {
      update: mocks.generatedImageUpdate,
    },
  },
}));

vi.mock("../lib/triggerJobs.server", () => ({
  enqueueUpscaleImage: mocks.enqueueUpscaleImage,
}));

vi.mock("../lib/observability.server", () => ({
  logServerEvent: mocks.logServerEvent,
}));

import { action } from "../routes/api.bulk-upscale";

describe("api.bulk-upscale action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mocks.getShopFromSessionToken.mockReturnValue("shop-a.myshopify.com");
    mocks.getEffectiveEntitlements.mockResolvedValue({
      publicPlan: "growth",
      isBeta: false,
    });
    mocks.canUpscale.mockReturnValue(true);
    mocks.generatedImageUpdate.mockResolvedValue({});
    mocks.enqueueUpscaleImage
      .mockResolvedValueOnce({ id: "run_1" })
      .mockResolvedValueOnce({ id: "run_2" });
  });

  function makeRequest(body: Record<string, unknown>, headers?: HeadersInit) {
    return new Request("https://example.com/api/bulk-upscale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns a JSON 401 when the session token is invalid", async () => {
    mocks.getShopFromSessionToken.mockReturnValueOnce(null);

    const res = await action({
      request: makeRequest({ outfitId: "outfit_123" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Session expired — please refresh the page.",
    });
    expect(mocks.outfitFindFirst).not.toHaveBeenCalled();
  });

  it("enqueues jobs for each eligible image in the outfit", async () => {
    mocks.outfitFindFirst.mockResolvedValue({
      status: "completed",
      images: [
        { id: "img_1", upscaleStatus: null },
        { id: "img_2", upscaleStatus: "failed" },
        { id: "img_3", upscaleStatus: "completed" },
      ],
    });

    const res = await action({
      request: makeRequest({ outfitId: "outfit_123" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      outfitId: "outfit_123",
      upscaled: 2,
    });
    expect(mocks.outfitFindFirst).toHaveBeenCalledWith({
      where: { id: "outfit_123", shopId: "shop-a.myshopify.com" },
      select: {
        status: true,
        images: { select: { id: true, upscaleStatus: true } },
      },
    });
    expect(mocks.generatedImageUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "img_1" },
      data: { upscaleStatus: "pending" },
    });
    expect(mocks.generatedImageUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "img_1" },
      data: { upscaleJobId: "run_1" },
    });
    expect(mocks.generatedImageUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: "img_2" },
      data: { upscaleStatus: "pending" },
    });
    expect(mocks.generatedImageUpdate).toHaveBeenNthCalledWith(4, {
      where: { id: "img_2" },
      data: { upscaleJobId: "run_2" },
    });
    expect(mocks.enqueueUpscaleImage).toHaveBeenNthCalledWith(1, {
      generatedImageId: "img_1",
      shopId: "shop-a.myshopify.com",
      targetScale: 2,
    });
    expect(mocks.enqueueUpscaleImage).toHaveBeenNthCalledWith(2, {
      generatedImageId: "img_2",
      shopId: "shop-a.myshopify.com",
      targetScale: 2,
    });
  });
});
