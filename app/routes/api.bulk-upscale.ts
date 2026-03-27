import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getEffectiveEntitlements } from "../lib/billing.server";
import { canUpscale } from "../lib/plans";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import { enqueueUpscaleImage } from "../lib/triggerJobs.server";
import { logServerEvent } from "../lib/observability.server";

export const config = { maxDuration: 15 };

interface BulkUpscaleRequestBody {
  outfitId: string;
  targetScale?: 2 | 4;
}

/**
 * POST /api/bulk-upscale
 * Authenticates via Authorization: Bearer <session token>.
 * Enqueues upscale-image Trigger.dev tasks for every eligible image in an outfit.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("Authorization");
  const shopId = getShopFromSessionToken(auth, secret);
  if (!shopId) {
    return Response.json(
      { error: "Session expired — please refresh the page." },
      { status: 401 },
    );
  }

  let body: BulkUpscaleRequestBody;
  try {
    body = (await request.json()) as BulkUpscaleRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.outfitId) {
    return Response.json(
      { error: "Missing required field: outfitId" },
      { status: 400 },
    );
  }

  const targetScale = body.targetScale === 4 ? 4 : 2;

  const entitlements = await getEffectiveEntitlements(shopId);
  if (!canUpscale(entitlements.publicPlan, entitlements.isBeta)) {
    return Response.json(
      { error: "upgrade_required", message: "Upgrade to Growth or Scale to upscale images." },
      { status: 402 },
    );
  }

  const outfit = await prisma.outfit.findFirst({
    where: { id: body.outfitId, shopId },
    select: {
      status: true,
      images: { select: { id: true, upscaleStatus: true } },
    },
  });

  if (!outfit) {
    return Response.json({ error: "Outfit not found" }, { status: 404 });
  }

  if (outfit.status !== "completed") {
    return Response.json(
      { error: "Outfit must be completed before upscaling" },
      { status: 400 },
    );
  }

  const toUpscale = outfit.images.filter(
    (img) => !img.upscaleStatus || img.upscaleStatus === "failed",
  );

  for (const img of toUpscale) {
    await prisma.generatedImage.update({
      where: { id: img.id },
      data: { upscaleStatus: "pending" },
    });

    const handle = await enqueueUpscaleImage({
      generatedImageId: img.id,
      shopId,
      targetScale,
    });

    await prisma.generatedImage.update({
      where: { id: img.id },
      data: { upscaleJobId: handle.id },
    });
  }

  logServerEvent("info", "upscale.bulk_enqueued", {
    outfitId: body.outfitId,
    shopId,
    targetScale,
    count: toUpscale.length,
  });

  return Response.json({
    ok: true,
    outfitId: body.outfitId,
    upscaled: toUpscale.length,
  });
};
