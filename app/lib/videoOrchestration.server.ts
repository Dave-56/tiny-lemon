import prisma from "../db.server";
import { canGenerateVideo } from "./plans";
import { getEffectiveEntitlements } from "./billing.server";
import { enqueueGenerateVideo, cancelRunSafely } from "./triggerJobs.server";
import { logServerEvent } from "./observability.server";
import { Prisma } from "@prisma/client";

// ── Response types ───────────────────────────────────────────────────────────

type VideoRequestResultBody =
  | { ok: true; outfitId: string; jobId: string }
  | { ok: true; outfitId: string; alreadyInProgress: true; videoStatus: string }
  | { ok: true; outfitId: string; alreadyCompleted: true; videoUrl: string };

const VIDEO_UNAVAILABLE_MESSAGE =
  "Could not start video generation right now. Please try again.";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

// ── Access check ─────────────────────────────────────────────────────────────

async function ensureVideoAccess(shopId: string): Promise<Response | null> {
  const entitlements = await getEffectiveEntitlements(shopId);
  if (!canGenerateVideo(entitlements.publicPlan, entitlements.isBeta)) {
    return Response.json(
      { error: "upgrade_required", message: "Video generation is not available on your current plan." },
      { status: 402 },
    );
  }
  return null;
}

// ── Atomic claim ─────────────────────────────────────────────────────────────

async function claimOutfitForVideo(outfitId: string): Promise<boolean> {
  const result = await prisma.outfit.updateMany({
    where: {
      id: outfitId,
      OR: [{ videoStatus: null }, { videoStatus: "failed" }],
    },
    data: {
      videoStatus: "pending",
      videoJobId: null,
      videoErrorMessage: null,
    },
  });
  return result.count > 0;
}

async function restoreVideoClaim(outfitId: string, previousVideoStatus: string | null) {
  await prisma.outfit.update({
    where: { id: outfitId },
    data: {
      videoStatus: previousVideoStatus,
      videoJobId: null,
    },
  });
}

// ── Clear video state (for regeneration invalidation) ────────────────────────

export async function clearOutfitVideoState(outfitId: string): Promise<void> {
  const outfit = await prisma.outfit.findUnique({
    where: { id: outfitId },
    select: { videoStatus: true, videoJobId: true },
  });

  if (!outfit) return;

  // Cancel in-flight video job if pending/processing
  if (
    outfit.videoJobId &&
    (outfit.videoStatus === "pending" || outfit.videoStatus === "processing")
  ) {
    await cancelRunSafely(outfit.videoJobId);
  }

  await prisma.outfit.update({
    where: { id: outfitId },
    data: {
      videoStatus: null,
      videoJobId: null,
      videoUrl: null,
      videoErrorMessage: null,
      videoGeneratedAt: null,
    },
  });
}

export async function clearOutfitVideoStateInTransaction(
  tx: Prisma.TransactionClient,
  outfitId: string,
): Promise<void> {
  await tx.outfit.update({
    where: { id: outfitId },
    data: {
      videoStatus: null,
      videoJobId: null,
      videoUrl: null,
      videoErrorMessage: null,
      videoGeneratedAt: null,
    },
  });
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function handleVideoGenerateRequest(args: {
  outfitId: string;
  shopId: string;
}): Promise<Response> {
  if (!args.outfitId) {
    return jsonError("Missing required field: outfitId", 400);
  }

  const gate = await ensureVideoAccess(args.shopId);
  if (gate) return gate;

  const outfit = await prisma.outfit.findFirst({
    where: { id: args.outfitId, shopId: args.shopId },
    select: {
      id: true,
      status: true,
      brandStyleId: true,
      videoStatus: true,
      videoUrl: true,
      images: { select: { id: true } },
    },
  });

  if (!outfit) {
    return jsonError("Outfit not found", 404);
  }

  if (outfit.status !== "completed") {
    return jsonError("Outfit must be completed before generating video", 400);
  }

  if (outfit.images.length === 0) {
    return jsonError("Outfit has no generated images", 400);
  }

  // ── Idempotent responses ──────────────────────────────────────────────────
  if (outfit.videoStatus === "pending" || outfit.videoStatus === "processing") {
    const body: VideoRequestResultBody = {
      ok: true,
      outfitId: outfit.id,
      alreadyInProgress: true,
      videoStatus: outfit.videoStatus,
    };
    return Response.json(body);
  }

  if (outfit.videoStatus === "completed" && outfit.videoUrl) {
    const body: VideoRequestResultBody = {
      ok: true,
      outfitId: outfit.id,
      alreadyCompleted: true,
      videoUrl: outfit.videoUrl,
    };
    return Response.json(body);
  }

  // ── Claim and enqueue ─────────────────────────────────────────────────────
  const claimed = await claimOutfitForVideo(outfit.id);
  if (!claimed) {
    // Race: another request claimed it between our read and claim
    const refreshed = await prisma.outfit.findUnique({
      where: { id: outfit.id },
      select: { videoStatus: true, videoUrl: true },
    });

    if (refreshed?.videoStatus === "completed" && refreshed.videoUrl) {
      return Response.json({
        ok: true,
        outfitId: outfit.id,
        alreadyCompleted: true,
        videoUrl: refreshed.videoUrl,
      } satisfies VideoRequestResultBody);
    }

    return Response.json({
      ok: true,
      outfitId: outfit.id,
      alreadyInProgress: true,
      videoStatus: refreshed?.videoStatus ?? "pending",
    } satisfies VideoRequestResultBody);
  }

  try {
    const handle = await enqueueGenerateVideo({
      outfitId: outfit.id,
      shopId: args.shopId,
      brandStyleId: outfit.brandStyleId,
    });

    await prisma.outfit.update({
      where: { id: outfit.id },
      data: { videoJobId: handle.id },
    });

    logServerEvent("info", "video.enqueue_started", {
      outfitId: outfit.id,
      shopId: args.shopId,
      jobId: handle.id,
    });

    const body: VideoRequestResultBody = {
      ok: true,
      outfitId: outfit.id,
      jobId: handle.id,
    };
    return Response.json(body);
  } catch (error) {
    await restoreVideoClaim(outfit.id, outfit.videoStatus).catch(() => undefined);

    logServerEvent("error", "video.enqueue_failed", {
      outfitId: outfit.id,
      shopId: args.shopId,
      error: error instanceof Error ? error.message : String(error),
    });

    return jsonError(VIDEO_UNAVAILABLE_MESSAGE, 503);
  }
}
