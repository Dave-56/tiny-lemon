import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { DEMO_SHOP_ID } from "../lib/billing.server";

/**
 * GET /try/status?outfitId=...
 * Returns status and images only when the outfit belongs to the demo shop.
 * Used by the /try page to poll for result without a Shopify session.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const outfitId = url.searchParams.get("outfitId");
  if (!outfitId) {
    return Response.json({ error: "Missing outfitId" }, { status: 400 });
  }
  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, shopId: DEMO_SHOP_ID },
    select: {
      status: true,
      errorMessage: true,
      images: { select: { pose: true, imageUrl: true, assetManifest: true } },
    },
  });
  if (!outfit) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({
    status: outfit.status,
    errorMessage: outfit.errorMessage ?? null,
    images: outfit.images,
  });
};
