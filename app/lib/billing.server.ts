import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import type { RegeneratePose } from "./regeneratePoses";
import {
  BETA_LAUNCH_GENERATION_CAP,
  FREE_TRIAL_GENERATION_LIMIT,
} from "./planConstants";

/** Demo shop id for public /try free tool. No credits; rate limit only. */
export const DEMO_SHOP_ID = process.env.DEMO_SHOP_ID ?? "__demo__";
export const BETA_DEFAULT_CAP = BETA_LAUNCH_GENERATION_CAP;
export const FULL_GENERATION_ANGLES = ["front", "three-quarter", "back"] as const;
export const BETA_FULL_ANGLES = FULL_GENERATION_ANGLES;

// `free` is a one-time trial counted over the shop's lifetime; paid plans reset monthly.
export const PLAN_LIMITS: Record<string, number> = {
  free: FREE_TRIAL_GENERATION_LIMIT,
  Starter: 30,
  Growth: 100,
  Scale: 300,
};

// During testing, every plan gets the complete product image set.
export const PLAN_ANGLES: Record<string, string[]> = {
  free: [...FULL_GENERATION_ANGLES],
  Starter: [...FULL_GENERATION_ANGLES],
  Growth: [...FULL_GENERATION_ANGLES],
  Scale: [...FULL_GENERATION_ANGLES],
};

export function getEffectiveBetaLimit(
  publicPlan: string,
  betaCap: number | null | undefined,
  betaGrantedBy?: string | null,
): number {
  // The free tier is a one-time trial, so it never raises an internal store's
  // monthly allowance; only a paid plan can.
  const planLimit = publicPlan === "free" ? 0 : (PLAN_LIMITS[publicPlan] ?? 0);
  const betaLimit = betaGrantedBy === "default_beta"
    ? BETA_DEFAULT_CAP
    : betaCap ?? BETA_DEFAULT_CAP;
  return Math.max(betaLimit, BETA_DEFAULT_CAP, planLimit);
}

type ReserveGenerationsOptions = {
  description?: string;
};

type RefundReservationArgs = {
  count?: number;
  reservationDescription: string;
  refundDescription: string;
};

type SingleImageRegenerationAllowanceArgs = {
  shopId: string;
  outfitId: string;
  pose: RegeneratePose;
};

/** Which ledger window `effectiveLimit` applies to. */
export type UsageWindow = "lifetime" | "month";

export type EffectiveEntitlements = {
  publicPlan: string;
  isBeta: boolean;
  betaStatus: string | null;
  effectiveLimit: number;
  effectiveAngles: readonly string[];
  showUpgradePrompt: boolean;
  usageWindow: UsageWindow;
};

export function isManualBetaAccess(shop: {
  betaAccess?: boolean | null;
  betaStatus?: string | null;
  betaGrantedBy?: string | null;
} | null | undefined): boolean {
  return (
    shop?.betaAccess === true &&
    shop.betaGrantedBy != null &&
    shop.betaGrantedBy !== "default_beta" &&
    shop.betaStatus !== "paused" &&
    shop.betaStatus !== "ended"
  );
}

function startOfCalendarMonth(): Date {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function usageFromLedgerAmount(amount: number | null | undefined): number {
  return Math.max(0, -(amount ?? 0));
}

/**
 * Generation usage inside the shop's billing window: the whole lifetime for
 * the one-time free trial, the current calendar month for paid plans and
 * internal stores. The name is kept for existing call sites.
 */
export async function getMonthlyUsage(shopId: string): Promise<number> {
  return getGenerationUsage(shopId);
}

export async function getGenerationUsage(
  shopId: string,
  entitlements?: EffectiveEntitlements,
): Promise<number> {
  const resolved = entitlements ?? (await getEffectiveEntitlements(shopId));
  const aggregate = await prisma.creditTransaction.aggregate({
    where: usageLedgerWhere(shopId, resolved.usageWindow),
    _sum: { amount: true },
  });
  return usageFromLedgerAmount(aggregate._sum.amount);
}

function usageLedgerWhere(shopId: string, window: UsageWindow) {
  return {
    shopId,
    type: { in: ["usage", "refund"] },
    ...(window === "month" ? { createdAt: { gte: startOfCalendarMonth() } } : {}),
  };
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
      usageWindow: "lifetime",
    };
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      plan: true,
      betaAccess: true,
      betaStatus: true,
      betaCap: true,
      betaGrantedBy: true,
    },
  });

  const publicPlan = shop?.plan ?? "free";
  const betaStatus = shop?.betaStatus ?? null;
  const isBeta = isManualBetaAccess(shop);

  if (isBeta) {
    return {
      publicPlan,
      isBeta: true,
      betaStatus,
      effectiveLimit: getEffectiveBetaLimit(publicPlan, shop?.betaCap, shop?.betaGrantedBy),
      effectiveAngles: BETA_FULL_ANGLES,
      showUpgradePrompt: false,
      usageWindow: "month",
    };
  }

  return {
    publicPlan,
    isBeta: false,
    betaStatus,
    effectiveLimit: PLAN_LIMITS[publicPlan] ?? PLAN_LIMITS.free,
    effectiveAngles: PLAN_ANGLES[publicPlan] ?? PLAN_ANGLES.free,
    showUpgradePrompt: true,
    usageWindow: publicPlan === "free" ? "lifetime" : "month",
  };
}

/**
 * Atomically reserve `count` generation credits for the shop.
 *
 * Uses SERIALIZABLE isolation so concurrent POSTs cannot both read the same
 * `used` count and both succeed when only one slot remains.
 *
 * Credits are deducted on enqueue (not on success). This prevents gaming the
 * limit by firing concurrent requests. Known no-output provider/storage failures
 * are refunded by the generation tasks once the final retry fails.
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

  await prisma.$transaction(
    async (tx) => {
      const usageAggregate = await tx.creditTransaction.aggregate({
        where: usageLedgerWhere(shopId, entitlements.usageWindow),
        _sum: { amount: true },
      });
      const used = usageFromLedgerAmount(usageAggregate._sum.amount);

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

export async function reserveFreeSingleImageRegeneration({
  shopId,
  outfitId,
  pose,
}: SingleImageRegenerationAllowanceArgs): Promise<boolean> {
  if (shopId === DEMO_SHOP_ID) return true;

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.singleImageRegenerationAllowance.findUnique({
        where: { outfitId_pose: { outfitId, pose } },
        select: { id: true, status: true },
      });

      if (!existing) {
        await tx.singleImageRegenerationAllowance.create({
          data: { shopId, outfitId, pose, status: "pending" },
        });
        return true;
      }

      if (existing.status === "failed") {
        await tx.singleImageRegenerationAllowance.update({
          where: { id: existing.id },
          data: { status: "pending", completedAt: null },
        });
        return true;
      }

      return false;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function markFreeSingleImageRegenerationCompleted({
  shopId,
  outfitId,
  pose,
}: SingleImageRegenerationAllowanceArgs): Promise<void> {
  if (shopId === DEMO_SHOP_ID) return;

  await prisma.singleImageRegenerationAllowance.updateMany({
    where: { shopId, outfitId, pose, status: "pending" },
    data: { status: "completed", completedAt: new Date() },
  });
}

export async function markFreeSingleImageRegenerationFailed({
  shopId,
  outfitId,
  pose,
}: SingleImageRegenerationAllowanceArgs): Promise<void> {
  if (shopId === DEMO_SHOP_ID) return;

  await prisma.singleImageRegenerationAllowance.updateMany({
    where: { shopId, outfitId, pose, status: "pending" },
    data: { status: "failed", completedAt: null },
  });
}
