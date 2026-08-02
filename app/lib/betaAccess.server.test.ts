import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureShop: vi.fn(),
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    shop: {
      findUnique: mocks.shopFindUnique,
      update: mocks.shopUpdate,
    },
  },
  ensureShop: mocks.ensureShop,
}));

import { ensureBetaAccessForShop } from "./betaAccess.server";

describe("ensureBetaAccessForShop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ensures the shop exists but does not auto-grant beta access", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      betaAccess: false,
      betaStatus: null,
      betaGrantedBy: null,
    });

    await expect(
      ensureBetaAccessForShop(" Atlantic-Mood.myshopify.com "),
    ).resolves.toEqual({ granted: false, skipped: "manual_only" });

    expect(mocks.ensureShop).toHaveBeenCalledWith(
      "atlantic-mood.myshopify.com",
    );
    expect(mocks.shopFindUnique).toHaveBeenCalledWith({
      where: { id: "atlantic-mood.myshopify.com" },
      select: {
        betaAccess: true,
        betaStatus: true,
        betaGrantedBy: true,
      },
    });
    expect(mocks.shopUpdate).not.toHaveBeenCalled();
  });
});
