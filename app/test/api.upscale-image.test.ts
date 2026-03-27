import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  getEffectiveEntitlements: vi.fn(),
  canUpscale: vi.fn(),
  generatedImageFindFirst: vi.fn(),
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
    generatedImage: {
      findFirst: mocks.generatedImageFindFirst,
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

import { action } from "../routes/api.upscale-image";

describe("api.upscale-image action", () => {
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
    mocks.enqueueUpscaleImage.mockResolvedValue({ id: "run_123" });
  });

  function makeRequest(body: Record<string, unknown>, headers?: HeadersInit) {
    return new Request("https://example.com/api/upscale-image", {
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
      request: makeRequest({ generatedImageId: "img_123" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Session expired — please refresh the page.",
    });
    expect(mocks.generatedImageFindFirst).not.toHaveBeenCalled();
  });

  it("enqueues an upscale job for a valid request", async () => {
    mocks.generatedImageFindFirst.mockResolvedValue({
      id: "img_123",
      upscaleStatus: null,
      outfit: { status: "completed" },
    });

    const res = await action({
      request: makeRequest({ generatedImageId: "img_123" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      generatedImageId: "img_123",
      jobId: "run_123",
    });
    expect(mocks.generatedImageFindFirst).toHaveBeenCalledWith({
      where: { id: "img_123", shopId: "shop-a.myshopify.com" },
      select: {
        id: true,
        upscaleStatus: true,
        outfit: { select: { status: true } },
      },
    });
    expect(mocks.generatedImageUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "img_123" },
      data: { upscaleStatus: "pending" },
    });
    expect(mocks.enqueueUpscaleImage).toHaveBeenCalledWith({
      generatedImageId: "img_123",
      shopId: "shop-a.myshopify.com",
      targetScale: 2,
    });
    expect(mocks.generatedImageUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "img_123" },
      data: { upscaleJobId: "run_123" },
    });
  });
});
