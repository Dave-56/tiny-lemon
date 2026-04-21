import { task, wait } from "@trigger.dev/sdk";
import Replicate from "replicate";
import prisma from "../app/db.server";
import { addUpscaledToManifest } from "../app/lib/imageAssetManifest.server";
import {
  parsePoseImageAssetManifest,
  type PoseImageAssetManifest,
} from "../app/lib/imageAssetManifest";
import { logServerEvent } from "../app/lib/observability.server";
import {
  consumeReplicatePredictionCreateSlot,
  getReplicatePredictionCreateWindowMs,
  getReplicateThrottleRetryAfterMs,
} from "../app/lib/replicatePredictionThrottle.server";

// ── Payload ───────────────────────────────────────────────────────────────────

interface UpscaleImagePayload {
  generatedImageId: string;
  shopId: string;
  targetScale: 2 | 4;
}

function logTaskLifecycle(
  event: "task.started" | "task.completed" | "task.failed_final",
  payload: UpscaleImagePayload,
  extras: Record<string, unknown> = {},
) {
  logServerEvent(event === "task.failed_final" ? "error" : "info", event, {
    taskId: "upscale-image",
    generatedImageId: payload.generatedImageId,
    shopId: payload.shopId,
    targetScale: payload.targetScale,
    ...extras,
  });
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const upscaleImageTask = task({
  id: "upscale-image",
  maxDuration: 300,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 2 },

  onFailure: async ({
    payload,
    error,
  }: {
    payload: UpscaleImagePayload;
    error: unknown;
  }) => {
    const errorMessage =
      error instanceof Error ? error.message : "Upscale failed.";
    logTaskLifecycle("task.failed_final", payload, { error: errorMessage });
    await prisma.generatedImage
      .update({
        where: { id: payload.generatedImageId },
        data: { upscaleStatus: "failed" },
      })
      .catch(() => {});
  },

  run: async (payload: UpscaleImagePayload) => {
    const { generatedImageId, shopId, targetScale } = payload;
    logTaskLifecycle("task.started", payload);

    // ── 1. Fetch and validate ─────────────────────────────────────────────────
    const image = await prisma.generatedImage.findFirst({
      where: { id: generatedImageId, shopId },
      select: {
        id: true,
        imageUrl: true,
        assetManifest: true,
        outfitId: true,
        pose: true,
      },
    });
    if (!image) {
      throw new Error(
        `GeneratedImage ${generatedImageId} not found for shop ${shopId}`,
      );
    }

    const manifest = parsePoseImageAssetManifest(image.assetManifest);

    // ── 2. Mark processing ────────────────────────────────────────────────────
    await prisma.generatedImage.update({
      where: { id: generatedImageId },
      data: { upscaleStatus: "processing" },
    });

    // ── 3. Prepare source and wait for provider slot ──────────────────────────
    // Fall back to imageUrl if no asset manifest (older images pre-manifest)
    const originalUrl = manifest?.original.url ?? image.imageUrl;

    // ── 4. Run super-resolution via Replicate ─────────────────────────────────
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

    const output = await runReplicateUpscaleWithThrottle({
      replicate,
      payload,
      sourceImageUrl: image.imageUrl,
      originalUrl,
      generatedImageId,
      targetScale,
    });
    if (output == null) {
      return { generatedImageId, status: "aborted_stale" };
    }

    // Replicate returns a URL string or ReadableStream for this model
    let upscaledBuffer: Buffer;
    if (typeof output === "string") {
      const upscaledRes = await fetch(output);
      if (!upscaledRes.ok) {
        throw new Error(
          `Failed to fetch upscaled image: HTTP ${upscaledRes.status}`,
        );
      }
      upscaledBuffer = Buffer.from(await upscaledRes.arrayBuffer());
    } else if (output instanceof ReadableStream) {
      const chunks: Uint8Array[] = [];
      const reader = (output as ReadableStream<Uint8Array>).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      upscaledBuffer = Buffer.concat(chunks);
    } else {
      throw new Error("Unexpected Replicate output format");
    }

    // ── 5. Sharp post-process: ensure exact 2:3 aspect ratio ──────────────────
    const sharp = (await import("sharp")).default;
    const targetWidth = targetScale === 2 ? 1600 : 3200;
    const targetHeight = targetScale === 2 ? 2400 : 4800;

    const upscaledPng = await sharp(upscaledBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "cover",
        position: "top",
      })
      .png({ progressive: true })
      .toBuffer();

    // ── 6. Race condition guard ───────────────────────────────────────────────
    // Re-read the image to ensure it wasn't regenerated while we were upscaling
    const currentImage = await prisma.generatedImage.findFirst({
      where: { id: generatedImageId },
      select: { imageUrl: true, assetManifest: true },
    });
    if (!currentImage || currentImage.imageUrl !== image.imageUrl) {
      await clearUpscaleStateAfterStaleAbort(generatedImageId);
      logServerEvent("info", "upscale.aborted_stale", {
        generatedImageId,
        reason: "Image was regenerated during upscale",
      });
      return { generatedImageId, status: "aborted_stale" };
    }

    // Re-parse manifest in case it was updated (but imageUrl is the same)
    // If no manifest exists (older image), build a minimal base manifest
    const currentManifest: PoseImageAssetManifest = parsePoseImageAssetManifest(
      currentImage.assetManifest,
    ) ??
      manifest ?? {
        kind: "pose-image-v2" as const,
        original: {
          url: image.imageUrl,
          width: 800,
          height: 1200,
          contentType: "image/png",
        },
        displayFallback: {
          url: image.imageUrl,
          width: 800,
          contentType: "image/png",
        },
        variants: { avif: [], webp: [] },
        downloadUrl: image.imageUrl,
      };

    // ── 7. Generate upscaled variants and extend manifest ─────────────────────
    const pathnameStem = `outfits/${shopId}/${image.outfitId}/${image.pose}`;
    const updatedManifest = await addUpscaledToManifest({
      existingManifest: currentManifest,
      upscaledPngBuffer: upscaledPng,
      pathnameStem,
      width: targetWidth,
      height: targetHeight,
      scale: targetScale,
    });

    // ── 8. Persist ────────────────────────────────────────────────────────────
    await prisma.generatedImage.update({
      where: { id: generatedImageId },
      data: {
        assetManifest: updatedManifest as any,
        upscaleStatus: "completed",
        upscaledAt: new Date(),
      },
    });

    logTaskLifecycle("task.completed", payload, {
      targetWidth,
      targetHeight,
    });
    return { generatedImageId, status: "completed" };
  },
});

const MAX_REPLICATE_THROTTLE_RETRIES = 6;

async function isImageStillCurrent(
  generatedImageId: string,
  sourceImageUrl: string,
) {
  const currentImage = await prisma.generatedImage.findFirst({
    where: { id: generatedImageId },
    select: { imageUrl: true },
  });

  return currentImage?.imageUrl === sourceImageUrl;
}

async function clearUpscaleStateAfterStaleAbort(generatedImageId: string) {
  await prisma.generatedImage
    .update({
      where: { id: generatedImageId },
      data: {
        upscaleStatus: null,
        upscaleJobId: null,
      },
    })
    .catch(() => undefined);
}

async function waitForReplicatePredictionSlot(payload: UpscaleImagePayload) {
  while (true) {
    const decision = await consumeReplicatePredictionCreateSlot();
    if (decision.allowed) {
      return;
    }

    const waitMs = Math.max(
      1000,
      decision.retryAfterMs ?? getReplicatePredictionCreateWindowMs(),
    );
    logServerEvent("info", "upscale.replicate_slot_wait", {
      generatedImageId: payload.generatedImageId,
      shopId: payload.shopId,
      retryAfterMs: waitMs,
    });
    await wait.for({ seconds: Math.ceil(waitMs / 1000) });
  }
}

async function runReplicateUpscaleWithThrottle(args: {
  replicate: Replicate;
  payload: UpscaleImagePayload;
  sourceImageUrl: string;
  originalUrl: string;
  generatedImageId: string;
  targetScale: 2 | 4;
}) {
  for (
    let attempt = 1;
    attempt <= MAX_REPLICATE_THROTTLE_RETRIES;
    attempt += 1
  ) {
    const stillCurrent = await isImageStillCurrent(
      args.generatedImageId,
      args.sourceImageUrl,
    );
    if (!stillCurrent) {
      await clearUpscaleStateAfterStaleAbort(args.generatedImageId);
      logServerEvent("info", "upscale.aborted_stale", {
        generatedImageId: args.generatedImageId,
        reason: "Image was regenerated before provider execution",
      });
      return null;
    }

    await waitForReplicatePredictionSlot(args.payload);

    const freshCheck = await isImageStillCurrent(
      args.generatedImageId,
      args.sourceImageUrl,
    );
    if (!freshCheck) {
      await clearUpscaleStateAfterStaleAbort(args.generatedImageId);
      logServerEvent("info", "upscale.aborted_stale", {
        generatedImageId: args.generatedImageId,
        reason: "Image was regenerated while waiting for provider capacity",
      });
      return null;
    }

    try {
      return await args.replicate.run(
        "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
        {
          input: {
            image: args.originalUrl,
            scale: args.targetScale,
            face_enhance: false,
          },
        },
      );
    } catch (error) {
      const retryAfterMs = getReplicateThrottleRetryAfterMs(error);
      if (retryAfterMs == null || attempt === MAX_REPLICATE_THROTTLE_RETRIES) {
        throw error;
      }

      logServerEvent("warn", "upscale.replicate_429_retry", {
        generatedImageId: args.generatedImageId,
        shopId: args.payload.shopId,
        retryAfterMs,
        attempt,
      });
      await wait.for({ seconds: Math.ceil(retryAfterMs / 1000) });
    }
  }

  return null;
}
