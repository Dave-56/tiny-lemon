import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getShopFromSessionToken } from "../lib/sessionToken.server";
import { getEffectiveEntitlements } from "../lib/billing.server";
import { canUpscale } from "../lib/plans";
import { enqueueUpscaleImage } from "../lib/triggerJobs.server";
import { logServerEvent } from "../lib/observability.server";

export const config = { maxDuration: 15 };

interface UpscaleRequestBody {
  generatedImageId: string;
  targetScale?: 2 | 4;
}

/**
 * POST /api/upscale-image
 * Authenticates via Authorization: Bearer <session token>.
 * Enqueues an upscale-image Trigger.dev task for a single GeneratedImage.
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

  let body: UpscaleRequestBody;
  try {
    body = (await request.json()) as UpscaleRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.generatedImageId) {
    return Response.json(
      { error: "Missing required field: generatedImageId" },
      { status: 400 },
    );
  }

  const targetScale = body.targetScale === 4 ? 4 : 2;

  // ── Plan gating ───────────────────────────────────────────────────────────
  const entitlements = await getEffectiveEntitlements(shopId);
  if (!canUpscale(entitlements.publicPlan, entitlements.isBeta)) {
    return Response.json(
      { error: "upgrade_required", message: "Upgrade to Growth or Scale to upscale images." },
      { status: 402 },
    );
  }

  // ── Validate image ────────────────────────────────────────────────────────
  const image = await prisma.generatedImage.findFirst({
    where: { id: body.generatedImageId, shopId },
    select: {
      id: true,
      upscaleStatus: true,
      outfit: { select: { status: true } },
    },
  });

  if (!image) {
    return Response.json({ error: "Image not found" }, { status: 404 });
  }

  if (image.outfit.status !== "completed") {
    return Response.json(
      { error: "Outfit must be completed before upscaling" },
      { status: 400 },
    );
  }

  // ── Idempotency ───────────────────────────────────────────────────────────
  if (
    image.upscaleStatus === "pending" ||
    image.upscaleStatus === "processing" ||
    image.upscaleStatus === "completed"
  ) {
    return Response.json({
      ok: true,
      generatedImageId: image.id,
      upscaleStatus: image.upscaleStatus,
      alreadyInProgress: true,
    });
  }

  // ── Enqueue ───────────────────────────────────────────────────────────────
  await prisma.generatedImage.update({
    where: { id: image.id },
    data: { upscaleStatus: "pending" },
  });

  const handle = await enqueueUpscaleImage({
    generatedImageId: image.id,
    shopId,
    targetScale,
  });

  await prisma.generatedImage.update({
    where: { id: image.id },
    data: { upscaleJobId: handle.id },
  });

  logServerEvent("info", "upscale.enqueued", {
    generatedImageId: image.id,
    shopId,
    targetScale,
    jobId: handle.id,
  });

  return Response.json({
    ok: true,
    generatedImageId: image.id,
    jobId: handle.id,
  });
};
