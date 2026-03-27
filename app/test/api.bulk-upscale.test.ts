import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  handleBulkUpscaleRequest: vi.fn(),
}));

vi.mock("../lib/sessionToken.server", () => ({
  getShopFromSessionToken: mocks.getShopFromSessionToken,
}));

vi.mock("../lib/upscaleOrchestration.server", () => ({
  handleBulkUpscaleRequest: mocks.handleBulkUpscaleRequest,
}));

import { action } from "../routes/api.bulk-upscale";

describe("api.bulk-upscale action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mocks.getShopFromSessionToken.mockReturnValue("shop-a.myshopify.com");
    mocks.handleBulkUpscaleRequest.mockResolvedValue(
      Response.json({ ok: true, outfitId: "outfit_123", upscaled: 2, jobId: "run_bulk" }),
    );
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
    expect(mocks.handleBulkUpscaleRequest).not.toHaveBeenCalled();
  });

  it("delegates valid requests to shared bulk orchestration", async () => {
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
      jobId: "run_bulk",
    });
    expect(mocks.handleBulkUpscaleRequest).toHaveBeenCalledWith({
      outfitId: "outfit_123",
      shopId: "shop-a.myshopify.com",
      targetScale: 2,
    });
  });
});
