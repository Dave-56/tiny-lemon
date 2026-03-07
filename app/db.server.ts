import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

/** Upsert a Shop record so FK constraints are satisfied before writing Outfits. */
export async function ensureShop(shopId: string) {
  await prisma.shop.upsert({
    where: { id: shopId },
    update: {},
    create: { id: shopId },
  });
}
