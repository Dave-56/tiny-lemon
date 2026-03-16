import { task } from '@trigger.dev/sdk/v3';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { uploadImageToBlob, uploadImageVariant } from '../app/blob.server';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, BRAND_STYLE_PRESETS } from '../app/lib/pdpPresets';
import type { GarmentSpec } from '../app/lib/garmentSpec';

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

/**
 * Cheap text-only validation: did Gemini actually produce the requested pose?
 * Uses a fast model to check the output image. Returns true if pose looks correct.
 */
async function validatePose(
  ai: GoogleGenAI,
  imageB64: string,
  expectedPose: 'three-quarter' | 'back',
): Promise<boolean> {
  const question = expectedPose === 'three-quarter'
    ? "Look at this fashion photo. Is the model's torso visibly rotated at least 30 degrees away from the camera, showing a clear three-quarter angle (not facing the camera straight on)? Answer ONLY 'yes' or 'no'."
    : "Look at this fashion photo. Is the model facing away from the camera, showing their back? Answer ONLY 'yes' or 'no'.";
  try {
    const resp = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
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
  } catch {
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
  retry: { maxAttempts: 2 },

  onFailure: async ({ payload, error }: { payload: RegenerateOutfitPayload; error: unknown }) => {
    const existing = await prisma.outfit.findFirst({
      where: { id: payload.outfitId, shopId: payload.shopId },
      select: { errorMessage: true },
    });
    if (existing?.errorMessage === 'Cancelled by user') return;
    const errorMessage = error instanceof Error ? error.message : 'Regeneration failed.';
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
    const poses = allowedPoses?.length ? allowedPoses : ['front'];

    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        cleanFlatLayUrl: true,
        cleanBackFlatLayUrl: true,
        garmentSpec: true,
        brandStyleId: true,
      },
    });
    if (!outfit?.cleanFlatLayUrl) {
      throw new Error('Outfit not found or missing clean flat lay. Cannot regenerate.');
    }
    const garmentSpec = outfit.garmentSpec as GarmentSpec | null;
    if (!garmentSpec) throw new Error('Garment spec missing from outfit record.');

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { status: 'pending', errorMessage: null },
    });

    const cleanFlatLayB64 = await fetchAsBase64(outfit.cleanFlatLayUrl);
    const cleanBackFlatLayB64 = outfit.cleanBackFlatLayUrl
      ? await fetchAsBase64(outfit.cleanBackFlatLayUrl).catch(() => null)
      : null;
    const hasBack = !!cleanBackFlatLayB64;

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
    const MODEL = 'gemini-3.1-flash-image-preview';
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
      ),
      userDirection,
    );
    const frontResp = await ai.models.generateContent({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: cleanFlatLayB64, mimeType: 'image/png' as const } },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { text: frontPrompt },
        ],
      }],
      config: frontGenConfig,
    });
    const frontB64 = extractBase64(frontResp);
    const frontPng = await sharp(Buffer.from(frontB64, 'base64'))
      .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
      .png({ progressive: true })
      .toBuffer();
    const crypto = await import('crypto');
    const hashFront = crypto.createHash('sha256').update(frontPng).digest('hex').slice(0, 8);
    const baseFront = `${blobPrefix}-front.${hashFront}`;
    const frontUrl = await uploadImageToBlob(frontPng, `${baseFront}.png`, 'image/png', 86400, 'inline');
    for (const w of [320, 640, 800]) {
      const avif = await sharp(frontPng).resize({ width: w }).avif({ quality: 50, effort: 4 }).toBuffer();
      await uploadImageVariant(avif, `${baseFront}-${w}w.avif`, 'image/avif', 31536000);
      const webp = await sharp(frontPng).resize({ width: w }).webp({ quality: 60 }).toBuffer();
      await uploadImageVariant(webp, `${baseFront}-${w}w.webp`, 'image/webp', 31536000);
    }

    // ── Three-quarter + back (parallel) ───────────────────────────────────────
    // Both depend on frontB64 but NOT on each other — run in parallel to save ~25-35s.
    let tqUrl: string | null = null;
    let backUrl: string | null = null;
    const needsTq = poses.includes('three-quarter');
    const needsBack = poses.includes('back');

    if (needsTq || needsBack) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_poses' } });
    }

    const generateThreeQuarter = async () => {
      if (!needsTq) return;
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
        ),
        userDirection,
      );
      const tqContents = [{
        role: 'user' as const,
        parts: [
          { text: 'THREE-QUARTER VIEW: camera positioned 45° to the model\'s right. Do NOT generate a front-facing pose.' },
          { inlineData: { data: cleanFlatLayB64, mimeType: 'image/png' as const } },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { inlineData: { data: frontB64, mimeType: 'image/png' as const } },
          { text: tqPrompt },
        ],
      }];
      const tqResp = await ai.models.generateContent({
        model: MODEL,
        contents: tqContents,
        config: threeQuarterGenConfig,
      });
      let tqB64 = extractBase64(tqResp);
      const tqValid = await validatePose(ai, tqB64, 'three-quarter');
      if (!tqValid) {
        const retryResp = await ai.models.generateContent({
          model: MODEL,
          contents: tqContents,
          config: { ...threeQuarterGenConfig, temperature: 0.45 },
        });
        tqB64 = extractBase64(retryResp);
      }
      const tqPng = await sharp(Buffer.from(tqB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png({ progressive: true })
        .toBuffer();
      const cryptoTq = await import('crypto');
      const hashTq = cryptoTq.createHash('sha256').update(tqPng).digest('hex').slice(0, 8);
      const baseTq = `${blobPrefix}-three-quarter.${hashTq}`;
      tqUrl = await uploadImageToBlob(tqPng, `${baseTq}.png`, 'image/png', 86400, 'inline');
      for (const w of [320, 640, 800]) {
        const avif = await sharp(tqPng).resize({ width: w }).avif({ quality: 50, effort: 4 }).toBuffer();
        await uploadImageVariant(avif, `${baseTq}-${w}w.avif`, 'image/avif', 31536000);
        const webp = await sharp(tqPng).resize({ width: w }).webp({ quality: 60 }).toBuffer();
        await uploadImageVariant(webp, `${baseTq}-${w}w.webp`, 'image/webp', 31536000);
      }
    };

    const generateBack = async () => {
      if (!needsBack) return;
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
        ),
        userDirection,
      );
      const backContents = [{
        role: 'user' as const,
        parts: [
          { text: 'BACK VIEW: camera directly behind the model. Do NOT generate a front-facing pose.' },
          { inlineData: { data: cleanBackFlatLayB64 ?? cleanFlatLayB64, mimeType: 'image/png' as const } },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { inlineData: { data: frontB64, mimeType: 'image/png' as const } },
          { text: backPrompt },
        ],
      }];
      const backResp = await ai.models.generateContent({
        model: MODEL,
        contents: backContents,
        config: backGenConfig,
      });
      let backB64 = extractBase64(backResp);
      const backValid = await validatePose(ai, backB64, 'back');
      if (!backValid) {
        const retryResp = await ai.models.generateContent({
          model: MODEL,
          contents: backContents,
          config: { ...backGenConfig, temperature: 0.4 },
        });
        backB64 = extractBase64(retryResp);
      }
      const backPng = await sharp(Buffer.from(backB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png({ progressive: true })
        .toBuffer();
      const cryptoBack = await import('crypto');
      const hashBack = cryptoBack.createHash('sha256').update(backPng).digest('hex').slice(0, 8);
      const baseBack = `${blobPrefix}-back.${hashBack}`;
      backUrl = await uploadImageToBlob(backPng, `${baseBack}.png`, 'image/png', 86400, 'inline');
      for (const w of [320, 640, 800]) {
        const avif = await sharp(backPng).resize({ width: w }).avif({ quality: 50, effort: 4 }).toBuffer();
        await uploadImageVariant(avif, `${baseBack}-${w}w.avif`, 'image/avif', 31536000);
        const webp = await sharp(backPng).resize({ width: w }).webp({ quality: 60 }).toBuffer();
        await uploadImageVariant(webp, `${baseBack}-${w}w.webp`, 'image/webp', 31536000);
      }
    };

    await Promise.all([generateThreeQuarter(), generateBack()]);

    // ── Replace in place: delete old images, create new, mark completed ────────
    const newImages: Array<{ shopId: string; outfitId: string; imageUrl: string; pose: string; styleId: string }> = [
      { shopId, outfitId, imageUrl: frontUrl, pose: 'front', styleId },
    ];
    if (tqUrl) newImages.push({ shopId, outfitId, imageUrl: tqUrl, pose: 'three-quarter', styleId });
    if (backUrl) newImages.push({ shopId, outfitId, imageUrl: backUrl, pose: 'back', styleId });

    await prisma.$transaction([
      prisma.generatedImage.deleteMany({ where: { outfitId } }),
      prisma.generatedImage.createMany({ data: newImages }),
      prisma.outfit.update({
        where: { id: outfitId, shopId },
        // shopifyProductId is intentionally preserved so re-publish updates the
        // existing Shopify product instead of creating a duplicate.
        data: { status: 'completed', errorMessage: null, shopifySyncStatus: 'stale' },
      }),
    ]);

    return { outfitId, status: 'completed' };
  },
});
