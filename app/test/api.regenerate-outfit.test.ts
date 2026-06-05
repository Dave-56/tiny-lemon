import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getShopFromSessionToken: vi.fn(),
  handleRegenerateOutfit: vi.fn(),
}));

vi.mock("../lib/sessionToken.server", () => ({
  getShopFromSessionToken: mocks.getShopFromSessionToken,
}));

vi.mock("../lib/triggerGeneration.server", () => ({
  handleRegenerateOutfit: mocks.handleRegenerateOutfit,
}));

import { action } from "../routes/api.regenerate-outfit";

describe("api.regenerate-outfit action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_API_SECRET = "test-secret";
    mocks.getShopFromSessionToken.mockReturnValue("shop-a.myshopify.com");
    mocks.handleRegenerateOutfit.mockResolvedValue(
      Response.json({ ok: true, outfitId: "outfit-1" }),
    );
  });

  function makeRequest(body: Record<string, unknown>, headers = {}) {
    return new Request("https://example.com/api/regenerate-outfit", {
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
    mocks.getShopFromSessionToken.mockReturnValue(null);

    const res = await action({
      request: makeRequest({ outfitId: "outfit-1" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: "Session expired — please refresh the page.",
    });
    expect(mocks.handleRegenerateOutfit).not.toHaveBeenCalled();
  });

  it("regenerates for the shop from the session token", async () => {
    const res = await action({
      request: makeRequest({
        outfitId: "outfit-1",
        userDirection: "Warmer lighting",
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    expect(mocks.getShopFromSessionToken).toHaveBeenCalledWith(
      "Bearer token",
      "test-secret",
    );
    expect(mocks.handleRegenerateOutfit).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      "outfit-1",
      "Warmer lighting",
      undefined,
    );
  });

  it("passes a scoped target pose to regenerate orchestration", async () => {
    const res = await action({
      request: makeRequest({
        outfitId: "outfit-1",
        userDirection: "Less shadow",
        targetPoses: ["front"],
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(200);
    expect(mocks.handleRegenerateOutfit).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      "outfit-1",
      "Less shadow",
      ["front"],
    );
  });

  it("rejects invalid target poses", async () => {
    const res = await action({
      request: makeRequest({
        outfitId: "outfit-1",
        targetPoses: ["side"],
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid target pose" });
    expect(mocks.handleRegenerateOutfit).not.toHaveBeenCalled();
  });

  it("rejects multi-pose scoped regeneration for v1", async () => {
    const res = await action({
      request: makeRequest({
        outfitId: "outfit-1",
        targetPoses: ["front", "back"],
      }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Regenerate one image at a time",
    });
  });
});
