import { task } from '@trigger.dev/sdk';
import Replicate from 'replicate';
import prisma from '../app/db.server';
import { addUpscaledToManifest } from '../app/lib/imageAssetManifest.server';
import { parsePoseImageAssetManifest } from '../app/lib/imageAssetManifest';
import { logServerEvent } from '../app/lib/observability.server';

// ── Payload ───────────────────────────────────────────────────────────────────

interface UpscaleImagePayload {
  generatedImageId: string;
  shopId: string;
  targetScale: 2 | 4;
}

function logTaskLifecycle(
  event: 'task.started' | 'task.completed' | 'task.failed_final',
  payload: UpscaleImagePayload,
  extras: Record<string, unknown> = {},
) {
  logServerEvent(event === 'task.failed_final' ? 'error' : 'info', event, {
    taskId: 'upscale-image',
    generatedImageId: payload.generatedImageId,
    shopId: payload.shopId,
    targetScale: payload.targetScale,
    ...extras,
  });
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const upscaleImageTask = task({
  id: 'upscale-image',
  maxDuration: 300,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 2 },

  onFailure: async ({ payload, error }: { payload: UpscaleImagePayload; error: unknown }) => {
    const errorMessage = error instanceof Error ? error.message : 'Upscale failed.';
    logTaskLifecycle('task.failed_final', payload, { error: errorMessage });
    await prisma.generatedImage
      .update({
        where: { id: payload.generatedImageId },
        data: { upscaleStatus: 'failed' },
      })
      .catch(() => {});
  },

  run: async (payload: UpscaleImagePayload) => {
    const { generatedImageId, shopId, targetScale } = payload;
    logTaskLifecycle('task.started', payload);

    // ── 1. Fetch and validate ─────────────────────────────────────────────────
    const image = await prisma.generatedImage.findFirst({
      where: { id: generatedImageId, shopId },
      select: { id: true, imageUrl: true, assetManifest: true, outfitId: true, pose: true },
    });
    if (!image) {
      throw new Error(`GeneratedImage ${generatedImageId} not found for shop ${shopId}`);
    }

    const manifest = parsePoseImageAssetManifest(image.assetManifest);
    if (!manifest) {
      throw new Error(`No valid asset manifest for GeneratedImage ${generatedImageId}`);
    }

    // ── 2. Mark processing ────────────────────────────────────────────────────
    await prisma.generatedImage.update({
      where: { id: generatedImageId },
      data: { upscaleStatus: 'processing' },
    });

    // ── 3. Download original PNG ──────────────────────────────────────────────
    const originalUrl = manifest.original.url;
    const originalRes = await fetch(originalUrl);
    if (!originalRes.ok) {
      throw new Error(`Failed to fetch original image: HTTP ${originalRes.status}`);
    }
    const originalBuffer = Buffer.from(await originalRes.arrayBuffer());

    // ── 4. Run super-resolution via Replicate ─────────────────────────────────
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });

    const output = await replicate.run(
      'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
      {
        input: {
          image: originalUrl,
          scale: targetScale,
          face_enhance: false,
        },
      },
    );

    // Replicate returns a URL string or ReadableStream for this model
    let upscaledBuffer: Buffer;
    if (typeof output === 'string') {
      const upscaledRes = await fetch(output);
      if (!upscaledRes.ok) {
        throw new Error(`Failed to fetch upscaled image: HTTP ${upscaledRes.status}`);
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
      throw new Error('Unexpected Replicate output format');
    }

    // ── 5. Sharp post-process: ensure exact 2:3 aspect ratio ──────────────────
    const sharp = (await import('sharp')).default;
    const targetWidth = targetScale === 2 ? 1600 : 3200;
    const targetHeight = targetScale === 2 ? 2400 : 4800;

    const upscaledPng = await sharp(upscaledBuffer)
      .resize({ width: targetWidth, height: targetHeight, fit: 'cover', position: 'top' })
      .png({ progressive: true })
      .toBuffer();

    // ── 6. Race condition guard ───────────────────────────────────────────────
    // Re-read the image to ensure it wasn't regenerated while we were upscaling
    const currentImage = await prisma.generatedImage.findFirst({
      where: { id: generatedImageId },
      select: { imageUrl: true, assetManifest: true },
    });
    if (!currentImage || currentImage.imageUrl !== image.imageUrl) {
      logServerEvent('info', 'upscale.aborted_stale', {
        generatedImageId,
        reason: 'Image was regenerated during upscale',
      });
      return { generatedImageId, status: 'aborted_stale' };
    }

    // Re-parse manifest in case it was updated (but imageUrl is the same)
    const currentManifest = parsePoseImageAssetManifest(currentImage.assetManifest) ?? manifest;

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
        upscaleStatus: 'completed',
        upscaledAt: new Date(),
      },
    });

    logTaskLifecycle('task.completed', payload, {
      targetWidth,
      targetHeight,
    });
    return { generatedImageId, status: 'completed' };
  },
});
