import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  handleVideoGenerateRequest: vi.fn(),
}));

vi.mock("../lib/sessionToken.server", () => ({
  getShopFromSessionToken: mocks.getShopFromSessionToken,
}));

vi.mock("../lib/videoOrchestration.server", () => ({
  handleVideoGenerateRequest: mocks.handleVideoGenerateRequest,
}));

import { action } from "../routes/api.generate-video";

describe("api.generate-video action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mocks.getShopFromSessionToken.mockReturnValue("shop-a.myshopify.com");
    mocks.handleVideoGenerateRequest.mockResolvedValue(
      Response.json({ ok: true, outfitId: "outfit_123", jobId: "run_456" }),
    );
  });

  function makeRequest(body: Record<string, unknown>, headers?: HeadersInit) {
    return new Request("https://example.com/api/generate-video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when the session token is invalid", async () => {
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
    expect(mocks.handleVideoGenerateRequest).not.toHaveBeenCalled();
  });

  it("returns 400 when outfitId is missing", async () => {
    const res = await action({
      request: makeRequest({}),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Missing required field: outfitId",
    });
    expect(mocks.handleVideoGenerateRequest).not.toHaveBeenCalled();
  });

  it("delegates valid requests to video orchestration", async () => {
    const res = await action({
      request: makeRequest({ outfitId: "outfit_123" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      outfitId: "outfit_123",
      jobId: "run_456",
    });
    expect(mocks.handleVideoGenerateRequest).toHaveBeenCalledWith({
      outfitId: "outfit_123",
      shopId: "shop-a.myshopify.com",
    });
  });

  it("returns 405 for non-POST requests", async () => {
    const res = await action({
      request: new Request("https://example.com/api/generate-video", {
        method: "GET",
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(405);
  });
});
