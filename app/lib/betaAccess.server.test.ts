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

import { BETA_STATUS } from "./beta";
import { BETA_DEFAULT_CAP } from "./billing.server";
import { ensureBetaAccessForShop } from "./betaAccess.server";

describe("ensureBetaAccessForShop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("grants default beta access with the default cap for a shop that is not already beta", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      betaAccess: false,
      betaStatus: null,
      betaCap: null,
      betaGrantedBy: null,
    });
    mocks.shopUpdate.mockResolvedValueOnce({});

    await expect(
      ensureBetaAccessForShop(" Atlantic-Mood.myshopify.com "),
    ).resolves.toEqual({ granted: true });

    expect(mocks.ensureShop).toHaveBeenCalledWith(
      "atlantic-mood.myshopify.com",
    );
    expect(mocks.shopFindUnique).toHaveBeenCalledWith({
      where: { id: "atlantic-mood.myshopify.com" },
      select: {
        betaAccess: true,
        betaStatus: true,
        betaCap: true,
        betaGrantedBy: true,
      },
    });
    expect(mocks.shopUpdate).toHaveBeenCalledWith({
      where: { id: "atlantic-mood.myshopify.com" },
      data: {
        betaAccess: true,
        betaStatus: BETA_STATUS.invited,
        betaCap: BETA_DEFAULT_CAP,
        betaGrantedAt: expect.any(Date),
        betaGrantedBy: "default_beta",
      },
    });
  });

  it("does not re-enable paused or ended beta shops", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      betaAccess: false,
      betaStatus: BETA_STATUS.paused,
      betaCap: null,
      betaGrantedBy: null,
    });

    await expect(ensureBetaAccessForShop("shop-a.myshopify.com")).resolves.toEqual({
      granted: false,
      skipped: BETA_STATUS.paused,
    });

    expect(mocks.shopUpdate).not.toHaveBeenCalled();
  });

  it("keeps default-beta shops aligned with the current default cap", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      betaAccess: true,
      betaStatus: BETA_STATUS.active,
      betaCap: 50,
      betaGrantedBy: "default_beta",
    });
    mocks.shopUpdate.mockResolvedValueOnce({});

    await expect(ensureBetaAccessForShop("shop-a.myshopify.com")).resolves.toEqual({
      granted: false,
      skipped: "already_granted",
    });

    expect(mocks.shopUpdate).toHaveBeenCalledWith({
      where: { id: "shop-a.myshopify.com" },
      data: { betaCap: BETA_DEFAULT_CAP },
    });
  });

  it("preserves manually granted beta caps", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      betaAccess: true,
      betaStatus: BETA_STATUS.active,
      betaCap: 150,
      betaGrantedBy: "support",
    });

    await expect(ensureBetaAccessForShop("shop-a.myshopify.com")).resolves.toEqual({
      granted: false,
      skipped: "already_granted",
    });

    expect(mocks.shopUpdate).not.toHaveBeenCalled();
  });
});
