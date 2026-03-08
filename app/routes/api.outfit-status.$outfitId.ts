import type { LoaderFunctionArgs } from 'react-router';
import prisma from '../db.server';

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
    where: { id: outfitId, ...(shopId ? { shopId } : {}) },
    select: {
      status: true,
      errorMessage: true,
      images: { select: { id: true, pose: true, imageUrl: true } },
    },
  });

  if (!outfit) return Response.json({ error: 'Not found' }, { status: 404 });

  return Response.json({
    status: outfit.status,
    errorMessage: outfit.errorMessage ?? null,
    images: outfit.images,
  });
};
