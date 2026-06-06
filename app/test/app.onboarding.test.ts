import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  ensureShop: vi.fn(),
  getEffectiveEntitlements: vi.fn(),
  brandStyleUpsert: vi.fn(),
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(),
  shopifyRedirect: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: { admin: mocks.authenticateAdmin },
}));

vi.mock("../db.server", () => ({
  default: {
    brandStyle: {
      upsert: mocks.brandStyleUpsert,
    },
    shop: {
      findUnique: mocks.shopFindUnique,
      update: mocks.shopUpdate,
    },
  },
  ensureShop: mocks.ensureShop,
}));

vi.mock("../lib/billing.server", () => ({
  getEffectiveEntitlements: mocks.getEffectiveEntitlements,
}));

vi.mock("../shopify-params", () => ({
  shopifyRedirect: mocks.shopifyRedirect,
}));

import { action } from "../routes/app.onboarding";

function makeFormRequest(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request("https://example.com/app/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("app.onboarding action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue({
      session: { shop: "still-cloth.myshopify.com" },
    });
    mocks.getEffectiveEntitlements.mockResolvedValue({
      effectiveAngles: ["front", "three-quarter", "back"],
    });
    mocks.shopFindUnique.mockResolvedValue({ catalogType: "unisex" });
    mocks.shopUpdate.mockResolvedValue({});
    mocks.shopifyRedirect.mockReturnValue(new Response(null, { status: 302 }));
  });

  it("saves a single default shoot style and derives lightweight brand profile fields", async () => {
    const res = await action({
      request: makeFormRequest({ brandStyleId: "street" }),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(302);
    expect(mocks.ensureShop).toHaveBeenCalledWith("still-cloth.myshopify.com");
    expect(mocks.brandStyleUpsert).toHaveBeenCalledWith({
      where: { shopId: "still-cloth.myshopify.com" },
      update: expect.objectContaining({
        brandStyleId: "street",
        brandEnergy: "street",
        primaryCategory: "unisex",
        pricePoint: null,
        onboardingCompleted: true,
      }),
      create: expect.objectContaining({
        shopId: "still-cloth.myshopify.com",
        angleIds: ["front", "three-quarter", "back"],
        brandStyleId: "street",
        brandEnergy: "street",
        primaryCategory: "unisex",
        pricePoint: null,
        onboardingCompleted: true,
      }),
    });
    expect(mocks.shopUpdate).toHaveBeenCalledWith({
      where: { id: "still-cloth.myshopify.com" },
      data: { betaOnboardingCompleted: true },
    });
    expect(mocks.shopifyRedirect).toHaveBeenCalledWith(
      expect.any(Request),
      "/app/dress-model",
    );
  });

  it("rejects an invalid shoot style", async () => {
    await expect(
      action({
        request: makeFormRequest({ brandStyleId: "not-real" }),
        params: {},
        context: {},
      } as any),
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.brandStyleUpsert).not.toHaveBeenCalled();
  });
});
