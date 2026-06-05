import { task } from '@trigger.dev/sdk';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { uploadImageToBlob } from '../app/blob.server';
import {
  cleanFlatLay,
  cleanFlatLayForDemo,
  createUserFacingImageProviderError,
  hasCleanWhiteFlatLayBackground,
  logImageProviderError,
  normalizeFlatLayToPng,
} from '../app/lib/flatLayCleanup';
import { extractGarmentSpec } from '../app/lib/garmentSpec';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import {
  extractGraphicReferenceCrop,
  getGraphicPromptContextForPose,
  isGraphicCriticalSpec,
  mergeGraphicFidelityIntoSpec,
  validateGeneratedGraphicFidelity,
} from '../app/lib/graphicFidelity';
import { buildTryDemoPrompt } from '../app/lib/tryDemoPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, BRAND_STYLE_PRESETS } from '../app/lib/pdpPresets';
import { DEMO_SHOP_ID, refundReservedGeneration } from '../app/lib/billing.server';
import { createGeneratedImageOrReuse } from '../app/lib/generatedImagePersistence.server';
import { createPoseAssetManifest } from '../app/lib/imageAssetManifest.server';
import { logServerEvent } from '../app/lib/observability.server';
import { GEMINI_IMAGE_MODEL, GEMINI_TEXT_MODEL } from '../app/lib/geminiModels';
import {
  GraphicFidelityGenerationError,
  getUserFacingGenerationError,
  maybeRefundFailedGeneration,
} from '../app/lib/generationErrors.server';

// ── Payload ───────────────────────────────────────────────────────────────────

interface GenerateOutfitPayload {
  outfitId: string;
  shopId: string;
  /** Raw (uncleaned) flat lay image URLs — job runs cleanFlatLay + extractGarmentSpec */
  rawFrontUrl: string;
  rawBackUrl?: string;
  frontMime?: string;
  backMime?: string;
  /** Whether rawFrontUrl is actually a front or back-facing product photo. */
  primaryImageSide?: 'front' | 'back';
  /** Whether rawBackUrl is the opposite-side front or back photo. */
  secondaryImageSide?: 'front' | 'back';
  /** Merchant-provided details for the missing front when only a back photo was uploaded. */
  frontDescription?: string;
  /** Merchant-provided details for the missing back when no back photo was uploaded. */
  backDescription?: string;
  modelImageUrl: string;
  modelHeight?: string;
  /** Model gender (e.g. Male, Female) — used to pick male/neutral pose snippets when present. */
  modelGender?: string;
  styleId: string;
  brandStyleId: string;
  /** Optional merchant shoot direction, e.g. styling, shoes, background, or mood. */
  generationDirection?: string;
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
  payload: GenerateOutfitPayload,
  extras: Record<string, unknown> = {},
) {
  logServerEvent(event === 'task.failed_final' ? 'error' : 'info', event, {
    taskId: 'generate-outfit',
    outfitId: payload.outfitId,
    shopId: payload.shopId,
    allowedPoses: payload.allowedPoses,
    ...extras,
  });
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const generateOutfitTask = task({
  id: 'generate-outfit',
  /** Generous ceiling: 3 Gemini image calls + sharp crops + blob uploads ≈ 60–120s each */
  maxDuration: 600,
  /** Cap at 3 concurrent jobs to stay within Gemini rate limits */
  queue: { concurrencyLimit: 3 },
  retry: {
    maxAttempts: 4,
    factor: 2,
    minTimeoutInMs: 30_000,
    maxTimeoutInMs: 180_000,
    randomize: true,
  },

  /** Called only after all retry attempts are exhausted — mark outfit failed */
  onFailure: async ({ payload, error }: { payload: GenerateOutfitPayload; error: unknown }) => {
    const existing = await prisma.outfit.findFirst({
      where: { id: payload.outfitId, shopId: payload.shopId },
      select: { errorMessage: true },
    });
    if (existing?.errorMessage === 'Cancelled by user') return;
    const rawErrorMessage = error instanceof Error ? error.message : String(error ?? 'Generation failed.');
    logTaskLifecycle('task.failed_final', payload, { error: rawErrorMessage });
    const refunded = await maybeRefundFailedGeneration({
      taskId: 'generate-outfit',
      payload,
      error,
      refundReservedGeneration,
    });
    const errorMessage = getUserFacingGenerationError(
      error,
      'Generation failed. Please try again.',
      { refunded },
    );
    await prisma.outfit
      .update({ where: { id: payload.outfitId }, data: { status: 'failed', errorMessage } })
      .catch(() => {});
  },

  run: async (payload: GenerateOutfitPayload) => {
    const {
      outfitId,
      shopId,
      rawFrontUrl,
      rawBackUrl,
      frontMime = 'image/png',
      backMime = 'image/png',
      primaryImageSide = 'front',
      secondaryImageSide,
      frontDescription,
      backDescription,
      modelImageUrl,
      modelHeight,
      modelGender,
      styleId,
      brandStyleId,
      generationDirection,
      pricePoint,
      brandEnergy,
      primaryCategory,
      allowedPoses,
    } = payload;
    logTaskLifecycle('task.started', payload, {
      isDemo: payload.shopId === DEMO_SHOP_ID,
    });
    const poses = allowedPoses?.length ? allowedPoses : ['front'];
    const apiKey = process.env.GEMINI_API_KEY!;
    const isDemo = shopId === DEMO_SHOP_ID;

    // ── Validate ──────────────────────────────────────────────────────────────
    const existing = await prisma.outfit.findFirst({ where: { id: outfitId, shopId }, select: { id: true } });
    if (!existing) {
      throw new Error(
        `Outfit ${outfitId} not found for shop ${shopId}. Ensure Trigger.dev DATABASE_URL matches the app (same Neon DB).`,
      );
    }
    await prisma.outfit.update({ where: { id: outfitId, shopId }, data: { status: 'pending' } });

    // ── 0. Fetch raw images ───────────────────────────────────────────────────
    const rawPrimaryB64 = await fetchAsBase64(rawFrontUrl);
    const rawSecondaryB64 = rawBackUrl ? await fetchAsBase64(rawBackUrl).catch(() => null) : null;
    const resolvedSecondaryImageSide = rawSecondaryB64
      ? secondaryImageSide ?? (primaryImageSide === 'front' ? 'back' : 'front')
      : undefined;
    const rawFrontB64 = primaryImageSide === 'front'
      ? rawPrimaryB64
      : resolvedSecondaryImageSide === 'front'
      ? rawSecondaryB64
      : null;
    const rawFrontMime = primaryImageSide === 'front'
      ? frontMime
      : resolvedSecondaryImageSide === 'front'
      ? backMime
      : undefined;
    const rawFrontUrlForReference = primaryImageSide === 'front'
      ? rawFrontUrl
      : resolvedSecondaryImageSide === 'front'
      ? rawBackUrl
      : undefined;
    const rawBackB64 = primaryImageSide === 'back'
      ? rawPrimaryB64
      : resolvedSecondaryImageSide === 'back'
      ? rawSecondaryB64
      : null;
    const rawBackMime = primaryImageSide === 'back'
      ? frontMime
      : resolvedSecondaryImageSide === 'back'
      ? backMime
      : undefined;
    const rawFrontSpec = await extractGarmentSpec(
      rawFrontB64 ?? rawPrimaryB64,
      rawFrontMime ?? frontMime,
      apiKey,
      rawFrontB64 ? 'front' : primaryImageSide,
      frontDescription,
    );
    const rawGraphicCritical = isGraphicCriticalSpec(rawFrontSpec);
    let graphicReferenceCropB64: string | undefined;
    let graphicReferenceCropUrl: string | undefined;

    if (rawGraphicCritical) {
      const cropBuffer = await extractGraphicReferenceCrop(rawFrontB64 ?? rawPrimaryB64);
      graphicReferenceCropB64 = cropBuffer.toString('base64');
      graphicReferenceCropUrl = await uploadImageToBlob(
        cropBuffer,
        `outfits/${shopId}/${outfitId}/graphic-reference-front.png`,
        'image/png',
        undefined,
        'inline',
        true,
      );
    }

    // ── 1. Clean flat lay — skipped for demo to save ~20s ────────────────────
    let cleanFlatLayB64: string;
    let cleanFlatLayUrl: string;
    let cleanBackFlatLayB64: string | null = null;
    let cleanBackFlatLayUrl: string | null = null;
    const cleanMime = 'image/png';

    if (isDemo) {
      // Run aggressive cleanup for quality unless the merchant already supplied a clean white flat lay.
      cleanFlatLayB64 = await prepareCleanFlatLay({
        rawImageBase64: rawFrontB64 ?? rawPrimaryB64,
        mimeType: rawFrontMime ?? frontMime,
        apiKey,
        isDemo,
        shopId,
        outfitId,
        side: rawFrontB64 ? 'front' : primaryImageSide,
      });
      cleanBackFlatLayB64 = rawBackB64;
      cleanFlatLayUrl = rawFrontUrlForReference ?? rawFrontUrl;
    } else {
      cleanFlatLayB64 = await prepareCleanFlatLay({
        rawImageBase64: rawFrontB64 ?? rawPrimaryB64,
        mimeType: rawFrontMime ?? frontMime,
        apiKey,
        isDemo,
        shopId,
        outfitId,
        side: rawFrontB64 ? 'front' : primaryImageSide,
      });
      const [uploadedUrl, cleanedBack] = await Promise.all([
        uploadImageToBlob(
          Buffer.from(cleanFlatLayB64, 'base64'),
          `outfits/${shopId}/${outfitId}/flat-lay.png`,
          'image/png',
          undefined,
          'inline',
          true,
        ),
        rawBackB64
          ? prepareCleanFlatLay({
              rawImageBase64: rawBackB64,
              mimeType: rawBackMime ?? backMime,
              apiKey,
              isDemo,
              shopId,
              outfitId,
              side: 'back',
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      cleanFlatLayUrl = uploadedUrl;
      cleanBackFlatLayB64 = cleanedBack;
      if (cleanBackFlatLayB64) {
        cleanBackFlatLayUrl = await uploadImageToBlob(
          Buffer.from(cleanBackFlatLayB64, 'base64'),
          `outfits/${shopId}/${outfitId}/flat-lay-back.png`,
          'image/png',
          undefined,
          'inline',
          true,
        );
      }
    }

    // ── 2. Spec extraction + model normalisation in parallel ──────────────────
    const productReferencePrimarySide = rawFrontB64 ? 'front' : primaryImageSide;
    const [cleanedGarmentSpec, normalizedModelB64] = await Promise.all([
      extractGarmentSpec(
        cleanFlatLayB64,
        cleanMime,
        apiKey,
        productReferencePrimarySide,
        frontDescription,
      ),
      fetchAsBuffer(modelImageUrl)
        .then(buf => normalizeReferenceImageServer(buf))
        .then(buf => buf.toString('base64')),
    ]);
    const garmentSpec = mergeGraphicFidelityIntoSpec(
      cleanedGarmentSpec,
      rawFrontSpec,
      graphicReferenceCropUrl,
      rawFrontUrlForReference ?? rawFrontUrl,
      productReferencePrimarySide,
    );
    const rawGraphicReferenceMime: 'image/png' | 'image/jpeg' =
      (rawFrontMime ?? frontMime) === 'image/jpeg' ? 'image/jpeg' : 'image/png';

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: {
        frontFlatLayUrl: cleanFlatLayUrl,
        cleanFlatLayUrl,
        cleanBackFlatLayUrl,
        garmentSpec: JSON.parse(JSON.stringify({
          ...garmentSpec,
          referenceContext: {
            primaryImageSide: productReferencePrimarySide,
            frontDescription: frontDescription ?? null,
            backDescription: backDescription ?? null,
            generationDirection: generationDirection ?? null,
          },
        })),
      },
    });

    // ── 3. Idempotency: skip poses already done on a previous attempt ─────────
    const existingImages = await prisma.generatedImage.findMany({
      where: { outfitId },
      select: { pose: true, imageUrl: true },
    });
    const completedPoses = new Set(existingImages.map((img) => img.pose));

    // ── 4. Style presets ──────────────────────────────────────────────────────
    const stylingDir = BRAND_STYLE_PRESETS.find(p => p.id === brandStyleId) ?? BRAND_STYLE_PRESETS[0];
    // backdropSnippet is now driven by the brand style; stylePreset kept as fallback only
    const stylePreset = PDP_STYLE_PRESETS.find(p => p.id === styleId) ?? PDP_STYLE_PRESETS[0];
    const backdropSnippet = stylingDir.backdropSnippet ?? stylePreset.promptSnippet;

    // ── 5. Init Gemini ────────────────────────────────────────────────────────
    // Each pose is an independent generateContent call — no shared chat session.
    // Non-front poses receive the generated front only as a background/lighting
    // and outfit anchor; simplified pose text keeps stance from being overdriven.
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

    const hasBack = primaryImageSide === 'back' || !!cleanBackFlatLayB64;
    const promptContext = {
      primaryImageSide: productReferencePrimarySide,
      frontDescription,
      backDescription,
      generationDirection,
    };
    const getGraphicAssetsForPose = (pose: 'front' | 'three-quarter' | 'back') => {
      const graphicPromptContext = getGraphicPromptContextForPose(garmentSpec, pose);
      const hasMatchingVisualReference =
        graphicPromptContext?.critical &&
        graphicPromptContext.sourceSide === productReferencePrimarySide;
      return {
        graphicPromptContext,
        rawGraphicReferenceB64:
          hasMatchingVisualReference && graphicPromptContext.rawReferenceUrl
            ? rawFrontB64 ?? rawPrimaryB64
            : undefined,
        rawGraphicReferenceMime:
          hasMatchingVisualReference && graphicPromptContext.rawReferenceUrl
            ? rawGraphicReferenceMime
            : undefined,
        graphicReferenceCropB64:
          hasMatchingVisualReference && graphicPromptContext.referenceCropUrl
            ? graphicReferenceCropB64
            : undefined,
      };
    };

    // ── 6. Front pose ─────────────────────────────────────────────────────────
    let frontB64: string;
    if (completedPoses.has('front')) {
      const frontRecord = existingImages.find((img) => img.pose === 'front')!;
      frontB64 = await fetchAsBase64(frontRecord.imageUrl);
    } else {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_front' } });
      const frontGraphicAssets = getGraphicAssetsForPose('front');
      const frontPrompt = isDemo
        ? buildTryDemoPrompt(garmentSpec, modelGender, modelHeight, frontGraphicAssets.graphicPromptContext)
        : buildPromptFromSpec(
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
            promptContext,
            frontGraphicAssets.graphicPromptContext,
          );
      const frontParts = buildGenerationParts({
        garmentB64: cleanFlatLayB64,
        garmentMime: cleanMime,
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
      frontB64 = extractBase64(frontResp);
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
      const frontCropped = await sharp(Buffer.from(frontB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
        .png({ progressive: true })
        .toBuffer();
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha256').update(frontCropped).digest('hex').slice(0, 8);
      const baseNameFront = `outfits/${shopId}/${outfitId}/front.${hash}`;
      const frontAssetManifest = await createPoseAssetManifest({
        pngBuffer: frontCropped,
        pathnameStem: baseNameFront,
        width: 800,
        height: 1200,
      });
      const frontUrl = frontAssetManifest.original.url;
      await createGeneratedImageOrReuse(
        prisma.generatedImage,
        {
          shopId,
          outfitId,
          imageUrl: frontUrl,
          assetManifest: frontAssetManifest,
          pose: 'front',
          styleId,
        },
        'generate-outfit',
      );
    }

    // ── 7. Three-quarter + back poses (parallel) ─────────────────────────────
    // The generated front is included again for backdrop/lighting consistency,
    // while the prompt tells Gemini not to copy its pose.
    const needsTq = poses.includes('three-quarter') && !completedPoses.has('three-quarter');
    const needsBack = poses.includes('back') && !completedPoses.has('back');

    if (needsTq || needsBack) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_poses' } });
    }

    const generateThreeQuarter = async () => {
      if (!needsTq) return;
      const tqGraphicAssets = getGraphicAssetsForPose('three-quarter');
      const tqPrompt = buildPromptFromSpec(
        garmentSpec, 'three-quarter', backdropSnippet, hasBack, true, modelHeight, stylingDir, modelGender, pricePoint, brandEnergy, primaryCategory, promptContext, tqGraphicAssets.graphicPromptContext,
      );
      const tqContents = [{
        role: 'user' as const,
        parts: buildGenerationParts({
          instruction: 'THREE-QUARTER VIEW: camera positioned 45° to the model\'s right. Do NOT generate a front-facing pose.',
          garmentB64: cleanFlatLayB64,
          garmentMime: cleanMime,
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
      // Validate pose — retry once with slightly higher temperature if 3/4 collapsed to front
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
      const tqCropped = await sharp(Buffer.from(tqB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png({ progressive: true })
        .toBuffer();
      const cryptoTq = await import('crypto');
      const hashTq = cryptoTq.createHash('sha256').update(tqCropped).digest('hex').slice(0, 8);
      const baseNameTq = `outfits/${shopId}/${outfitId}/three-quarter.${hashTq}`;
      const tqAssetManifest = await createPoseAssetManifest({
        pngBuffer: tqCropped,
        pathnameStem: baseNameTq,
        width: 800,
        height: 1200,
      });
      const tqUrl = tqAssetManifest.original.url;
      await createGeneratedImageOrReuse(
        prisma.generatedImage,
        {
          shopId,
          outfitId,
          imageUrl: tqUrl,
          assetManifest: tqAssetManifest,
          pose: 'three-quarter',
          styleId,
        },
        'generate-outfit',
      );
    };

    const generateBack = async () => {
      if (!needsBack) return;
      const backGraphicAssets = getGraphicAssetsForPose('back');
      const backPrompt = buildPromptFromSpec(
        garmentSpec, 'back', backdropSnippet, hasBack, true, modelHeight, stylingDir, modelGender, pricePoint, brandEnergy, primaryCategory, promptContext, backGraphicAssets.graphicPromptContext,
      );
      const backContents = [{
        role: 'user' as const,
        parts: buildGenerationParts({
          instruction: 'BACK VIEW: camera directly behind the model. Do NOT generate a front-facing pose.',
          garmentB64: cleanBackFlatLayB64 ?? cleanFlatLayB64,
          garmentMime: cleanMime,
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
      // Validate pose — retry once with slightly higher temperature if back collapsed
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
      const backCropped = await sharp(Buffer.from(backB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png({ progressive: true })
        .toBuffer();
      const cryptoBack = await import('crypto');
      const hashBack = cryptoBack.createHash('sha256').update(backCropped).digest('hex').slice(0, 8);
      const baseNameBack = `outfits/${shopId}/${outfitId}/back.${hashBack}`;
      const backAssetManifest = await createPoseAssetManifest({
        pngBuffer: backCropped,
        pathnameStem: baseNameBack,
        width: 800,
        height: 1200,
      });
      const backUrl = backAssetManifest.original.url;
      await createGeneratedImageOrReuse(
        prisma.generatedImage,
        {
          shopId,
          outfitId,
          imageUrl: backUrl,
          assetManifest: backAssetManifest,
          pose: 'back',
          styleId,
        },
        'generate-outfit',
      );
    };

    await Promise.all([generateThreeQuarter(), generateBack()]);

    // ── 9. Complete ───────────────────────────────────────────────────────────
    await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'completed' } });

    logTaskLifecycle('task.completed', payload, {
      completedPoses: poses,
      hasBackInput: hasBack,
      demo: isDemo,
    });
    return { outfitId, status: 'completed' };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function prepareCleanFlatLay(args: {
  rawImageBase64: string;
  mimeType: string;
  apiKey: string;
  isDemo: boolean;
  shopId: string;
  outfitId: string;
  side: 'front' | 'back';
}): Promise<string> {
  const canUseOriginal = await hasCleanWhiteFlatLayBackground(args.rawImageBase64);
  if (canUseOriginal) {
    logServerEvent('info', 'flat_lay_cleanup.skipped_clean_white_input', {
      outfitId: args.outfitId,
      shopId: args.shopId,
      side: args.side,
      demo: args.isDemo,
    });
    return normalizeFlatLayToPng(args.rawImageBase64);
  }

  try {
    return args.isDemo
      ? await cleanFlatLayForDemo(args.rawImageBase64, args.mimeType, args.apiKey)
      : await cleanFlatLay(args.rawImageBase64, args.mimeType, args.apiKey);
  } catch (error) {
    const fallbackCanUseOriginal = await hasCleanWhiteFlatLayBackground(args.rawImageBase64);
    if (fallbackCanUseOriginal) {
      logServerEvent('warn', 'flat_lay_cleanup.fallback_to_clean_white_input', {
        error: error instanceof Error ? error.message : String(error),
        outfitId: args.outfitId,
        shopId: args.shopId,
        side: args.side,
        demo: args.isDemo,
      });
      return normalizeFlatLayToPng(args.rawImageBase64);
    }
    throw error;
  }
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
    taskId: 'generate-outfit',
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
    taskId: 'generate-outfit',
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
      taskId: 'generate-outfit',
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
      taskId: 'generate-outfit',
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
