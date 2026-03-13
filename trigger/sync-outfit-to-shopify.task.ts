import { task } from '@trigger.dev/sdk/v3';
import prisma from '../app/db.server';

// Match the API version used in shopify.server.ts (ApiVersion.October25)
const SHOPIFY_API_VERSION = '2025-10';

// ── Payload ───────────────────────────────────────────────────────────────────

interface SyncOutfitPayload {
  outfitId: string;
  shopId: string;
  /** Existing Shopify product GID — if set, skip productCreate and update in place. */
  shopifyProductId?: string;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const syncOutfitToShopifyTask = task({
  id: 'sync-outfit-to-shopify',
  maxDuration: 600,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, factor: 2 },

  onFailure: async ({ payload, error }: { payload: SyncOutfitPayload; error: unknown }) => {
    const errorMessage = error instanceof Error ? error.message : 'Shopify sync failed.';
    await prisma.outfit
      .update({ where: { id: payload.outfitId }, data: { shopifySyncStatus: 'failed', errorMessage } })
      .catch(() => {});
  },

  run: async (payload: SyncOutfitPayload) => {
    const { outfitId, shopId } = payload;

    // ── 1. Fetch outfit + images ──────────────────────────────────────────────
    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      include: { images: true },
    });
    if (!outfit) throw new Error(`Outfit ${outfitId} not found for shop ${shopId}.`);
    if (outfit.status !== 'completed') throw new Error('Outfit is not completed. Cannot sync.');

    // Idempotency guard: bail if already syncing recently (< 10 min)
    if (
      outfit.shopifySyncStatus === 'syncing' &&
      outfit.shopifySyncedAt &&
      Date.now() - outfit.shopifySyncedAt.getTime() < 10 * 60 * 1000
    ) {
      return { outfitId, status: 'already_syncing' };
    }

    // ── 2. Fetch offline access token from session table ──────────────────────
    // Token is fetched here (not in payload) to avoid it appearing in run logs.
    const session = await prisma.session.findFirst({
      where: { shop: shopId, isOnline: false },
      select: { accessToken: true },
    });
    if (!session?.accessToken) throw new Error(`No offline session found for shop ${shopId}.`);
    const { accessToken } = session;

    await prisma.outfit.update({
      where: { id: outfitId },
      data: { shopifySyncStatus: 'syncing', shopifySyncedAt: new Date() },
    });

    // ── 3. Order images: front → three-quarter → back ─────────────────────────
    const ordered = ['front', 'three-quarter', 'back']
      .map((pose) => outfit.images.find((img) => img.pose === pose))
      .filter((img): img is NonNullable<typeof img> => !!img);

    if (ordered.length === 0) throw new Error('Outfit has no generated images to sync.');

    // ── 4. Fetch all image buffers in parallel ────────────────────────────────
    const buffers = await Promise.all(
      ordered.map(async (img) => {
        const res = await fetch(img.imageUrl);
        if (!res.ok) throw new Error(`Failed to fetch image (${img.pose}): HTTP ${res.status}`);
        return { img, buffer: Buffer.from(await res.arrayBuffer()) };
      }),
    );

    // ── 5. Batch staged uploads — fileSize required upfront ───────────────────
    const stagedInput = buffers.map(({ img, buffer }) => ({
      filename: `${img.pose}.png`,
      mimeType: 'image/png',
      resource: 'PRODUCT_IMAGE',
      fileSize: buffer.byteLength.toString(),
    }));

    const stagedData = await shopifyGraphQL(shopId, accessToken, `
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
    `, { input: stagedInput });

    const { stagedTargets, userErrors: stageErrors } = stagedData.stagedUploadsCreate as {
      stagedTargets: Array<{ url: string; resourceUrl: string; parameters: Array<{ name: string; value: string }> }>;
      userErrors: Array<{ field: string; message: string }>;
    };

    if (stageErrors?.length) throw new Error(`stagedUploadsCreate error: ${stageErrors[0].message}`);
    if (!stagedTargets?.length) throw new Error('stagedUploadsCreate returned no targets.');

    // ── 6. Upload buffers to S3 staged targets in parallel ────────────────────
    await Promise.all(
      buffers.map(async ({ buffer }, i) => {
        const target = stagedTargets[i];
        const form = new FormData();
        // Shopify S3 requires parameters before the file field
        for (const { name, value } of target.parameters) {
          form.append(name, value);
        }
        form.append('file', new Blob([buffer], { type: 'image/png' }), `${ordered[i].pose}.png`);
        const res = await fetch(target.url, { method: 'POST', body: form });
        if (!res.ok) throw new Error(`S3 upload failed for ${ordered[i].pose}: HTTP ${res.status}`);
      }),
    );

    const resourceUrls = stagedTargets.map((t) => t.resourceUrl);

    // ── 7. Create product or reuse existing ───────────────────────────────────
    let productGid = payload.shopifyProductId;
    if (!productGid) {
      const createData = await shopifyGraphQL(shopId, accessToken, `
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
    }

    // ── 8. Query existing media IDs (needed for productDeleteMedia) ───────────
    const mediaQueryData = await shopifyGraphQL(shopId, accessToken, `
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

    // ── 9. Delete old media before attaching new ──────────────────────────────
    if (existingMediaIds.length > 0) {
      const deleteData = await shopifyGraphQL(shopId, accessToken, `
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

    // ── 10. Attach new images ─────────────────────────────────────────────────
    const mediaInput = resourceUrls.map((url, i) => ({
      originalSource: url,
      alt: ordered[i].pose,
      mediaContentType: 'IMAGE',
    }));

    const attachData = await shopifyGraphQL(shopId, accessToken, `
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

    // ── 11. Persist results ───────────────────────────────────────────────────
    const numericId = productGid.split('/').pop();
    const shopifyProductUrl = `https://${shopId}/admin/products/${numericId}`;

    await prisma.outfit.update({
      where: { id: outfitId },
      data: {
        shopifyProductId: productGid,
        shopifyProductUrl,
        shopifySyncStatus: 'synced',
        shopifySyncedAt: new Date(),
      },
    });

    return { outfitId, productGid, status: 'synced' };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function shopifyGraphQL(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Shopify API error: HTTP ${res.status} — ${body}`);
  }
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Shopify GraphQL error: ${json.errors[0].message}`);
  return json.data ?? {};
}
