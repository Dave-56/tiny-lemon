import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  adminGraphql: vi.fn(),
  unauthenticatedAdmin: vi.fn(),
  waitFor: vi.fn(),
}));

vi.mock('@trigger.dev/sdk', () => ({
  task: (config: any) => config,
  wait: { for: mocks.waitFor },
}));

vi.mock('../db.server', () => ({
  default: {
    outfit: { findFirst: mocks.outfitFindFirst, update: mocks.outfitUpdate },
  },
}));

vi.mock('../shopify.server', () => ({
  unauthenticated: {
    admin: mocks.unauthenticatedAdmin,
  },
}));

vi.mock('../lib/imageAssetManifest', () => ({
  parsePoseImageAssetManifest: () => null,
}));

vi.mock('../lib/observability.server', () => ({
  logServerEvent: vi.fn(),
}));

import { syncOutfitToShopifyTask as _syncOutfitToShopifyTask } from '../../trigger/sync-outfit-to-shopify.task';

// `task({ run })` is mocked above to return the config object directly, so
// `.run(payload)` is callable at runtime; cast through `any` to satisfy TS.
const syncOutfitToShopifyTask = _syncOutfitToShopifyTask as unknown as {
  run: (payload: { outfitId: string; shopId: string; shopifyProductId?: string }) => Promise<{ outfitId: string; productGid?: string; status: string }>;
};

const SHOP = 'shop-a.myshopify.com';
const OUTFIT_ID = 'outfit-1';
const EXISTING_PRODUCT_GID = 'gid://shopify/Product/999';

const baseOutfit = {
  id: OUTFIT_ID,
  shopId: SHOP,
  name: 'Demo Outfit',
  status: 'completed',
  shopifySyncStatus: null as string | null,
  shopifySyncedAt: null as Date | null,
  shopifyProductCreatedByApp: false,
  videoStatus: null as string | null,
  videoUrl: null as string | null,
  videoGeneratedAt: null as Date | null,
  shopifyVideoFileId: null as string | null,
  shopifyVideoMediaId: null as string | null,
  images: [
    {
      pose: 'front',
      imageUrl: 'https://blob/front.jpg',
      assetManifest: null,
    },
  ],
};

function graphqlResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
    text: async () => '',
  };
}

function extractMutationNames(graphqlMock: typeof mocks.adminGraphql): string[] {
  return graphqlMock.mock.calls.map((call) => {
    const query = call[0] as string;
    const match = query.match(/(?:mutation|query)\s+(\w+)/);
    return match ? match[1] : 'unknown';
  });
}

describe('syncOutfitToShopifyTask.run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SHOPIFY_VIDEO_SYNC_ENABLED;
    mocks.unauthenticatedAdmin.mockResolvedValue({
      admin: { graphql: mocks.adminGraphql },
    });
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.waitFor.mockResolvedValue(undefined);
  });

  it('creates a product and wipes existing media when payload has no shopifyProductId', async () => {
    mocks.outfitFindFirst.mockResolvedValue({ ...baseOutfit });

    mocks.adminGraphql
      .mockResolvedValueOnce(
        graphqlResponse({ productCreate: { product: { id: EXISTING_PRODUCT_GID }, userErrors: [] } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          product: { media: { edges: [{ node: { id: 'gid://shopify/MediaImage/1' } }] } },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({ productDeleteMedia: { deletedMediaIds: [], mediaUserErrors: [] } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({ productCreateMedia: { media: [], mediaUserErrors: [], product: { id: EXISTING_PRODUCT_GID } } }),
      );

    const result = await syncOutfitToShopifyTask.run({ outfitId: OUTFIT_ID, shopId: SHOP });

    expect(result).toMatchObject({ outfitId: OUTFIT_ID, status: 'synced' });

    expect(mocks.unauthenticatedAdmin).toHaveBeenCalledWith(SHOP);

    const names = extractMutationNames(mocks.adminGraphql);
    expect(names).toEqual(['productCreate', 'getProductMedia', 'productDeleteMedia', 'productCreateMedia']);

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.shopifyProductCreatedByApp).toBe(true);
    expect(finalUpdate.data.shopifySyncStatus).toBe('synced');
  });

  it('skips media deletion when publishing to a merchant-picked product (shopifyProductCreatedByApp=false)', async () => {
    mocks.outfitFindFirst.mockResolvedValue({
      ...baseOutfit,
      shopifyProductId: EXISTING_PRODUCT_GID,
      shopifyProductCreatedByApp: false,
    });

    mocks.adminGraphql.mockResolvedValueOnce(
      graphqlResponse({ productCreateMedia: { media: [], mediaUserErrors: [], product: { id: EXISTING_PRODUCT_GID } } }),
    );

    const result = await syncOutfitToShopifyTask.run({
      outfitId: OUTFIT_ID,
      shopId: SHOP,
      shopifyProductId: EXISTING_PRODUCT_GID,
    });

    expect(result).toMatchObject({ outfitId: OUTFIT_ID, productGid: EXISTING_PRODUCT_GID, status: 'synced' });

    expect(mocks.unauthenticatedAdmin).toHaveBeenCalledWith(SHOP);

    const names = extractMutationNames(mocks.adminGraphql);
    expect(names).toEqual(['productCreateMedia']);
    expect(names).not.toContain('productDeleteMedia');
    expect(names).not.toContain('productCreate');

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.shopifyProductCreatedByApp).toBe(false);
  });

  it('syncs completed video through Shopify Files when enabled', async () => {
    process.env.SHOPIFY_VIDEO_SYNC_ENABLED = 'true';

    const videoGeneratedAt = new Date('2026-05-28T12:00:00.000Z');
    const shopifySyncedAt = new Date('2026-05-28T11:00:00.000Z');
    mocks.outfitFindFirst.mockResolvedValue({
      ...baseOutfit,
      shopifyProductId: EXISTING_PRODUCT_GID,
      shopifySyncedAt,
      shopifyProductCreatedByApp: false,
      videoStatus: 'completed',
      videoUrl: 'https://blob.example.com/video.mp4',
      videoGeneratedAt,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      });
    vi.stubGlobal('fetch', fetchMock);

    mocks.adminGraphql
      .mockResolvedValueOnce(
        graphqlResponse({ productCreateMedia: { media: [], mediaUserErrors: [], product: { id: EXISTING_PRODUCT_GID } } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          stagedUploadsCreate: {
            stagedTargets: [
              {
                url: 'https://shopify-upload.example.com',
                resourceUrl: 'https://shopify-resource.example.com/video.mp4?external_video_id=1',
                parameters: [{ name: 'key', value: 'video.mp4' }],
              },
            ],
            userErrors: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          fileCreate: {
            files: [{ id: 'gid://shopify/Video/123', fileStatus: 'PROCESSING', alt: 'Demo Outfit video' }],
            userErrors: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({ node: { fileStatus: 'READY' } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          productUpdate: {
            product: {
              id: EXISTING_PRODUCT_GID,
              media: {
                nodes: [
                  {
                    id: 'gid://shopify/Video/123',
                    alt: 'Demo Outfit video',
                    mediaContentType: 'VIDEO',
                    status: 'READY',
                  },
                ],
              },
            },
            userErrors: [],
          },
        }),
      );

    await syncOutfitToShopifyTask.run({
      outfitId: OUTFIT_ID,
      shopId: SHOP,
      shopifyProductId: EXISTING_PRODUCT_GID,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://blob.example.com/video.mp4');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://shopify-upload.example.com',
      expect.objectContaining({ method: 'POST' }),
    );

    const names = extractMutationNames(mocks.adminGraphql);
    expect(names).toEqual([
      'productCreateMedia',
      'stagedUploadsCreate',
      'fileCreate',
      'fileStatus',
      'productUpdate',
    ]);

    const stagedVariables = mocks.adminGraphql.mock.calls[1][1].variables;
    expect(stagedVariables.input[0]).toMatchObject({
      resource: 'VIDEO',
      mimeType: 'video/mp4',
      httpMethod: 'POST',
      fileSize: '3',
    });

    const productUpdateVariables = mocks.adminGraphql.mock.calls[4][1].variables;
    expect(productUpdateVariables.media[0]).toEqual({
      originalSource: 'gid://shopify/Video/123',
      alt: 'Demo Outfit video',
      mediaContentType: 'VIDEO',
    });

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.shopifyVideoFileId).toBe('gid://shopify/Video/123');
    expect(finalUpdate.data.shopifyVideoMediaId).toBe('gid://shopify/Video/123');
    expect(finalUpdate.data.shopifySyncStatus).toBe('synced');
  });

  it('does not sync video when the feature flag is disabled', async () => {
    process.env.SHOPIFY_VIDEO_SYNC_ENABLED = 'false';

    mocks.outfitFindFirst.mockResolvedValue({
      ...baseOutfit,
      shopifyProductId: EXISTING_PRODUCT_GID,
      videoStatus: 'completed',
      videoUrl: 'https://blob.example.com/video.mp4',
      videoGeneratedAt: new Date(),
    });

    mocks.adminGraphql.mockResolvedValueOnce(
      graphqlResponse({ productCreateMedia: { media: [], mediaUserErrors: [], product: { id: EXISTING_PRODUCT_GID } } }),
    );

    await syncOutfitToShopifyTask.run({
      outfitId: OUTFIT_ID,
      shopId: SHOP,
      shopifyProductId: EXISTING_PRODUCT_GID,
    });

    const names = extractMutationNames(mocks.adminGraphql);
    expect(names).toEqual(['productCreateMedia']);

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data).not.toHaveProperty('shopifyVideoFileId');
    expect(finalUpdate.data).not.toHaveProperty('shopifyVideoMediaId');
  });

  it('removes tracked merchant-product video before replacing it', async () => {
    process.env.SHOPIFY_VIDEO_SYNC_ENABLED = 'true';

    mocks.outfitFindFirst.mockResolvedValue({
      ...baseOutfit,
      shopifyProductId: EXISTING_PRODUCT_GID,
      shopifyProductCreatedByApp: false,
      shopifySyncStatus: 'stale',
      shopifySyncedAt: new Date('2026-05-28T11:00:00.000Z'),
      shopifyVideoFileId: 'gid://shopify/Video/old',
      shopifyVideoMediaId: 'gid://shopify/Video/old',
      videoStatus: 'completed',
      videoUrl: 'https://blob.example.com/new-video.mp4',
      videoGeneratedAt: new Date('2026-05-28T12:00:00.000Z'),
    });

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      }));

    mocks.adminGraphql
      .mockResolvedValueOnce(
        graphqlResponse({ productCreateMedia: { media: [], mediaUserErrors: [], product: { id: EXISTING_PRODUCT_GID } } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({ fileUpdate: { files: [{ id: 'gid://shopify/Video/old' }], userErrors: [] } }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({
          stagedUploadsCreate: {
            stagedTargets: [
              {
                url: 'https://shopify-upload.example.com',
                resourceUrl: 'https://shopify-resource.example.com/new-video.mp4?external_video_id=2',
                parameters: [],
              },
            ],
            userErrors: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        graphqlResponse({ fileCreate: { files: [{ id: 'gid://shopify/Video/new', fileStatus: 'PROCESSING' }], userErrors: [] } }),
      )
      .mockResolvedValueOnce(graphqlResponse({ node: { fileStatus: 'READY' } }))
      .mockResolvedValueOnce(
        graphqlResponse({
          productUpdate: {
            product: {
              media: {
                nodes: [
                  {
                    id: 'gid://shopify/Video/new',
                    alt: 'Demo Outfit video',
                    mediaContentType: 'VIDEO',
                  },
                ],
              },
            },
            userErrors: [],
          },
        }),
      );

    await syncOutfitToShopifyTask.run({
      outfitId: OUTFIT_ID,
      shopId: SHOP,
      shopifyProductId: EXISTING_PRODUCT_GID,
    });

    const names = extractMutationNames(mocks.adminGraphql);
    expect(names).toEqual([
      'productCreateMedia',
      'fileUpdate',
      'stagedUploadsCreate',
      'fileCreate',
      'fileStatus',
      'productUpdate',
    ]);

    const fileUpdateVariables = mocks.adminGraphql.mock.calls[1][1].variables;
    expect(fileUpdateVariables.files[0]).toEqual({
      id: 'gid://shopify/Video/old',
      referencesToRemove: [EXISTING_PRODUCT_GID],
    });

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.shopifyVideoFileId).toBe('gid://shopify/Video/new');
    expect(finalUpdate.data.shopifyVideoMediaId).toBe('gid://shopify/Video/new');
  });
});
