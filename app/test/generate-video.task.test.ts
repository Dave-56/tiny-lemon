import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  uploadBufferToBlob: vi.fn(),
  generateVideo: vi.fn(),
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

import { generateVideoTask as _generateVideoTask } from '../../trigger/generate-video.task';

const generateVideoTask = _generateVideoTask as unknown as {
  run: (payload: { outfitId: string; shopId: string; brandStyleId: string }) => Promise<{
    outfitId: string;
    status: string;
    videoUrl?: string;
  }>;
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
});
