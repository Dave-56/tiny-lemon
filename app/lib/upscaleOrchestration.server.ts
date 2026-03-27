import prisma from "../db.server";
import { canUpscale } from "./plans";
import { getEffectiveEntitlements } from "./billing.server";
import {
  enqueueBulkUpscaleImages,
  enqueueUpscaleImage,
} from "./triggerJobs.server";
import { logServerEvent } from "./observability.server";

type UpscaleRequestResultBody =
  | { ok: true; generatedImageId: string; jobId: string }
  | {
      ok: true;
      generatedImageId: string;
      upscaleStatus: string | null;
      alreadyInProgress: true;
    };

type BulkUpscaleRequestResultBody =
  | { ok: true; outfitId: string; upscaled: number; jobId: string }
  | { ok: true; outfitId: string; upscaled: 0 };

type MaybeNullableUpscaleStatus = string | null;

const UPSCALE_UNAVAILABLE_MESSAGE =
  "Could not start the upscale right now. Please try again.";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

async function ensureUpscaleAccess(shopId: string): Promise<Response | null> {
  const entitlements = await getEffectiveEntitlements(shopId);
  if (!canUpscale(entitlements.publicPlan, entitlements.isBeta)) {
    return Response.json(
      { error: "upgrade_required", message: "Upgrade to Growth or Scale to upscale images." },
      { status: 402 },
    );
  }
  return null;
}

async function claimGeneratedImageForUpscale(generatedImageId: string) {
  const result = await prisma.generatedImage.updateMany({
    where: {
      id: generatedImageId,
      OR: [{ upscaleStatus: null }, { upscaleStatus: "failed" }],
    },
    data: {
      upscaleStatus: "pending",
      upscaleJobId: null,
    },
  });

  return result.count > 0;
}

async function restoreUpscaleClaim(
  generatedImageId: string,
  previousUpscaleStatus: MaybeNullableUpscaleStatus,
) {
  await prisma.generatedImage.update({
    where: { id: generatedImageId },
    data: {
      upscaleStatus: previousUpscaleStatus,
      upscaleJobId: null,
    },
  });
}

export async function enqueueClaimedUpscaleImage(
  args: {
    generatedImageId: string;
    shopId: string;
    targetScale: 2 | 4;
    previousUpscaleStatus: MaybeNullableUpscaleStatus;
  },
) {
  try {
    const handle = await enqueueUpscaleImage({
      generatedImageId: args.generatedImageId,
      shopId: args.shopId,
      targetScale: args.targetScale,
    });

    await prisma.generatedImage.update({
      where: { id: args.generatedImageId },
      data: { upscaleJobId: handle.id },
    });

    return handle;
  } catch (error) {
    await restoreUpscaleClaim(args.generatedImageId, args.previousUpscaleStatus).catch(
      () => undefined,
    );

    logServerEvent("error", "upscale.enqueue_failed", {
      generatedImageId: args.generatedImageId,
      shopId: args.shopId,
      targetScale: args.targetScale,
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

export async function handleSingleUpscaleRequest(args: {
  generatedImageId: string;
  shopId: string;
  targetScale?: 2 | 4;
}): Promise<Response> {
  if (!args.generatedImageId) {
    return jsonError("Missing required field: generatedImageId", 400);
  }

  const gate = await ensureUpscaleAccess(args.shopId);
  if (gate) {
    return gate;
  }

  const targetScale = args.targetScale === 4 ? 4 : 2;
  const image = await prisma.generatedImage.findFirst({
    where: { id: args.generatedImageId, shopId: args.shopId },
    select: {
      id: true,
      upscaleStatus: true,
      outfit: { select: { status: true } },
    },
  });

  if (!image) {
    return jsonError("Image not found", 404);
  }

  if (image.outfit.status !== "completed") {
    return jsonError("Outfit must be completed before upscaling", 400);
  }

  if (
    image.upscaleStatus === "pending" ||
    image.upscaleStatus === "processing" ||
    image.upscaleStatus === "completed"
  ) {
    const body: UpscaleRequestResultBody = {
      ok: true,
      generatedImageId: image.id,
      upscaleStatus: image.upscaleStatus,
      alreadyInProgress: true,
    };
    return Response.json(body);
  }

  const claimed = await claimGeneratedImageForUpscale(image.id);
  if (!claimed) {
    const refreshed = await prisma.generatedImage.findUnique({
      where: { id: image.id },
      select: { upscaleStatus: true },
    });

    const body: UpscaleRequestResultBody = {
      ok: true,
      generatedImageId: image.id,
      upscaleStatus: refreshed?.upscaleStatus ?? image.upscaleStatus,
      alreadyInProgress: true,
    };
    return Response.json(body);
  }

  try {
    const handle = await enqueueClaimedUpscaleImage({
      generatedImageId: image.id,
      shopId: args.shopId,
      targetScale,
      previousUpscaleStatus: image.upscaleStatus,
    });

    const body: UpscaleRequestResultBody = {
      ok: true,
      generatedImageId: image.id,
      jobId: handle.id,
    };
    return Response.json(body);
  } catch {
    return jsonError(UPSCALE_UNAVAILABLE_MESSAGE, 503);
  }
}

export async function handleBulkUpscaleRequest(args: {
  outfitId: string;
  shopId: string;
  targetScale?: 2 | 4;
}): Promise<Response> {
  if (!args.outfitId) {
    return jsonError("Missing required field: outfitId", 400);
  }

  const gate = await ensureUpscaleAccess(args.shopId);
  if (gate) {
    return gate;
  }

  const targetScale = args.targetScale === 4 ? 4 : 2;
  const outfit = await prisma.outfit.findFirst({
    where: { id: args.outfitId, shopId: args.shopId },
    select: {
      status: true,
      images: { select: { id: true, upscaleStatus: true } },
    },
  });

  if (!outfit) {
    return jsonError("Outfit not found", 404);
  }

  if (outfit.status !== "completed") {
    return jsonError("Outfit must be completed before upscaling", 400);
  }

  const eligibleCount = outfit.images.filter(
    (img) => !img.upscaleStatus || img.upscaleStatus === "failed",
  ).length;

  if (eligibleCount === 0) {
    const body: BulkUpscaleRequestResultBody = {
      ok: true,
      outfitId: args.outfitId,
      upscaled: 0,
    };
    return Response.json(body);
  }

  try {
    const handle = await enqueueBulkUpscaleImages({
      outfitId: args.outfitId,
      shopId: args.shopId,
      targetScale,
    });

    const body: BulkUpscaleRequestResultBody = {
      ok: true,
      outfitId: args.outfitId,
      upscaled: eligibleCount,
      jobId: handle.id,
    };
    return Response.json(body);
  } catch (error) {
    logServerEvent("error", "upscale.bulk_enqueue_failed", {
      outfitId: args.outfitId,
      shopId: args.shopId,
      targetScale,
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonError(UPSCALE_UNAVAILABLE_MESSAGE, 503);
  }
}

export async function claimAndEnqueueUpscaleFromCoordinator(args: {
  generatedImageId: string;
  shopId: string;
  targetScale: 2 | 4;
  previousUpscaleStatus: MaybeNullableUpscaleStatus;
}) {
  const claimed = await claimGeneratedImageForUpscale(args.generatedImageId);
  if (!claimed) {
    return { queued: false as const };
  }

  try {
    const handle = await enqueueClaimedUpscaleImage(args);
    return { queued: true as const, jobId: handle.id };
  } catch {
    return { queued: false as const };
  }
}
