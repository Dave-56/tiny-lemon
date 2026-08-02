import prisma, { ensureShop } from "../db.server";

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
      betaGrantedBy: true,
    },
  });

  if (!shop) {
    return { granted: false as const };
  }

  return { granted: false as const, skipped: "manual_only" };
}
