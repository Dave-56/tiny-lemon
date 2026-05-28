import { task, wait } from '@trigger.dev/sdk';
import prisma from '../app/db.server';
import { unauthenticated } from '../app/shopify.server';
import { parsePoseImageAssetManifest } from '../app/lib/imageAssetManifest';
import { logServerEvent } from '../app/lib/observability.server';

// ── Payload ───────────────────────────────────────────────────────────────────

interface SyncOutfitPayload {
  outfitId: string;
  shopId: string;
  /** Existing Shopify product GID — if set, skip productCreate and update in place. */
  shopifyProductId?: string;
}

type ShopifyAdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ShopifyVideoSyncResult = {
  included: boolean;
  fileId: string | null;
  mediaId: string | null;
  skippedReason?: string;
};

type OutfitForShopifySync = NonNullable<
  Awaited<ReturnType<typeof prisma.outfit.findFirst>>
> & {
  images: Array<{
    pose: string;
    imageUrl: string;
    assetManifest: unknown;
  }>;
};

type StagedUploadTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

const VIDEO_FILE_POLL_ATTEMPTS = 12;
const VIDEO_FILE_POLL_INTERVAL_SECONDS = 5;

function logTaskLifecycle(
  event: 'task.started' | 'task.completed' | 'task.failed_final',
  payload: SyncOutfitPayload,
  extras: Record<string, unknown> = {},
) {
  logServerEvent(event === 'task.failed_final' ? 'error' : 'info', event, {
    taskId: 'sync-outfit-to-shopify',
    outfitId: payload.outfitId,
    shopId: payload.shopId,
    hasExistingProduct: Boolean(payload.shopifyProductId),
    ...extras,
  });
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const syncOutfitToShopifyTask = task({
  id: 'sync-outfit-to-shopify',
  maxDuration: 600,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, factor: 2 },

  onFailure: async ({ payload, error }: { payload: SyncOutfitPayload; error: unknown }) => {
    const errorMessage = error instanceof Error ? error.message : 'Shopify sync failed.';
    logTaskLifecycle('task.failed_final', payload, { error: errorMessage });
    await prisma.outfit
      .update({
        where: { id: payload.outfitId },
        data: {
          shopifySyncStatus: 'failed',
          shopifySyncStartedAt: null,
          errorMessage,
        },
      })
      .catch(() => {});
  },

  run: async (payload: SyncOutfitPayload) => {
    const { outfitId, shopId } = payload;
    logTaskLifecycle('task.started', payload);

    // ── 1. Fetch outfit + images ──────────────────────────────────────────────
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      include: { images: true },
    });
    if (!outfit) throw new Error(`Outfit ${outfitId} not found for shop ${shopId}.`);
    if (outfit.status !== 'completed') throw new Error('Outfit is not completed. Cannot sync.');

    // ── 2. Load token-refresh-aware Shopify Admin client ─────────────────────
    // `unauthenticated.admin` loads the offline session and refreshes expiring
    // offline access tokens when needed. Reading Session.accessToken directly
    // would use a stale token once expiring offline tokens rotate.
    const { admin } = await unauthenticated.admin(shopId);

    await prisma.outfit.update({
      where: { id: outfitId },
      data: {
        shopifySyncStatus: 'syncing',
        shopifySyncStartedAt: new Date(),
        errorMessage: null,
      },
    });

    // ── 3. Order images: front → three-quarter → back ─────────────────────────
    const ordered = ['front', 'three-quarter', 'back']
      .map((pose) => outfit.images.find((img) => img.pose === pose))
      .filter((img): img is NonNullable<typeof img> => !!img);

    if (ordered.length === 0) throw new Error('Outfit has no generated images to sync.');

    // ── 4. Media: prefer upscaled URL for best resolution on Shopify ──────────
    const mediaInput = ordered.map((img) => {
      const manifest = parsePoseImageAssetManifest(img.assetManifest);
      const bestUrl = manifest?.upscaled?.original.url ?? img.imageUrl;
      return {
        originalSource: bestUrl,
        alt: img.pose,
        mediaContentType: 'IMAGE',
      };
    });

    // ── 5. Create product or reuse existing ───────────────────────────────────
    // `ownedByApp` gates destructive media deletion: only products this app created
    // on behalf of the outfit are safe to overwrite. Merchant-picked products retain
    // their existing media — we append ours alongside.
    let productGid = payload.shopifyProductId;
    let ownedByApp: boolean;
    if (!productGid) {
      const createData = await shopifyGraphQL(admin, `
        mutation productCreate($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product { id }
            userErrors { field message }
          }
        }
      `, { product: { title: outfit.name, status: 'DRAFT' } });

      const createErrors = (createData.productCreate as { userErrors: Array<{ message: string }> }).userErrors;
      if (createErrors?.length) throw new Error(`productCreate error: ${createErrors[0].message}`);
      productGid = (createData.productCreate as { product: { id: string } }).product.id;
      ownedByApp = true;
    } else {
      ownedByApp = outfit.shopifyProductCreatedByApp === true;
    }

    // ── 6. Delete old media before attaching new (only for app-owned products) ─
    // Merchant-picked products keep their existing photos — we append ours alongside.
    if (ownedByApp) {
      const mediaQueryData = await shopifyGraphQL(admin, `
        query getProductMedia($id: ID!) {
          product(id: $id) {
            media(first: 50) {
              edges { node { id } }
            }
          }
        }
      `, { id: productGid });

      const existingMediaIds = (
        (mediaQueryData.product as { media: { edges: Array<{ node: { id: string } }> } } | null)
          ?.media?.edges ?? []
      ).map((e) => e.node.id);

      if (existingMediaIds.length > 0) {
        const deleteData = await shopifyGraphQL(admin, `
          mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
            productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
              deletedMediaIds
              mediaUserErrors { field message }
            }
          }
        `, { productId: productGid, mediaIds: existingMediaIds });

        const deleteErrors = (
          deleteData.productDeleteMedia as { mediaUserErrors: Array<{ message: string }> }
        ).mediaUserErrors;
        if (deleteErrors?.length) throw new Error(`productDeleteMedia error: ${deleteErrors[0].message}`);
      }
    }

    // ── 7. Attach new images (Shopify fetches from originalSource URLs) ────────
    const attachData = await shopifyGraphQL(admin, `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { ... on MediaImage { id status } }
          mediaUserErrors { field message }
          product { id }
        }
      }
    `, { productId: productGid, media: mediaInput });

    const mediaErrors = (
      attachData.productCreateMedia as { mediaUserErrors: Array<{ message: string }> }
    ).mediaUserErrors;
    if (mediaErrors?.length) throw new Error(`productCreateMedia error: ${mediaErrors[0].message}`);

    // ── 8. Optionally sync completed video via Shopify Files ─────────────────
    const videoSync = isShopifyVideoSyncEnabled()
      ? await syncVideoToShopify({
          admin,
          outfit: outfit as OutfitForShopifySync,
          productGid,
          ownedByApp,
        })
      : null;

    // ── 9. Persist results ───────────────────────────────────────────────────
    const numericId = productGid.split('/').pop();
    const shopifyProductUrl = `https://${shopId}/admin/products/${numericId}`;

    await prisma.outfit.update({
      where: { id: outfitId },
      data: {
        shopifyProductId: productGid,
        shopifyProductUrl,
        shopifyProductCreatedByApp: ownedByApp,
        shopifySyncStatus: 'synced',
        shopifySyncedAt: new Date(),
        shopifySyncStartedAt: null,
        errorMessage: null,
        ...(videoSync
          ? {
              shopifyVideoFileId: videoSync.fileId,
              shopifyVideoMediaId: videoSync.mediaId,
            }
          : {}),
      },
    });

    logTaskLifecycle('task.completed', payload, {
      productGid,
      imageCount: ordered.length,
      videoSyncEnabled: isShopifyVideoSyncEnabled(),
      videoIncluded: videoSync?.included ?? false,
      videoSkippedReason: videoSync?.skippedReason,
    });
    return { outfitId, productGid, status: 'synced' };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function shopifyGraphQL(
  admin: ShopifyAdminClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await admin.graphql(query, { variables });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify API error: HTTP ${res.status} — ${body}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${json.errors[0].message}`);
  return json.data ?? {};
}

function isShopifyVideoSyncEnabled(): boolean {
  return process.env.SHOPIFY_VIDEO_SYNC_ENABLED !== 'false';
}

function formatGraphqlUserError(error: { field?: unknown; message: string }): string {
  const field = Array.isArray(error.field) ? `${error.field.join('.')}: ` : '';
  return `${field}${error.message}`;
}

function buildVideoFilename(outfitId: string, videoUrl: string): string {
  try {
    const pathname = new URL(videoUrl).pathname;
    const rawName = pathname.split('/').filter(Boolean).pop();
    if (rawName && /\.[a-z0-9]+$/i.test(rawName)) return rawName;
  } catch {
    // Fall back to deterministic naming below.
  }
  return `tiny-lemon-${outfitId}.mp4`;
}

function hasCompletedVideo(outfit: OutfitForShopifySync): outfit is OutfitForShopifySync & {
  videoUrl: string;
} {
  return outfit.videoStatus === 'completed' && typeof outfit.videoUrl === 'string' && outfit.videoUrl.length > 0;
}

function shouldReplaceTrackedVideo(outfit: OutfitForShopifySync): boolean {
  if (!outfit.shopifyVideoFileId) return true;
  if (outfit.shopifySyncStatus === 'stale') return true;
  if (!outfit.shopifySyncedAt || !outfit.videoGeneratedAt) return false;
  return outfit.videoGeneratedAt.getTime() > outfit.shopifySyncedAt.getTime();
}

async function syncVideoToShopify(args: {
  admin: ShopifyAdminClient;
  outfit: OutfitForShopifySync;
  productGid: string;
  ownedByApp: boolean;
}): Promise<ShopifyVideoSyncResult> {
  const { admin, outfit, productGid, ownedByApp } = args;

  if (!hasCompletedVideo(outfit)) {
    return {
      included: false,
      fileId: ownedByApp ? null : outfit.shopifyVideoFileId ?? null,
      mediaId: ownedByApp ? null : outfit.shopifyVideoMediaId ?? null,
      skippedReason: 'no_completed_video',
    };
  }

  if (!shouldReplaceTrackedVideo(outfit)) {
    return {
      included: false,
      fileId: outfit.shopifyVideoFileId ?? null,
      mediaId: outfit.shopifyVideoMediaId ?? null,
      skippedReason: 'already_synced',
    };
  }

  if (!ownedByApp && outfit.shopifyVideoFileId) {
    await removeTrackedVideoAssociation(admin, outfit.shopifyVideoFileId, productGid);
  }

  const filename = buildVideoFilename(outfit.id, outfit.videoUrl);
  const alt = `${outfit.name} video`;
  const videoBuffer = await downloadVideo(outfit.videoUrl);
  const stagedTarget = await createVideoStagedUpload(admin, filename, videoBuffer.length);
  await uploadVideoToStagedTarget(stagedTarget, videoBuffer, filename);
  const fileId = await createShopifyVideoFile(admin, stagedTarget.resourceUrl, alt);
  await waitForShopifyFileReady(admin, fileId);
  const mediaId = await associateVideoFileWithProduct(admin, productGid, fileId, alt);

  return {
    included: true,
    fileId,
    mediaId,
  };
}

async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const res = await fetch(videoUrl);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to download video for Shopify upload: HTTP ${res.status} ${body}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function createVideoStagedUpload(
  admin: ShopifyAdminClient,
  filename: string,
  fileSizeBytes: number,
): Promise<StagedUploadTarget> {
  const data = await shopifyGraphQL(admin, `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }
  `, {
    input: [
      {
        resource: 'VIDEO',
        filename,
        mimeType: 'video/mp4',
        httpMethod: 'POST',
        fileSize: String(fileSizeBytes),
      },
    ],
  });

  const payload = data.stagedUploadsCreate as {
    stagedTargets?: StagedUploadTarget[];
    userErrors?: Array<{ field?: unknown; message: string }>;
  };
  if (payload.userErrors?.length) {
    throw new Error(`stagedUploadsCreate error: ${formatGraphqlUserError(payload.userErrors[0])}`);
  }
  const target = payload.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) {
    throw new Error('stagedUploadsCreate error: missing staged upload target.');
  }
  return target;
}

async function uploadVideoToStagedTarget(
  target: StagedUploadTarget,
  videoBuffer: Buffer,
  filename: string,
): Promise<void> {
  const form = new FormData();
  for (const param of target.parameters) {
    form.append(param.name, param.value);
  }
  form.append('file', new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' }), filename);

  const res = await fetch(target.url, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify staged video upload failed: HTTP ${res.status} ${body}`);
  }
}

async function createShopifyVideoFile(
  admin: ShopifyAdminClient,
  resourceUrl: string,
  alt: string,
): Promise<string> {
  const data = await shopifyGraphQL(admin, `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
        }
        userErrors { field message }
      }
    }
  `, {
    files: [
      {
        originalSource: resourceUrl,
        alt,
        contentType: 'VIDEO',
      },
    ],
  });

  const payload = data.fileCreate as {
    files?: Array<{ id: string; fileStatus: string; alt?: string | null }>;
    userErrors?: Array<{ field?: unknown; message: string }>;
  };
  if (payload.userErrors?.length) {
    throw new Error(`fileCreate error: ${formatGraphqlUserError(payload.userErrors[0])}`);
  }
  const fileId = payload.files?.[0]?.id;
  if (!fileId) throw new Error('fileCreate error: missing Shopify video file ID.');
  return fileId;
}

async function waitForShopifyFileReady(admin: ShopifyAdminClient, fileId: string): Promise<void> {
  for (let attempt = 1; attempt <= VIDEO_FILE_POLL_ATTEMPTS; attempt += 1) {
    const data = await shopifyGraphQL(admin, `
      query fileStatus($id: ID!) {
        node(id: $id) {
          ... on File {
            fileStatus
          }
        }
      }
    `, { id: fileId });

    const status = (data.node as { fileStatus?: string } | null)?.fileStatus;
    if (status === 'READY') return;
    if (status === 'FAILED') throw new Error(`Shopify video file processing failed for ${fileId}.`);
    if (attempt < VIDEO_FILE_POLL_ATTEMPTS) {
      await wait.for({ seconds: VIDEO_FILE_POLL_INTERVAL_SECONDS });
    }
  }

  throw new Error(`Shopify video file did not become READY after ${VIDEO_FILE_POLL_ATTEMPTS} attempts.`);
}

async function associateVideoFileWithProduct(
  admin: ShopifyAdminClient,
  productGid: string,
  fileId: string,
  alt: string,
): Promise<string> {
  const data = await shopifyGraphQL(admin, `
    mutation fileUpdate($files: [FileUpdateInput!]!) {
      fileUpdate(files: $files) {
        files {
          id
          alt
          fileStatus
        }
        userErrors { field message }
      }
    }
  `, {
    files: [
      {
        id: fileId,
        alt,
        referencesToAdd: [productGid],
      },
    ],
  });

  const payload = data.fileUpdate as {
    files?: Array<{ id: string; alt?: string | null; fileStatus?: string }>;
    userErrors?: Array<{ field?: unknown; message: string }>;
  };
  if (payload.userErrors?.length) {
    throw new Error(`fileUpdate add video association error: ${formatGraphqlUserError(payload.userErrors[0])}`);
  }

  return payload.files?.[0]?.id ?? fileId;
}

async function removeTrackedVideoAssociation(
  admin: ShopifyAdminClient,
  fileId: string,
  productGid: string,
): Promise<void> {
  const data = await shopifyGraphQL(admin, `
    mutation fileUpdate($files: [FileUpdateInput!]!) {
      fileUpdate(files: $files) {
        files { id }
        userErrors { field message }
      }
    }
  `, {
    files: [
      {
        id: fileId,
        referencesToRemove: [productGid],
      },
    ],
  });

  const payload = data.fileUpdate as {
    userErrors?: Array<{ field?: unknown; message: string }>;
  };
  if (payload.userErrors?.length) {
    throw new Error(`fileUpdate remove video association error: ${formatGraphqlUserError(payload.userErrors[0])}`);
  }
}
