import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  capacityMessage:
    'AI image generation is temporarily at capacity. Please try again in a few minutes.',
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  refundReservedGeneration: vi.fn(),
  logServerEvent: vi.fn(),
  markOutfitGenerationRequestCompleted: vi.fn(),
  markOutfitGenerationRequestFailed: vi.fn(),
}));

const IMAGE_SERVICE_CAPACITY_MESSAGE = mocks.capacityMessage;

vi.mock('@trigger.dev/sdk', () => ({
  task: (config: unknown) => config,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(),
  ThinkingLevel: { MINIMAL: 'MINIMAL' },
}));

vi.mock('../db.server', () => ({
  default: {
    outfit: {
      findFirst: mocks.outfitFindFirst,
      update: mocks.outfitUpdate,
    },
  },
}));

vi.mock('../lib/billing.server', () => ({
  DEMO_SHOP_ID: '__demo__',
  refundReservedGeneration: mocks.refundReservedGeneration,
}));

vi.mock('../lib/observability.server', () => ({
  logServerEvent: mocks.logServerEvent,
}));

vi.mock('../lib/outfitGenerationRequests.server', () => ({
  markOutfitGenerationRequestCompleted: mocks.markOutfitGenerationRequestCompleted,
  markOutfitGenerationRequestFailed: mocks.markOutfitGenerationRequestFailed,
}));

vi.mock('../lib/flatLayCleanup', () => ({
  IMAGE_SERVICE_CAPACITY_MESSAGE: mocks.capacityMessage,
  IMAGE_SERVICE_BILLING_CONFIGURATION_MESSAGE:
    'AI image generation is currently unavailable. Our team has been alerted. Please try again later.',
  IMAGE_SERVICE_QUOTA_OR_RATE_LIMIT_MESSAGE:
    'AI image generation is busy right now. Please try again in a few minutes.',
  IMAGE_SERVICE_UNAVAILABLE_MESSAGE:
    'AI image generation provider is temporarily unavailable. Please try again shortly.',
  cleanFlatLay: vi.fn(),
  cleanFlatLayForDemo: vi.fn(),
  createUserFacingImageProviderError: vi.fn(),
  hasCleanWhiteFlatLayBackground: vi.fn(),
  isRefundableImageProviderFailure: (error: unknown) => {
    if (error && typeof error === 'object') {
      const kind = (error as { providerErrorKind?: unknown }).providerErrorKind;
      if (
        kind === 'quota_or_rate_limit' ||
        kind === 'provider_billing' ||
        kind === 'provider_unavailable'
      ) {
        return true;
      }
    }
    const message = error instanceof Error ? error.message : String(error ?? '');
    return message === mocks.capacityMessage;
  },
  logImageProviderError: vi.fn(),
  normalizeFlatLayToPng: vi.fn(),
}));

vi.mock('../blob.server', () => ({
  uploadImageToBlob: vi.fn(),
}));

vi.mock('../lib/garmentSpec', () => ({
  extractGarmentSpec: vi.fn(),
}));

vi.mock('../lib/garmentFidelityPrompt', () => ({
  buildPromptFromSpec: vi.fn(),
}));

vi.mock('../lib/tryDemoPrompt', () => ({
  buildTryDemoPrompt: vi.fn(),
}));

vi.mock('../lib/normalizeReferenceImage.server', () => ({
  normalizeReferenceImageServer: vi.fn(),
}));

vi.mock('../lib/pdpPresets', () => ({
  PDP_STYLE_PRESETS: [{ id: 'white-studio', promptSnippet: 'white studio' }],
  BRAND_STYLE_PRESETS: [{ id: 'minimal', backdropSnippet: 'minimal' }],
}));

vi.mock('../lib/generatedImagePersistence.server', () => ({
  createGeneratedImageOrReuse: vi.fn(),
  deleteGeneratedImagesNotInPoses: vi.fn(),
  upsertGeneratedImageByPose: vi.fn(),
}));

vi.mock('../lib/imageAssetManifest.server', () => ({
  createPoseAssetManifest: vi.fn(),
}));

vi.mock('../lib/videoOrchestration.server', () => ({
  clearOutfitVideoStateInTransaction: vi.fn(),
}));

vi.mock('../lib/triggerJobs.server', () => ({
  cancelRunSafely: vi.fn(),
}));

vi.mock('../lib/geminiModels', () => ({
  GEMINI_IMAGE_MODEL: 'gemini-image',
  GEMINI_TEXT_MODEL: 'gemini-text',
}));

import { generateOutfitTask as _generateOutfitTask } from '../../trigger/generate-outfit.task';
import { regenerateOutfitTask as _regenerateOutfitTask } from '../../trigger/regenerate-outfit.task';
import { GraphicFidelityGenerationError } from '../lib/generationErrors.server';

type TaskWithFailureHook = {
  onFailure: (args: {
    payload: Record<string, unknown>;
    error: unknown;
  }) => Promise<void>;
};

const generateOutfitTask = _generateOutfitTask as unknown as TaskWithFailureHook;
const regenerateOutfitTask = _regenerateOutfitTask as unknown as TaskWithFailureHook;

const creditReservation = {
  reservationDescription: 'generation reservation:generate:model-01:op-1',
  refundDescription: 'generation refund:generate:model-01:op-1:provider_capacity_failure',
};

describe('generation task capacity refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outfitFindFirst.mockResolvedValue({ errorMessage: null });
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.refundReservedGeneration.mockResolvedValue(true);
    mocks.markOutfitGenerationRequestCompleted.mockResolvedValue(undefined);
    mocks.markOutfitGenerationRequestFailed.mockResolvedValue(undefined);
  });

  it('refunds generate credits when final failure is provider capacity', async () => {
    await generateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        rawFrontUrl: 'https://blob.example/front.png',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        generationRequestId: 'generation-request-1',
        creditReservation,
      },
      error: new Error(IMAGE_SERVICE_CAPACITY_MESSAGE),
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      creditReservation,
    );
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: 'outfit-1' },
      data: {
        status: 'failed',
        errorMessage:
          'AI image generation provider is temporarily unavailable. This attempt was not counted. Please try again shortly.',
      },
    });
    expect(mocks.markOutfitGenerationRequestFailed).toHaveBeenCalledWith({
      generationRequestId: 'generation-request-1',
      shopId: 'shop-a.myshopify.com',
      failureReason:
        'AI image generation provider is temporarily unavailable. This attempt was not counted. Please try again shortly.',
    });
  });

  it('refunds generate credits when final failure carries a refundable provider kind', async () => {
    const error = new Error('AI image service is temporarily unavailable. Please try again shortly.');
    Object.assign(error, { providerErrorKind: 'provider_unavailable' });

    await generateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        rawFrontUrl: 'https://blob.example/front.png',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        creditReservation,
      },
      error,
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      creditReservation,
    );
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: 'outfit-1' },
      data: {
        status: 'failed',
        errorMessage:
          'AI image generation provider is temporarily unavailable. This attempt was not counted. Please try again shortly.',
      },
    });
  });

  it('shows billing configuration copy when a refunded provider billing failure reaches the customer', async () => {
    const error = new Error('AI image generation is currently unavailable. Our team has been alerted. Please try again later.');
    Object.assign(error, { providerErrorKind: 'provider_billing' });

    await generateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        rawFrontUrl: 'https://blob.example/front.png',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        creditReservation,
      },
      error,
    });

    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: 'outfit-1' },
      data: {
        status: 'failed',
        errorMessage:
          'AI image generation is currently unavailable. This attempt was not counted. Our team has been alerted. Please try again later.',
      },
    });
  });

  it('does not refund generate credits for non-capacity failures', async () => {
    await generateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        rawFrontUrl: 'https://blob.example/front.png',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        creditReservation,
      },
      error: new Error('Image filtered by safety system. Try a different garment image.'),
    });

    expect(mocks.refundReservedGeneration).not.toHaveBeenCalled();
  });

  it('refunds and sanitizes generate failures when storage fails after generation', async () => {
    await generateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        rawFrontUrl: 'https://blob.example/front.png',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        creditReservation,
      },
      error: new Error(
        'Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.',
      ),
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      creditReservation,
    );
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: 'outfit-1' },
      data: {
        status: 'failed',
        errorMessage:
          'We hit a storage issue while saving your image. This attempt was not counted. Please try again.',
      },
    });
  });

  it('refunds and sanitizes generate failures when graphic fidelity validation fails', async () => {
    await generateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        rawFrontUrl: 'https://blob.example/front.png',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        creditReservation,
      },
      error: new GraphicFidelityGenerationError(),
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      creditReservation,
    );
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: 'outfit-1' },
      data: {
        status: 'failed',
        errorMessage:
          'Image generation failed to preserve the product graphic. This attempt was not counted. Please try again.',
      },
    });
  });

  it('refunds regenerate credits when final failure is provider capacity', async () => {
    const regenerateReservation = {
      reservationDescription: 'generation reservation:regenerate:outfit-1:op-1',
      refundDescription: 'generation refund:regenerate:outfit-1:op-1:provider_capacity_failure',
    };

    await regenerateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        generationRequestId: 'generation-request-2',
        creditReservation: regenerateReservation,
      },
      error: new Error(IMAGE_SERVICE_CAPACITY_MESSAGE),
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      regenerateReservation,
    );
    expect(mocks.markOutfitGenerationRequestFailed).toHaveBeenCalledWith({
      generationRequestId: 'generation-request-2',
      shopId: 'shop-a.myshopify.com',
      failureReason:
        'AI image generation provider is temporarily unavailable. This attempt was not counted. Please try again shortly.',
    });
  });

  it('refunds regenerate credits when graphic fidelity validation fails', async () => {
    const regenerateReservation = {
      reservationDescription: 'generation reservation:regenerate:outfit-1:op-1',
      refundDescription: 'generation refund:regenerate:outfit-1:op-1:graphic_fidelity_failure',
    };

    await regenerateOutfitTask.onFailure({
      payload: {
        outfitId: 'outfit-1',
        shopId: 'shop-a.myshopify.com',
        modelImageUrl: 'https://blob.example/model.png',
        styleId: 'white-studio',
        brandStyleId: 'minimal',
        allowedPoses: ['front'],
        creditReservation: regenerateReservation,
      },
      error: new GraphicFidelityGenerationError(),
    });

    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      'shop-a.myshopify.com',
      regenerateReservation,
    );
  });
});
