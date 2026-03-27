import { task } from '@trigger.dev/sdk';
import prisma from '../app/db.server';
import { uploadBufferToBlob } from '../app/blob.server';
import { buildVideoMotionPrompt } from '../app/lib/videoMotionPrompt';
import {
  createVideoProvider,
  type OutfitSourceImage,
} from '../app/lib/videoProvider.server';
import { parsePoseImageAssetManifest } from '../app/lib/imageAssetManifest';
import { logServerEvent } from '../app/lib/observability.server';
import crypto from 'crypto';

// ── Payload ──────────────────────────────────────────────────────────────────

interface GenerateVideoPayload {
  outfitId: string;
  shopId: string;
  brandStyleId: string;
}

function logTaskLifecycle(
  event: 'task.started' | 'task.completed' | 'task.failed_final',
  payload: GenerateVideoPayload,
  extras: Record<string, unknown> = {},
) {
  logServerEvent(event === 'task.failed_final' ? 'error' : 'info', event, {
    taskId: 'generate-video',
    outfitId: payload.outfitId,
    shopId: payload.shopId,
    ...extras,
  });
}

// ── Task ─────────────────────────────────────────────────────────────────────

export const generateVideoTask = task({
  id: 'generate-video',
  maxDuration: 600,
  queue: { concurrencyLimit: 2 },
  retry: { maxAttempts: 2 },

  onFailure: async ({ payload, error }: { payload: GenerateVideoPayload; error: unknown }) => {
    const errorMessage = error instanceof Error ? error.message : 'Video generation failed.';
    logTaskLifecycle('task.failed_final', payload, { error: errorMessage });
    await prisma.outfit
      .update({
        where: { id: payload.outfitId },
        data: {
          videoStatus: 'failed',
          videoErrorMessage: errorMessage,
        },
      })
      .catch(() => {});
  },

  run: async (payload: GenerateVideoPayload) => {
    const { outfitId, shopId, brandStyleId } = payload;
    logTaskLifecycle('task.started', payload);

    // ── 1. Fetch and validate ─────────────────────────────────────────────────
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        id: true,
        status: true,
        images: {
          select: {
            id: true,
            imageUrl: true,
            pose: true,
            assetManifest: true,
            upscaleStatus: true,
          },
        },
      },
    });

    if (!outfit) {
      throw new Error(`Outfit ${outfitId} not found for shop ${shopId}`);
    }

    if (outfit.status !== 'completed' || outfit.images.length === 0) {
      throw new Error(`Outfit ${outfitId} is not completed or has no images`);
    }

    // ── 2. Mark processing ────────────────────────────────────────────────────
    await prisma.outfit.update({
      where: { id: outfitId },
      data: { videoStatus: 'processing' },
    });

    // ── 3. Build source images ────────────────────────────────────────────────
    const sourceImages: OutfitSourceImage[] = outfit.images.map((img) => {
      const manifest = parsePoseImageAssetManifest(img.assetManifest);
      const isUpscaled = img.upscaleStatus === 'completed' && !!manifest?.upscaled;

      // Prefer upscaled original if available, otherwise the base original
      const url = isUpscaled
        ? manifest!.upscaled!.original.url
        : (manifest?.original.url ?? img.imageUrl);

      return { url, pose: img.pose, isUpscaled };
    });

    // ── 4. Capture fingerprint for staleness check ────────────────────────────
    const imageFingerprint = outfit.images
      .map((img) => `${img.id}:${img.imageUrl}`)
      .sort()
      .join('|');

    // ── 5. Build motion prompt ────────────────────────────────────────────────
    const { prompt, negativePrompt } = buildVideoMotionPrompt(brandStyleId);

    // ── 6. Call video provider ────────────────────────────────────────────────
    const provider = createVideoProvider();
    const result = await provider.generate({
      sourceImages,
      motionPrompt: prompt,
      negativePrompt,
      durationSeconds: 5,
    });

    // ── 7. Staleness guard ────────────────────────────────────────────────────
    const currentOutfit = await prisma.outfit.findFirst({
      where: { id: outfitId },
      select: {
        images: { select: { id: true, imageUrl: true } },
      },
    });

    const currentFingerprint = currentOutfit
      ? currentOutfit.images
          .map((img) => `${img.id}:${img.imageUrl}`)
          .sort()
          .join('|')
      : '';

    if (currentFingerprint !== imageFingerprint) {
      logServerEvent('info', 'video.stale_abort', {
        outfitId,
        reason: 'Images were regenerated during video generation',
      });

      await prisma.outfit
        .update({
          where: { id: outfitId },
          data: { videoStatus: null, videoJobId: null },
        })
        .catch(() => {});

      return { outfitId, status: 'aborted_stale' };
    }

    // ── 8. Download MP4 ───────────────────────────────────────────────────────
    const videoRes = await fetch(result.videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to fetch video from provider: HTTP ${videoRes.status}`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    logServerEvent('info', 'video.blob_upload_started', {
      outfitId,
      videoSizeBytes: videoBuffer.length,
    });

    // ── 9. Upload to Blob ─────────────────────────────────────────────────────
    const hash = crypto.createHash('sha256').update(videoBuffer).digest('hex').slice(0, 8);
    const blobPath = `outfits/${shopId}/${outfitId}/video.${hash}.mp4`;
    const videoUrl = await uploadBufferToBlob(videoBuffer, blobPath, 'video/mp4', {
      cacheControlMaxAge: 31536000,
      contentDisposition: 'inline',
    });

    logServerEvent('info', 'video.blob_upload_success', {
      outfitId,
      blobPath,
      videoSizeBytes: videoBuffer.length,
    });

    // ── 10. Update outfit ─────────────────────────────────────────────────────
    await prisma.outfit.update({
      where: { id: outfitId },
      data: {
        videoStatus: 'completed',
        videoUrl,
        videoGeneratedAt: new Date(),
        videoErrorMessage: null,
      },
    });

    logTaskLifecycle('task.completed', payload, {
      videoUrl,
      videoSizeBytes: videoBuffer.length,
    });

    return { outfitId, status: 'completed', videoUrl };
  },
});
