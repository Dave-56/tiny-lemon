import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  uploadBufferToBlob: vi.fn(),
  generateVideo: vi.fn(),
  refundReservedGeneration: vi.fn(),
}));

vi.mock('@trigger.dev/sdk', () => ({
  task: (config: any) => config,
}));

vi.mock('../db.server', () => ({
  default: {
    outfit: {
      findFirst: mocks.outfitFindFirst,
      update: mocks.outfitUpdate,
    },
  },
}));

vi.mock('../blob.server', () => ({
  uploadBufferToBlob: mocks.uploadBufferToBlob,
}));

vi.mock('../lib/videoMotionPrompt', () => ({
  buildVideoMotionPrompt: () => ({ prompt: 'move naturally', negativePrompt: 'distortion' }),
}));

vi.mock('../lib/videoProvider.server', () => ({
  createVideoProvider: () => ({ generate: mocks.generateVideo }),
  getVideoDurationSeconds: () => 5,
}));

vi.mock('../lib/imageAssetManifest', () => ({
  parsePoseImageAssetManifest: () => null,
}));

vi.mock('../lib/observability.server', () => ({
  logServerEvent: vi.fn(),
}));

vi.mock('../lib/billing.server', () => ({
  refundReservedGeneration: mocks.refundReservedGeneration,
}));

import { generateVideoTask as _generateVideoTask } from '../../trigger/generate-video.task';

const generateVideoTask = _generateVideoTask as unknown as {
  run: (payload: {
    outfitId: string;
    shopId: string;
    brandStyleId: string;
    creditReservation?: {
      reservationDescription: string;
      refundDescription: string;
    };
  }) => Promise<{
    outfitId: string;
    status: string;
    videoUrl?: string;
  }>;
  onFailure: (args: {
    payload: {
      outfitId: string;
      shopId: string;
      brandStyleId: string;
      creditReservation?: {
        reservationDescription: string;
        refundDescription: string;
      };
    };
    error: unknown;
  }) => Promise<void>;
};

const baseImages = [
  {
    id: 'image-1',
    imageUrl: 'https://blob.example.com/front.png',
    pose: 'front',
    assetManifest: null,
    upscaleStatus: null,
  },
];

describe('generateVideoTask.run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.uploadBufferToBlob.mockResolvedValue('https://blob.example.com/final-video.mp4');
    mocks.generateVideo.mockResolvedValue({ videoUrl: 'https://provider.example.com/video.mp4' });
    mocks.refundReservedGeneration.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }));
  });

  it('marks an already-published outfit stale when video completes', async () => {
    mocks.outfitFindFirst
      .mockResolvedValueOnce({
        id: 'outfit-1',
        status: 'completed',
        shopifyProductId: 'gid://shopify/Product/123',
        images: baseImages,
      })
      .mockResolvedValueOnce({ images: baseImages });

    const result = await generateVideoTask.run({
      outfitId: 'outfit-1',
      shopId: 'shop-a.myshopify.com',
      brandStyleId: 'minimal',
    });

    expect(result).toMatchObject({
      outfitId: 'outfit-1',
      status: 'completed',
      videoUrl: 'https://blob.example.com/final-video.mp4',
    });

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data).toMatchObject({
      videoStatus: 'completed',
      videoUrl: 'https://blob.example.com/final-video.mp4',
      videoErrorMessage: null,
      shopifySyncStatus: 'stale',
    });
  });

  it('does not mark an unpublished outfit stale when video completes', async () => {
    mocks.outfitFindFirst
      .mockResolvedValueOnce({
        id: 'outfit-1',
        status: 'completed',
        shopifyProductId: null,
        images: baseImages,
      })
      .mockResolvedValueOnce({ images: baseImages });

    await generateVideoTask.run({
      outfitId: 'outfit-1',
      shopId: 'shop-a.myshopify.com',
      brandStyleId: 'minimal',
    });

    const finalUpdate = mocks.outfitUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data).not.toHaveProperty('shopifySyncStatus');
  });

  it('refunds the reserved credit when final task failure produces no video', async () => {
    await generateVideoTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        brandStyleId: 'minimal',
        creditReservation: {
          reservationDescription: 'generation reservation:video:generate:outfit-1:op-1',
          refundDescription: 'generation refund:video:generate:outfit-1:op-1:no_output_failure',
        },
      },
      error: new Error('provider failed'),
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      {
        reservationDescription: 'generation reservation:video:generate:outfit-1:op-1',
        refundDescription: 'generation refund:video:generate:outfit-1:op-1:no_output_failure',
      },
    );
    expect(mocks.outfitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outfit-1' },
        data: expect.objectContaining({ videoStatus: 'failed' }),
      }),
    );
  });

  it('refunds the reserved credit when video aborts because images changed', async () => {
    mocks.outfitFindFirst
      .mockResolvedValueOnce({
        id: 'outfit-1',
        status: 'completed',
        shopifyProductId: null,
        images: baseImages,
      })
      .mockResolvedValueOnce({
        images: [
          {
            ...baseImages[0],
            id: 'image-2',
            imageUrl: 'https://blob.example.com/new-front.png',
          },
        ],
      });

    const result = await generateVideoTask.run({
      outfitId: 'outfit-1',
      shopId: 'shop-a.myshopify.com',
      brandStyleId: 'minimal',
      creditReservation: {
        reservationDescription: 'generation reservation:video:generate:outfit-1:op-1',
        refundDescription: 'generation refund:video:generate:outfit-1:op-1:no_output_failure',
      },
    });

    expect(result).toEqual({ outfitId: 'outfit-1', status: 'aborted_stale' });
    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      {
        reservationDescription: 'generation reservation:video:generate:outfit-1:op-1',
        refundDescription: 'generation refund:video:generate:outfit-1:op-1:no_output_failure',
      },
    );
  });
});
