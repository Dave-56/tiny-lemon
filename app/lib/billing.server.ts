import { Prisma } from "@prisma/client";
import prisma from "../db.server";

/** Demo shop id for public /try free tool. No credits; rate limit only. */
export const DEMO_SHOP_ID = process.env.DEMO_SHOP_ID ?? "__demo__";

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
): Promise<string> {
  if (shopId === DEMO_SHOP_ID) {
    return "free";
  }
  const plan = await getPlanForShop(shopId);
  const limit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
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
          description: "outfit generation",
        })),
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return plan;
}
