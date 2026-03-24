import { Prisma } from "@prisma/client";
import prisma from "../db.server";

/** Demo shop id for public /try free tool. No credits; rate limit only. */
export const DEMO_SHOP_ID = process.env.DEMO_SHOP_ID ?? "__demo__";
export const BETA_DEFAULT_CAP = 100;
export const BETA_FULL_ANGLES = ["front", "three-quarter", "back"] as const;

export const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  Starter: 30,
  Growth: 100,
  Scale: 300,
};

// Angles allowed per plan. Enforced server-side in the action.
export const PLAN_ANGLES: Record<string, string[]> = {
  free: ["front"],
  Starter: ["front", "three-quarter", "back"],
  Growth: ["front", "three-quarter", "back"],
  Scale: ["front", "three-quarter", "back"],
};

type ReserveGenerationsOptions = {
  description?: string;
};

type RefundReservationArgs = {
  count?: number;
  reservationDescription: string;
  refundDescription: string;
};

export type EffectiveEntitlements = {
  publicPlan: string;
  isBeta: boolean;
  betaStatus: string | null;
  effectiveLimit: number;
  effectiveAngles: readonly string[];
  showUpgradePrompt: boolean;
};

function startOfCalendarMonth(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getMonthlyUsage(shopId: string): Promise<number> {
  return prisma.creditTransaction.count({
    where: {
      shopId,
      type: "usage",
      createdAt: { gte: startOfCalendarMonth() },
    },
  });
}

export async function getPlanForShop(shopId: string): Promise<string> {
  if (shopId === DEMO_SHOP_ID) return "free";
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { plan: true },
  });
  return shop?.plan ?? "free";
}

export async function getEffectiveEntitlements(
  shopId: string,
): Promise<EffectiveEntitlements> {
  if (shopId === DEMO_SHOP_ID) {
    return {
      publicPlan: "free",
      isBeta: false,
      betaStatus: null,
      effectiveLimit: PLAN_LIMITS.free,
      effectiveAngles: PLAN_ANGLES.free,
      showUpgradePrompt: true,
    };
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      plan: true,
      betaAccess: true,
      betaStatus: true,
      betaCap: true,
    },
  });

  const publicPlan = shop?.plan ?? "free";
  const betaStatus = shop?.betaStatus ?? null;
  const isBeta =
    shop?.betaAccess === true &&
    betaStatus !== "paused" &&
    betaStatus !== "ended";

  if (isBeta) {
    return {
      publicPlan,
      isBeta: true,
      betaStatus,
      effectiveLimit: shop?.betaCap ?? BETA_DEFAULT_CAP,
      effectiveAngles: BETA_FULL_ANGLES,
      showUpgradePrompt: false,
    };
  }

  return {
    publicPlan,
    isBeta: false,
    betaStatus,
    effectiveLimit: PLAN_LIMITS[publicPlan] ?? PLAN_LIMITS.free,
    effectiveAngles: PLAN_ANGLES[publicPlan] ?? PLAN_ANGLES.free,
    showUpgradePrompt: true,
  };
}

/**
 * Atomically reserve `count` generation credits for the shop.
 *
 * Uses SERIALIZABLE isolation so concurrent POSTs cannot both read the same
 * `used` count and both succeed when only one slot remains.
 *
 * Credits are deducted on enqueue (not on success). This prevents gaming the
 * limit by firing concurrent requests. Failed jobs are not refunded in V1.
 *
 * Throws:
 *   'insufficient_credits' — shop is at or over their monthly limit
 *   Any Prisma serialization error — caller should return 503 so the client retries
 */
export async function reserveGenerations(
  shopId: string,
  count: number,
  options: ReserveGenerationsOptions = {},
): Promise<EffectiveEntitlements> {
  if (shopId === DEMO_SHOP_ID) {
    return getEffectiveEntitlements(shopId);
  }
  const entitlements = await getEffectiveEntitlements(shopId);
  const limit = entitlements.effectiveLimit;
  const startOfMonth = startOfCalendarMonth();

  await prisma.$transaction(
    async (tx) => {
      const used = await tx.creditTransaction.count({
        where: {
          shopId,
          type: "usage",
          createdAt: { gte: startOfMonth },
        },
      });

      if (process.env.NODE_ENV !== "production" && process.env.ENFORCE_BILLING !== "true") {
        return; // skip limit checks in dev
      }

      if (used + count > limit) {
        throw new Error("insufficient_credits");
      }

      await tx.creditTransaction.createMany({
        data: Array.from({ length: count }, () => ({
          shopId,
          type: "usage",
          amount: -1,
          description: options.description ?? "outfit generation",
        })),
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return entitlements;
}

export async function refundReservedGeneration(
  shopId: string,
  {
    count = 1,
    reservationDescription,
    refundDescription,
  }: RefundReservationArgs,
): Promise<boolean> {
  if (shopId === DEMO_SHOP_ID) {
    return false;
  }

  return prisma.$transaction(
    async (tx) => {
      const [reservedCount, existingRefundCount] = await Promise.all([
        tx.creditTransaction.count({
          where: {
            shopId,
            type: "usage",
            amount: -1,
            description: reservationDescription,
          },
        }),
        tx.creditTransaction.count({
          where: {
            shopId,
            type: "refund",
            amount: count,
            description: refundDescription,
          },
        }),
      ]);

      if (reservedCount < count || existingRefundCount > 0) {
        return false;
      }

      await tx.creditTransaction.create({
        data: {
          shopId,
          type: "refund",
          amount: count,
          description: refundDescription,
        },
      });

      return true;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
