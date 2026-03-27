import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  handleSingleUpscaleRequest: vi.fn(),
}));

vi.mock("../lib/sessionToken.server", () => ({
  getShopFromSessionToken: mocks.getShopFromSessionToken,
}));

vi.mock("../lib/upscaleOrchestration.server", () => ({
  handleSingleUpscaleRequest: mocks.handleSingleUpscaleRequest,
}));

import { action } from "../routes/api.upscale-image";

describe("api.upscale-image action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mocks.getShopFromSessionToken.mockReturnValue("shop-a.myshopify.com");
    mocks.handleSingleUpscaleRequest.mockResolvedValue(
      Response.json({ ok: true, generatedImageId: "img_123", jobId: "run_123" }),
    );
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
    expect(mocks.handleSingleUpscaleRequest).not.toHaveBeenCalled();
  });

  it("delegates valid requests to shared single-image orchestration", async () => {
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
    expect(mocks.handleSingleUpscaleRequest).toHaveBeenCalledWith({
      generatedImageId: "img_123",
      shopId: "shop-a.myshopify.com",
      targetScale: 2,
    });
  });
});
