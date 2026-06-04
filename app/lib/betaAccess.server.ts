import prisma, { ensureShop } from "../db.server";
import { BETA_STATUS } from "./beta";
import { BETA_DEFAULT_CAP } from "./billing.server";

function normalizeShopDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

export async function ensureBetaAccessForShop(shopId: string) {
  const normalizedShopId = normalizeShopDomain(shopId);
  await ensureShop(normalizedShopId);

  const shop = await prisma.shop.findUnique({
    where: { id: normalizedShopId },
    select: {
      betaAccess: true,
      betaStatus: true,
      betaCap: true,
      betaGrantedBy: true,
    },
  });

  if (!shop) {
    return { granted: false as const };
  }

  if (shop.betaStatus === BETA_STATUS.paused || shop.betaStatus === BETA_STATUS.ended) {
    return { granted: false as const, skipped: shop.betaStatus };
  }

  const usesDefaultBetaCap = shop.betaCap == null || shop.betaGrantedBy === "default_beta";

  if (shop.betaAccess) {
    if (usesDefaultBetaCap && shop.betaCap !== BETA_DEFAULT_CAP) {
      await prisma.shop.update({
        where: { id: normalizedShopId },
        data: { betaCap: BETA_DEFAULT_CAP },
      });
    }

    return { granted: false as const, skipped: "already_granted" };
  }

  await prisma.shop.update({
    where: { id: normalizedShopId },
    data: {
      betaAccess: true,
      betaStatus: BETA_STATUS.invited,
      betaCap: usesDefaultBetaCap ? BETA_DEFAULT_CAP : shop.betaCap,
      betaGrantedAt: new Date(),
      betaGrantedBy: "default_beta",
    },
  });

  return { granted: true as const };
}
