import { task } from '@trigger.dev/sdk';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import {
  deleteGeneratedImagesNotInPoses,
  upsertGeneratedImageByPose,
} from '../app/lib/generatedImagePersistence.server';
import { createPoseAssetManifest } from '../app/lib/imageAssetManifest.server';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { logServerEvent } from '../app/lib/observability.server';
import {
  clearOutfitVideoStateInTransaction,
} from '../app/lib/videoOrchestration.server';
import { cancelRunSafely } from '../app/lib/triggerJobs.server';
import { PDP_STYLE_PRESETS, BRAND_STYLE_PRESETS } from '../app/lib/pdpPresets';
import {
  createUserFacingImageProviderError,
  logImageProviderError,
} from '../app/lib/flatLayCleanup';
import { refundReservedGeneration } from '../app/lib/billing.server';
import { GEMINI_IMAGE_MODEL, GEMINI_TEXT_MODEL } from '../app/lib/geminiModels';
import type { GarmentSpec } from '../app/lib/garmentSpec';
import type { PoseImageAssetManifest } from '../app/lib/imageAssetManifest';
import {
  getGraphicPromptContextForPose,
  validateGeneratedGraphicFidelity,
} from '../app/lib/graphicFidelity';
import {
  GraphicFidelityGenerationError,
  getUserFacingGenerationError,
  maybeRefundFailedGeneration,
} from '../app/lib/generationErrors.server';

type StoredGarmentSpec = GarmentSpec & {
  referenceContext?: {
    primaryImageSide?: 'front' | 'back';
    frontDescription?: string | null;
    backDescription?: string | null;
  };
};

// ── Payload ───────────────────────────────────────────────────────────────────

interface RegenerateOutfitPayload {
  outfitId: string;
  shopId: string;
  /** Optional user direction merged into each pose prompt (e.g. "Warmer lighting, less shadow"). */
  userDirection?: string;
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
  styleId: string;
  /** Brand price point (value | mid-market | premium | luxury) — shapes production quality cue in prompt. */
  pricePoint?: string;
  /** Brand energy (minimal | accessible | editorial | premium | street | athletic) — shapes mood/tone cue in prompt. */
  brandEnergy?: string;
  /** Primary category (womenswear | menswear | unisex | activewear | streetwear | formalwear | other) — shapes category context in prompt. */
  primaryCategory?: string;
  allowedPoses: string[];
  creditReservation?: {
    reservationDescription: string;
    refundDescription: string;
  };
}

function logTaskLifecycle(
  event: 'task.started' | 'task.completed' | 'task.failed_final',
  payload: RegenerateOutfitPayload,
  extras: Record<string, unknown> = {},
) {
  logServerEvent(event === 'task.failed_final' ? 'error' : 'info', event, {
    taskId: 'regenerate-outfit',
    outfitId: payload.outfitId,
    shopId: payload.shopId,
    allowedPoses: payload.allowedPoses,
    hasUserDirection: Boolean(payload.userDirection?.trim()),
    ...extras,
  });
}

// ── Helpers (mirror generate-outfit) ────────────────────────────────────────────

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString('base64');
}

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function inferImageMimeFromUrl(url: string): 'image/png' | 'image/jpeg' {
  const pathname = new URL(url).pathname.toLowerCase();
  return pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
}

type GenerateContentRequest = Parameters<GoogleGenAI['models']['generateContent']>[0];
type GenerateContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: 'image/png' | 'image/jpeg' } };

function buildGenerationParts(args: {
  instruction?: string;
  garmentB64: string;
  garmentMime: 'image/png';
  modelB64: string;
  prompt: string;
  rawGraphicReferenceB64?: string;
  rawGraphicReferenceMime?: 'image/png' | 'image/jpeg';
  graphicReferenceCropB64?: string;
  frontAnchorB64?: string;
}): GenerateContentPart[] {
  const parts: GenerateContentPart[] = [];
  if (args.instruction) parts.push({ text: args.instruction });
  parts.push(
    { text: 'IMAGE 1: Cleaned or normalized garment flat lay reference.' },
    { inlineData: { data: args.garmentB64, mimeType: args.garmentMime } },
  );
  let nextImage = 2;
  if (args.rawGraphicReferenceB64) {
    parts.push(
      { text: 'IMAGE 2: Original merchant upload reference for raw garment graphic, logo, print, or typography details.' },
      { inlineData: { data: args.rawGraphicReferenceB64, mimeType: args.rawGraphicReferenceMime ?? 'image/png' } },
    );
    nextImage = 3;
  }
  if (args.graphicReferenceCropB64) {
    parts.push(
      { text: `IMAGE ${nextImage}: Close-up reference crop for the garment graphic, logo, print, or typography.` },
      { inlineData: { data: args.graphicReferenceCropB64, mimeType: 'image/png' } },
    );
    nextImage += 1;
  }
  parts.push(
    { text: `IMAGE ${nextImage}: Model reference image.` },
    { inlineData: { data: args.modelB64, mimeType: 'image/png' } },
  );
  nextImage += 1;
  if (args.frontAnchorB64) {
    parts.push(
      { text: `IMAGE ${nextImage}: Front generated image for background, lighting, and outfit consistency only.` },
      { inlineData: { data: args.frontAnchorB64, mimeType: 'image/png' } },
    );
  }
  parts.push({ text: args.prompt });
  return parts;
}

async function retryIfGraphicFidelityFailed(args: {
  ai: GoogleGenAI;
  b64: string;
  contents: GenerateContentRequest['contents'];
  config: GenerateContentRequest['config'];
  graphicReferenceCropB64?: string;
  description?: string;
  outfitId: string;
  shopId: string;
  stage: string;
}): Promise<string> {
  if (!args.graphicReferenceCropB64) return args.b64;
  const verdict = await validateGeneratedGraphicFidelity(args.ai, {
    referenceCropBase64: args.graphicReferenceCropB64,
    generatedImageBase64: args.b64,
    description: args.description,
    outfitId: args.outfitId,
    shopId: args.shopId,
    taskId: 'regenerate-outfit',
    stage: args.stage,
  });
  if (verdict !== 'failed') return args.b64;

  const retryResp = await generateImageContent(args.ai, {
    model: GEMINI_IMAGE_MODEL,
    contents: args.contents,
    config: args.config,
  }, { outfitId: args.outfitId, shopId: args.shopId, stage: `${args.stage}_graphic_retry` });
  const retryB64 = extractBase64(retryResp);
  const retryVerdict = await validateGeneratedGraphicFidelity(args.ai, {
    referenceCropBase64: args.graphicReferenceCropB64,
    generatedImageBase64: retryB64,
    description: args.description,
    outfitId: args.outfitId,
    shopId: args.shopId,
    taskId: 'regenerate-outfit',
    stage: `${args.stage}_graphic_retry`,
  });
  if (retryVerdict === 'failed') {
    throw new GraphicFidelityGenerationError();
  }
  return retryB64;
}

async function generateImageContent(
  ai: GoogleGenAI,
  request: GenerateContentRequest,
  context: {
    outfitId: string;
    shopId: string;
    stage: string;
  },
) {
  try {
    return await ai.models.generateContent(request);
  } catch (error) {
    logImageProviderError(error, {
      taskId: 'regenerate-outfit',
      ...context,
    });
    throw createUserFacingImageProviderError(
      error,
      'Failed to generate outfit image. Please try again.',
    );
  }
}

/**
 * Cheap text-only validation: did Gemini actually produce the requested pose?
 * Uses a fast model to check the output image. Returns true if pose looks correct.
 */
async function validatePose(
  ai: GoogleGenAI,
  imageB64: string,
  expectedPose: 'three-quarter' | 'back',
  context: {
    outfitId: string;
    shopId: string;
  },
): Promise<boolean> {
  const question = expectedPose === 'three-quarter'
    ? "Look at this fashion photo. Is the model's torso visibly rotated at least 30 degrees away from the camera, showing a clear three-quarter angle (not facing the camera straight on)? Answer ONLY 'yes' or 'no'."
    : "Look at this fashion photo. Is the model facing away from the camera, showing their back? Answer ONLY 'yes' or 'no'.";
  try {
    const resp = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: imageB64, mimeType: 'image/png' } },
          { text: question },
        ],
      }],
      config: { temperature: 0 },
    });
    const text = resp.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase() ?? '';
    return text.includes('yes');
  } catch (error) {
    logImageProviderError(error, {
      taskId: 'regenerate-outfit',
      outfitId: context.outfitId,
      shopId: context.shopId,
      stage: `validate_${expectedPose}`,
    });
    // If validation call fails, don't block generation — assume pose is OK
    return true;
  }
}

function extractBase64(response: {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ inlineData?: { data?: string } }> };
  }>;
}): string {
  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  const reason = response.candidates?.[0]?.finishReason;
  if (reason === 'IMAGE_SAFETY' || reason === 'SAFETY') {
    throw new Error('Image filtered by safety system. Try a different garment image.');
  }
  throw new Error('No image returned from Gemini.');
}

function appendUserDirection(prompt: string, userDirection: string | undefined): string {
  if (!userDirection?.trim()) return prompt;
  return `${prompt}\n\nUser direction: ${userDirection.trim()}`;
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const regenerateOutfitTask = task({
  id: 'regenerate-outfit',
  maxDuration: 600,
  queue: { concurrencyLimit: 3 },
  retry: {
    maxAttempts: 4,
    factor: 2,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 180_000,
    randomize: true,
  },

  onFailure: async ({ payload, error }: { payload: RegenerateOutfitPayload; error: unknown }) => {
    const existing = await prisma.outfit.findFirst({
      where: { id: payload.outfitId, shopId: payload.shopId },
      select: { errorMessage: true },
    });
    if (existing?.errorMessage === 'Cancelled by user') return;
    const rawErrorMessage = error instanceof Error ? error.message : String(error ?? 'Regeneration failed.');
    logTaskLifecycle('task.failed_final', payload, { error: rawErrorMessage });
    const refunded = await maybeRefundFailedGeneration({
      taskId: 'regenerate-outfit',
      payload,
      error,
      refundReservedGeneration,
    });
    const errorMessage = getUserFacingGenerationError(
      error,
      'Regeneration failed. Please try again.',
      { refunded },
    );
    await prisma.outfit
      .update({ where: { id: payload.outfitId }, data: { status: 'failed', errorMessage } })
      .catch(() => {});
  },

  run: async (payload: RegenerateOutfitPayload) => {
    const {
      outfitId,
      shopId,
      userDirection,
      modelImageUrl,
      modelHeight,
      modelGender,
      styleId,
      pricePoint,
      brandEnergy,
      primaryCategory,
      allowedPoses,
    } = payload;
    logTaskLifecycle('task.started', payload);
    const poses = allowedPoses?.length ? allowedPoses : ['front'];

    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        cleanFlatLayUrl: true,
        cleanBackFlatLayUrl: true,
        garmentSpec: true,
        brandStyleId: true,
        videoStatus: true,
        videoJobId: true,
      },
    });
    if (!outfit?.cleanFlatLayUrl) {
      throw new Error('Outfit not found or missing clean flat lay. Cannot regenerate.');
    }
    const garmentSpec = outfit.garmentSpec as StoredGarmentSpec | null;
    if (!garmentSpec) throw new Error('Garment spec missing from outfit record.');
    const referenceContext = garmentSpec.referenceContext
      ? {
          primaryImageSide: garmentSpec.referenceContext.primaryImageSide,
          frontDescription: garmentSpec.referenceContext.frontDescription ?? undefined,
          backDescription: garmentSpec.referenceContext.backDescription ?? undefined,
        }
      : undefined;

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { status: 'pending', errorMessage: null },
    });

    const cleanFlatLayB64 = await fetchAsBase64(outfit.cleanFlatLayUrl);
    const cleanBackFlatLayB64 = outfit.cleanBackFlatLayUrl
      ? await fetchAsBase64(outfit.cleanBackFlatLayUrl).catch(() => null)
      : null;
    const hasBack = referenceContext?.primaryImageSide === 'back' || !!cleanBackFlatLayB64;
    const graphicFetchCache = new Map<string, Promise<string | undefined>>();
    const fetchGraphicReference = (url: string) => {
      if (!graphicFetchCache.has(url)) {
        graphicFetchCache.set(url, fetchAsBase64(url).catch(() => undefined));
      }
      return graphicFetchCache.get(url)!;
    };
    const getGraphicAssetsForPose = async (pose: 'front' | 'three-quarter' | 'back') => {
      const graphicPromptContext = getGraphicPromptContextForPose(garmentSpec, pose);
      const rawReferenceUrl = graphicPromptContext?.critical
        ? graphicPromptContext.rawReferenceUrl
        : undefined;
      const referenceCropUrl = graphicPromptContext?.critical
        ? graphicPromptContext.referenceCropUrl
        : undefined;
      const [rawGraphicReferenceB64, graphicReferenceCropB64] = await Promise.all([
        rawReferenceUrl ? fetchGraphicReference(rawReferenceUrl) : Promise.resolve(undefined),
        referenceCropUrl ? fetchGraphicReference(referenceCropUrl) : Promise.resolve(undefined),
      ]);
      const resolvedGraphicPromptContext = graphicPromptContext
        ? {
            ...graphicPromptContext,
            hasRawReference: Boolean(rawGraphicReferenceB64),
            hasReferenceCrop: Boolean(graphicReferenceCropB64),
          }
        : undefined;

      return {
        graphicPromptContext: resolvedGraphicPromptContext,
        rawGraphicReferenceB64,
        rawGraphicReferenceMime: rawReferenceUrl ? inferImageMimeFromUrl(rawReferenceUrl) : undefined,
        graphicReferenceCropB64,
      };
    };

    const modelBuffer = await fetchAsBuffer(modelImageUrl);
    const normalizedModelBuffer = await normalizeReferenceImageServer(modelBuffer);
    const normalizedModelB64 = normalizedModelBuffer.toString('base64');

    const stylingDir =
      BRAND_STYLE_PRESETS.find((p) => p.id === outfit.brandStyleId) ??
      BRAND_STYLE_PRESETS[0];
    // backdropSnippet is now driven by the brand style; stylePreset kept as fallback only
    const stylePreset = PDP_STYLE_PRESETS.find((p) => p.id === styleId) ?? PDP_STYLE_PRESETS[0];
    const backdropSnippet = stylingDir.backdropSnippet ?? stylePreset.promptSnippet;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const MODEL = GEMINI_IMAGE_MODEL;
    // Per-pose temperature: front is conservative (consistency), 3/4 and back
    // need more creative latitude to commit to the rotation.
    const baseGenConfig = {
      imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    };
    const frontGenConfig = { ...baseGenConfig, temperature: 0.2 };
    const threeQuarterGenConfig = { ...baseGenConfig, temperature: 0.35 };
    const backGenConfig = { ...baseGenConfig, temperature: 0.3 };
    const sharp = (await import('sharp')).default;

    const blobPrefix = `outfits/${shopId}/${outfitId}/regenerate`;

    // ── Front ─────────────────────────────────────────────────────────────────
    await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_front' } });
    const frontGraphicAssets = await getGraphicAssetsForPose('front');
    const frontPrompt = appendUserDirection(
      buildPromptFromSpec(
        garmentSpec,
        'front',
        backdropSnippet,
        hasBack,
        false,
        modelHeight,
        stylingDir,
        modelGender,
        pricePoint,
        brandEnergy,
        primaryCategory,
        referenceContext,
        frontGraphicAssets.graphicPromptContext,
      ),
      userDirection,
    );
    const frontParts = buildGenerationParts({
      garmentB64: cleanFlatLayB64,
      garmentMime: 'image/png',
      modelB64: normalizedModelB64,
      prompt: frontPrompt,
      rawGraphicReferenceB64: frontGraphicAssets.rawGraphicReferenceB64,
      rawGraphicReferenceMime: frontGraphicAssets.rawGraphicReferenceMime,
      graphicReferenceCropB64: frontGraphicAssets.graphicReferenceCropB64,
    });
    const frontResp = await generateImageContent(ai, {
      model: MODEL,
      contents: [{
        role: 'user',
        parts: frontParts,
      }],
      config: frontGenConfig,
    }, { outfitId, shopId, stage: 'front' });
    let frontB64 = extractBase64(frontResp);
    frontB64 = await retryIfGraphicFidelityFailed({
      ai,
      b64: frontB64,
      contents: [{ role: 'user' as const, parts: frontParts }],
      config: { ...frontGenConfig, temperature: 0.15 },
      graphicReferenceCropB64: frontGraphicAssets.graphicReferenceCropB64,
      description: frontGraphicAssets.graphicPromptContext?.description,
      outfitId,
      shopId,
      stage: 'front',
    });
    const frontPng = await sharp(Buffer.from(frontB64, 'base64'))
      .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
      .png({ progressive: true })
      .toBuffer();
    const crypto = await import('crypto');
    const hashFront = crypto.createHash('sha256').update(frontPng).digest('hex').slice(0, 8);
    const baseFront = `${blobPrefix}-front.${hashFront}`;
    const frontAssetManifest = await createPoseAssetManifest({
      pngBuffer: frontPng,
      pathnameStem: baseFront,
      width: 800,
      height: 1200,
    });
    const frontUrl = frontAssetManifest.original.url;

    // ── Three-quarter + back (parallel) ───────────────────────────────────────
    // Non-front poses receive the generated front only as a background/lighting
    // and outfit anchor; simplified pose text keeps stance from being overdriven.
    let tqUrl: string | null = null;
    let backUrl: string | null = null;
    let tqAssetManifest: PoseImageAssetManifest | null = null;
    let backAssetManifest: PoseImageAssetManifest | null = null;
    const needsTq = poses.includes('three-quarter');
    const needsBack = poses.includes('back');

    if (needsTq || needsBack) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_poses' } });
    }

    const generateThreeQuarter = async () => {
      if (!needsTq) return;
      const tqGraphicAssets = await getGraphicAssetsForPose('three-quarter');
      const tqPrompt = appendUserDirection(
        buildPromptFromSpec(
          garmentSpec,
          'three-quarter',
          backdropSnippet,
          hasBack,
          true,
          modelHeight,
          stylingDir,
          modelGender,
          pricePoint,
          brandEnergy,
          primaryCategory,
          referenceContext,
          tqGraphicAssets.graphicPromptContext,
        ),
        userDirection,
      );
      const tqContents = [{
        role: 'user' as const,
        parts: buildGenerationParts({
          instruction: 'THREE-QUARTER VIEW: camera positioned 45° to the model\'s right. Do NOT generate a front-facing pose.',
          garmentB64: cleanFlatLayB64,
          garmentMime: 'image/png',
          modelB64: normalizedModelB64,
          frontAnchorB64: frontB64,
          prompt: tqPrompt,
          rawGraphicReferenceB64: tqGraphicAssets.rawGraphicReferenceB64,
          rawGraphicReferenceMime: tqGraphicAssets.rawGraphicReferenceMime,
          graphicReferenceCropB64: tqGraphicAssets.graphicReferenceCropB64,
        }),
      }];
      const tqResp = await generateImageContent(ai, {
        model: MODEL,
        contents: tqContents,
        config: threeQuarterGenConfig,
      }, { outfitId, shopId, stage: 'three-quarter' });
      let tqB64 = extractBase64(tqResp);
      const tqValid = await validatePose(ai, tqB64, 'three-quarter', { outfitId, shopId });
      if (!tqValid) {
        const retryResp = await generateImageContent(ai, {
          model: MODEL,
          contents: tqContents,
          config: { ...threeQuarterGenConfig, temperature: 0.45 },
        }, { outfitId, shopId, stage: 'three-quarter_retry' });
        tqB64 = extractBase64(retryResp);
      }
      tqB64 = await retryIfGraphicFidelityFailed({
        ai,
        b64: tqB64,
        contents: tqContents,
        config: { ...threeQuarterGenConfig, temperature: 0.25 },
        graphicReferenceCropB64: tqGraphicAssets.graphicReferenceCropB64,
        description: tqGraphicAssets.graphicPromptContext?.description,
        outfitId,
        shopId,
        stage: 'three-quarter',
      });
      const tqPng = await sharp(Buffer.from(tqB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png({ progressive: true })
        .toBuffer();
      const cryptoTq = await import('crypto');
      const hashTq = cryptoTq.createHash('sha256').update(tqPng).digest('hex').slice(0, 8);
      const baseTq = `${blobPrefix}-three-quarter.${hashTq}`;
      tqAssetManifest = await createPoseAssetManifest({
        pngBuffer: tqPng,
        pathnameStem: baseTq,
        width: 800,
        height: 1200,
      });
      tqUrl = tqAssetManifest.original.url;
    };

    const generateBack = async () => {
      if (!needsBack) return;
      const backGraphicAssets = await getGraphicAssetsForPose('back');
      const backPrompt = appendUserDirection(
        buildPromptFromSpec(
          garmentSpec,
          'back',
          backdropSnippet,
          hasBack,
          true,
          modelHeight,
          stylingDir,
          modelGender,
          pricePoint,
          brandEnergy,
          primaryCategory,
          referenceContext,
          backGraphicAssets.graphicPromptContext,
        ),
        userDirection,
      );
      const backContents = [{
        role: 'user' as const,
        parts: buildGenerationParts({
          instruction: 'BACK VIEW: camera directly behind the model. Do NOT generate a front-facing pose.',
          garmentB64: cleanBackFlatLayB64 ?? cleanFlatLayB64,
          garmentMime: 'image/png',
          modelB64: normalizedModelB64,
          frontAnchorB64: frontB64,
          prompt: backPrompt,
          rawGraphicReferenceB64: backGraphicAssets.rawGraphicReferenceB64,
          rawGraphicReferenceMime: backGraphicAssets.rawGraphicReferenceMime,
          graphicReferenceCropB64: backGraphicAssets.graphicReferenceCropB64,
        }),
      }];
      const backResp = await generateImageContent(ai, {
        model: MODEL,
        contents: backContents,
        config: backGenConfig,
      }, { outfitId, shopId, stage: 'back' });
      let backB64 = extractBase64(backResp);
      const backValid = await validatePose(ai, backB64, 'back', { outfitId, shopId });
      if (!backValid) {
        const retryResp = await generateImageContent(ai, {
          model: MODEL,
          contents: backContents,
          config: { ...backGenConfig, temperature: 0.4 },
        }, { outfitId, shopId, stage: 'back_retry' });
        backB64 = extractBase64(retryResp);
      }
      backB64 = await retryIfGraphicFidelityFailed({
        ai,
        b64: backB64,
        contents: backContents,
        config: { ...backGenConfig, temperature: 0.25 },
        graphicReferenceCropB64: backGraphicAssets.graphicReferenceCropB64,
        description: backGraphicAssets.graphicPromptContext?.description,
        outfitId,
        shopId,
        stage: 'back',
      });
      const backPng = await sharp(Buffer.from(backB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png({ progressive: true })
        .toBuffer();
      const cryptoBack = await import('crypto');
      const hashBack = cryptoBack.createHash('sha256').update(backPng).digest('hex').slice(0, 8);
      const baseBack = `${blobPrefix}-back.${hashBack}`;
      backAssetManifest = await createPoseAssetManifest({
        pngBuffer: backPng,
        pathnameStem: baseBack,
        width: 800,
        height: 1200,
      });
      backUrl = backAssetManifest.original.url;
    };

    await Promise.all([generateThreeQuarter(), generateBack()]);

    // ── Replace in place: update/create target poses, then clean up stale ones ─
    const newImages: Array<{
      shopId: string;
      outfitId: string;
      imageUrl: string;
      assetManifest?: PoseImageAssetManifest | null;
      pose: string;
      styleId: string;
    }> = [
      {
        shopId,
        outfitId,
        imageUrl: frontUrl,
        assetManifest: frontAssetManifest,
        pose: 'front',
        styleId,
      },
    ];
    if (tqUrl) {
      newImages.push({
        shopId,
        outfitId,
        imageUrl: tqUrl,
        assetManifest: tqAssetManifest,
        pose: 'three-quarter',
        styleId,
      });
    }
    if (backUrl) {
      newImages.push({
        shopId,
        outfitId,
        imageUrl: backUrl,
        assetManifest: backAssetManifest,
        pose: 'back',
        styleId,
      });
    }

    // Cancel any in-flight video run before replacing images.
    // The DB invalidation itself happens inside the transaction below so we
    // don't lose the existing video if regeneration fails before commit.
    if (
      outfit.videoJobId &&
      (outfit.videoStatus === 'pending' || outfit.videoStatus === 'processing')
    ) {
      await cancelRunSafely(outfit.videoJobId);
    }

    await prisma.$transaction(async (tx) => {
      await clearOutfitVideoStateInTransaction(tx, outfitId);

      for (const image of newImages) {
        await upsertGeneratedImageByPose(tx.generatedImage, image, 'regenerate-outfit');
      }

      await deleteGeneratedImagesNotInPoses(
        tx.generatedImage,
        outfitId,
        newImages.map((image) => image.pose),
      );

      await tx.outfit.update({
        where: { id: outfitId, shopId },
        // shopifyProductId is intentionally preserved so re-publish updates the
        // existing Shopify product instead of creating a duplicate.
        data: { status: 'completed', errorMessage: null, shopifySyncStatus: 'stale' },
      });
    });

    logTaskLifecycle('task.completed', payload, {
      completedPoses: newImages.map((image) => image.pose),
    });
    return { outfitId, status: 'completed' };
  },
});
