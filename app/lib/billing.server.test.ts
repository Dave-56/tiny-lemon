import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  creditCount: vi.fn(),
  transaction: vi.fn(),
  txCreditCount: vi.fn(),
  txCreateMany: vi.fn(),
  txCreate: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    shop: { findUnique: mocks.shopFindUnique },
    creditTransaction: { count: mocks.creditCount },
    $transaction: mocks.transaction,
  },
}));

import {
  BETA_DEFAULT_CAP,
  BETA_FULL_ANGLES,
  DEMO_SHOP_ID,
  PLAN_ANGLES,
  PLAN_LIMITS,
  getEffectiveEntitlements,
  refundReservedGeneration,
  reserveGenerations,
} from "./billing.server";

const originalNodeEnv = process.env.NODE_ENV;
const originalEnforceBilling = process.env.ENFORCE_BILLING;

describe("billing.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "test";
    delete process.env.ENFORCE_BILLING;

    mocks.transaction.mockImplementation(
      async (
        callback: (tx: {
          creditTransaction: {
            count: typeof mocks.txCreditCount;
            createMany: typeof mocks.txCreateMany;
            create: typeof mocks.txCreate;
          };
        }) => unknown,
      ) =>
        callback({
          creditTransaction: {
            count: mocks.txCreditCount,
            createMany: mocks.txCreateMany,
            create: mocks.txCreate,
          },
        }),
    );
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalEnforceBilling === undefined) {
      delete process.env.ENFORCE_BILLING;
    } else {
      process.env.ENFORCE_BILLING = originalEnforceBilling;
    }
  });

  it("returns beta entitlements with the default beta cap", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      plan: "Starter",
      betaAccess: true,
      betaStatus: "active",
      betaCap: null,
    });

    await expect(getEffectiveEntitlements("shop-a")).resolves.toEqual({
      publicPlan: "Starter",
      isBeta: true,
      betaStatus: "active",
      effectiveLimit: BETA_DEFAULT_CAP,
      effectiveAngles: BETA_FULL_ANGLES,
      showUpgradePrompt: false,
    });
  });

  it("falls back to plan entitlements when beta access is paused", async () => {
    mocks.shopFindUnique.mockResolvedValueOnce({
      plan: "Growth",
      betaAccess: true,
      betaStatus: "paused",
      betaCap: 250,
    });

    await expect(getEffectiveEntitlements("shop-a")).resolves.toEqual({
      publicPlan: "Growth",
      isBeta: false,
      betaStatus: "paused",
      effectiveLimit: PLAN_LIMITS.Growth,
      effectiveAngles: PLAN_ANGLES.Growth,
      showUpgradePrompt: true,
    });
  });

  it("reserves credits when usage lands exactly on the monthly limit", async () => {
    process.env.NODE_ENV = "production";
    mocks.shopFindUnique.mockResolvedValue({
      plan: "free",
      betaAccess: false,
      betaStatus: null,
      betaCap: null,
    });
    mocks.txCreditCount.mockResolvedValueOnce(2);
    mocks.txCreateMany.mockResolvedValueOnce({ count: 1 });

    const entitlements = await reserveGenerations("shop-a", 1, {
      description: "outfit generation",
    });

    expect(entitlements.effectiveLimit).toBe(PLAN_LIMITS.free);
    expect(mocks.txCreateMany).toHaveBeenCalledWith({
      data: [
        {
          shopId: "shop-a",
          type: "usage",
          amount: -1,
          description: "outfit generation",
        },
      ],
    });
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  });

  it("rejects reservations that would exceed the monthly limit", async () => {
    process.env.NODE_ENV = "production";
    mocks.shopFindUnique.mockResolvedValue({
      plan: "free",
      betaAccess: false,
      betaStatus: null,
      betaCap: null,
    });
    mocks.txCreditCount.mockResolvedValueOnce(3);

    await expect(reserveGenerations("shop-a", 1)).rejects.toThrow(
      "insufficient_credits",
    );
    expect(mocks.txCreateMany).not.toHaveBeenCalled();
  });

  it("skips billing writes outside production unless billing enforcement is enabled", async () => {
    mocks.shopFindUnique.mockResolvedValue({
      plan: "free",
      betaAccess: false,
      betaStatus: null,
      betaCap: null,
    });
    mocks.txCreditCount.mockResolvedValueOnce(99);

    const entitlements = await reserveGenerations("shop-a", 1);

    expect(entitlements.effectiveLimit).toBe(PLAN_LIMITS.free);
    expect(mocks.txCreateMany).not.toHaveBeenCalled();
  });

  it("does not refund demo-shop usage", async () => {
    await expect(
      refundReservedGeneration(DEMO_SHOP_ID, {
        reservationDescription: "generation reservation:test",
        refundDescription: "generation refund:test",
      }),
    ).resolves.toBe(false);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not create a refund when the matching reservation count is too small", async () => {
    mocks.txCreditCount.mockImplementation(async ({ where }) => {
      if (where.type === "usage") return 0;
      if (where.type === "refund") return 0;
      return 0;
    });

    await expect(
      refundReservedGeneration("shop-a", {
        count: 2,
        reservationDescription: "generation reservation:test",
        refundDescription: "generation refund:test",
      }),
    ).resolves.toBe(false);

    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("does not create a duplicate refund for the same reservation", async () => {
    mocks.txCreditCount.mockImplementation(async ({ where }) => {
      if (where.type === "usage") return 1;
      if (where.type === "refund") return 1;
      return 0;
    });

    await expect(
      refundReservedGeneration("shop-a", {
        reservationDescription: "generation reservation:test",
        refundDescription: "generation refund:test",
      }),
    ).resolves.toBe(false);

    expect(mocks.txCreate).not.toHaveBeenCalled();
  });

  it("creates a refund once when a matching reservation exists and no refund was issued yet", async () => {
    mocks.txCreditCount.mockImplementation(async ({ where }) => {
      if (where.type === "usage") return 2;
      if (where.type === "refund") return 0;
      return 0;
    });
    mocks.txCreate.mockResolvedValueOnce({ id: "refund-1" });

    await expect(
      refundReservedGeneration("shop-a", {
        count: 2,
        reservationDescription: "generation reservation:test",
        refundDescription: "generation refund:test",
      }),
    ).resolves.toBe(true);

    expect(mocks.txCreate).toHaveBeenCalledWith({
      data: {
        shopId: "shop-a",
        type: "refund",
        amount: 2,
        description: "generation refund:test",
      },
    });
  });
});
