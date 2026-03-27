import { task } from "@trigger.dev/sdk";
import prisma from "../app/db.server";
import { claimAndEnqueueUpscaleFromCoordinator } from "../app/lib/upscaleOrchestration.server";
import { logServerEvent } from "../app/lib/observability.server";

interface BulkUpscaleImagesPayload {
  outfitId: string;
  shopId: string;
  targetScale: 2 | 4;
}

export const bulkUpscaleImagesTask = task({
  id: "bulk-upscale-images",
  maxDuration: 300,
  queue: { concurrencyLimit: 3 },
  retry: { maxAttempts: 2 },

  run: async (payload: BulkUpscaleImagesPayload) => {
    logServerEvent("info", "bulk_upscale.task_started", { ...payload });

    const outfit = await prisma.outfit.findFirst({
      where: { id: payload.outfitId, shopId: payload.shopId },
      select: {
        status: true,
        images: { select: { id: true, upscaleStatus: true } },
      },
    });

    if (!outfit || outfit.status !== "completed") {
      logServerEvent("warn", "bulk_upscale.task_skipped", {
        ...payload,
        reason: !outfit ? "outfit_not_found" : "outfit_not_completed",
      });
      return {
        outfitId: payload.outfitId,
        queued: 0,
        skipped: 0,
      };
    }

    let queued = 0;
    let skipped = 0;

    for (const image of outfit.images) {
      if (image.upscaleStatus && image.upscaleStatus !== "failed") {
        skipped += 1;
        continue;
      }

      const result = await claimAndEnqueueUpscaleFromCoordinator({
        generatedImageId: image.id,
        shopId: payload.shopId,
        targetScale: payload.targetScale,
        previousUpscaleStatus: image.upscaleStatus,
      });

      if (result.queued) {
        queued += 1;
      } else {
        skipped += 1;
      }
    }

    logServerEvent("info", "bulk_upscale.task_completed", {
      ...payload,
      queued,
      skipped,
    });

    return {
      outfitId: payload.outfitId,
      queued,
      skipped,
    };
  },
});
