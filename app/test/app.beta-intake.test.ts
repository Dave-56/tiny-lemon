import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(),
  ensureShop: vi.fn(),
  shopUpdate: vi.fn(),
  shopifyRedirect: vi.fn(),
}));

vi.mock("../shopify.server", () => ({
  authenticate: { admin: mocks.authenticateAdmin },
}));

vi.mock("../db.server", () => ({
  default: {
    shop: {
      update: mocks.shopUpdate,
    },
  },
  ensureShop: mocks.ensureShop,
}));

vi.mock("../shopify-params", () => ({
  shopifyRedirect: mocks.shopifyRedirect,
}));

import { action } from "../routes/app.beta-intake";

function makeFormRequest(fields: Array<[string, string]>) {
  const body = new URLSearchParams();
  for (const [key, value] of fields) {
    body.append(key, value);
  }

  return new Request("https://example.com/app/beta-intake", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("app.beta-intake action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAdmin.mockResolvedValue({
      session: { shop: "atlantic-mood.myshopify.com" },
    });
    mocks.shopifyRedirect.mockReturnValue(new Response(null, { status: 302 }));
  });

  it("stores launch, styling, graphic, output, and contact intake fields", async () => {
    const res = await action({
      request: makeFormRequest([
        ["contactEmail", "rita@example.com"],
        ["storeUrl", "https://www.atlanticmood.es/"],
        ["catalogType", "unisex"],
        ["skuVolume", "11-50"],
        ["photoWorkflow", "mixed"],
        ["biggestPain", "inconsistency"],
        ["intendedUseCase", "PDP images"],
        ["launchStage", "pre-launch brand"],
        ["shootGoal", "both product photos and styled looks"],
        ["heroProductFocus", "product must stay exact"],
        ["stylingSupport", "yes, style the rest of the outfit"],
        ["graphicSensitivity", "logos/text/graphics must be preserved"],
        ["outputChannels", "model photos"],
        ["outputChannels", "publish to Shopify"],
        ["intakeNotes", "Launching a new brand and needs consistent models."],
      ]),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(302);
    expect(mocks.ensureShop).toHaveBeenCalledWith("atlantic-mood.myshopify.com");
    expect(mocks.shopUpdate).toHaveBeenCalledWith({
      where: { id: "atlantic-mood.myshopify.com" },
      data: expect.objectContaining({
        contactEmail: "rita@example.com",
        storeUrl: "https://www.atlanticmood.es/",
        catalogType: "unisex",
        launchStage: "pre-launch brand",
        shootGoal: "both product photos and styled looks",
        heroProductFocus: "product must stay exact",
        stylingSupport: "yes, style the rest of the outfit",
        graphicSensitivity: "logos/text/graphics must be preserved",
        outputChannels: ["model photos", "publish to Shopify"],
        intakeNotes: "Launching a new brand and needs consistent models.",
        betaIntakeCompleted: true,
      }),
    });
    expect(mocks.shopifyRedirect).toHaveBeenCalledWith(
      expect.any(Request),
      "/app/onboarding",
    );
    expect(mocks.shopUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shopifyRedirect.mock.invocationCallOrder[0],
    );
  });

  it("can save an existing profile and return to the app", async () => {
    const res = await action({
      request: makeFormRequest([
        ["nextPath", "/app/dress-model"],
        ["shootGoal", "single product photos"],
        ["heroProductFocus", "product must stay exact"],
      ]),
      params: {},
      context: {},
    } as any);

    expect(res.status).toBe(302);
    expect(mocks.shopUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shootGoal: "single product photos",
          heroProductFocus: "product must stay exact",
          betaIntakeCompleted: true,
        }),
      }),
    );
    expect(mocks.shopifyRedirect).toHaveBeenCalledWith(
      expect.any(Request),
      "/app/dress-model",
    );
  });
});
