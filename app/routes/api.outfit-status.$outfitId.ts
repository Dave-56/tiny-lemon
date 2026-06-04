import type { LoaderFunctionArgs } from 'react-router';
import prisma from '../db.server';
import { cancelRunSafely } from '../lib/triggerJobs.server';

const STALE_QUEUED_GENERATION_MS = 2 * 60 * 1000;
const STALE_QUEUED_GENERATION_MESSAGE =
  "Generation didn't start in time. Please try again.";

/**
 * Public status endpoint for outfit generation polling.
 * No Shopify auth required — outfitId (cuid, 25 random chars) is the capability token.
 * Optionally scopes by shopId query param when provided by the client.
 *
 * GET /api/outfit-status/:outfitId?shop=<shopId>
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const outfitId = params.outfitId;
  if (!outfitId) return Response.json({ error: 'Missing outfitId' }, { status: 400 });

  const shopId = new URL(request.url).searchParams.get('shop') ?? undefined;

  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, deletedAt: null, ...(shopId ? { shopId } : {}) },
    select: {
      status: true,
      errorMessage: true,
      jobId: true,
      createdAt: true,
      cleanFlatLayUrl: true,
      videoStatus: true,
      videoUrl: true,
      videoErrorMessage: true,
      videoGeneratedAt: true,
      images: { select: { id: true, pose: true, imageUrl: true, assetManifest: true } },
    },
  });

  if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });

  const isStaleQueuedGeneration =
    outfit.status === 'pending' &&
    outfit.jobId != null &&
    outfit.cleanFlatLayUrl == null &&
    outfit.images.length === 0 &&
    Date.now() - outfit.createdAt.getTime() >= STALE_QUEUED_GENERATION_MS;

  if (isStaleQueuedGeneration) {
    const jobId = outfit.jobId;
    if (jobId) await cancelRunSafely(jobId);
    await prisma.outfit.update({
      where: { id: outfitId },
      data: {
        status: 'failed',
        errorMessage: STALE_QUEUED_GENERATION_MESSAGE,
        jobId: null,
      },
    });

    return Response.json({
      status: 'failed',
      errorMessage: STALE_QUEUED_GENERATION_MESSAGE,
      cleanFlatLayUrl: null,
      videoStatus: outfit.videoStatus ?? null,
      videoUrl: outfit.videoUrl ?? null,
      videoErrorMessage: outfit.videoErrorMessage ?? null,
      videoGeneratedAt: outfit.videoGeneratedAt ?? null,
      images: outfit.images,
    });
  }

  return Response.json({
    status: outfit.status,
    errorMessage: outfit.errorMessage ?? null,
    cleanFlatLayUrl: outfit.cleanFlatLayUrl ?? null,
    videoStatus: outfit.videoStatus ?? null,
    videoUrl: outfit.videoUrl ?? null,
    videoErrorMessage: outfit.videoErrorMessage ?? null,
    videoGeneratedAt: outfit.videoGeneratedAt ?? null,
    images: outfit.images,
  });
};
