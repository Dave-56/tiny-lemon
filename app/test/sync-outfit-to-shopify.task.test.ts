import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  adminGraphql: vi.fn(),
  unauthenticatedAdmin: vi.fn(),
}));

vi.mock('@trigger.dev/sdk', () => ({
  task: (config: any) => config,
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
    mocks.unauthenticatedAdmin.mockResolvedValue({
      admin: { graphql: mocks.adminGraphql },
    });
    mocks.outfitUpdate.mockResolvedValue({});
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
});
