import { task } from '@trigger.dev/sdk/v3';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { uploadImageToBlob } from '../app/blob.server';
import { cleanFlatLay, cleanFlatLayForDemo } from '../app/lib/flatLayCleanup';
import { extractGarmentSpec } from '../app/lib/garmentSpec';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { buildTryDemoPrompt } from '../app/lib/tryDemoPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, BRAND_STYLE_PRESETS } from '../app/lib/pdpPresets';
import { DEMO_SHOP_ID } from '../app/lib/billing.server';
import type { GarmentSpec } from '../app/lib/garmentSpec';

// ── Payload ───────────────────────────────────────────────────────────────────

interface GenerateOutfitPayload {
  outfitId: string;
  shopId: string;
  /** Raw (uncleaned) flat lay image URLs — job runs cleanFlatLay + extractGarmentSpec */
  rawFrontUrl: string;
  rawBackUrl?: string;
  frontMime?: string;
  backMime?: string;
  modelImageUrl: string;
  modelHeight?: string;
  /** Model gender (e.g. Male, Female) — used to pick male/neutral pose snippets when present. */
  modelGender?: string;
  styleId: string;
  brandStyleId: string;
  /** Brand price point (value | mid-market | premium | luxury) — shapes production quality cue in prompt. */
  pricePoint?: string;
  /** Brand energy (minimal | accessible | editorial | premium | street | athletic) — shapes mood/tone cue in prompt. */
  brandEnergy?: string;
  /** Primary category (womenswear | menswear | unisex | activewear | streetwear | formalwear | other) — shapes category context in prompt. */
  primaryCategory?: string;
  allowedPoses: string[];
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const generateOutfitTask = task({
  id: 'generate-outfit',
  /** Generous ceiling: 3 Gemini image calls + sharp crops + blob uploads ≈ 60–120s each */
  maxDuration: 600,
  /** Cap at 3 concurrent jobs to stay within Gemini rate limits */
  queue: { concurrencyLimit: 3 },
  retry: { maxAttempts: 2 },

  /** Called only after all retry attempts are exhausted — mark outfit failed */
  onFailure: async ({ payload, error }: { payload: GenerateOutfitPayload; error: unknown }) => {
    const existing = await prisma.outfit.findFirst({
      where: { id: payload.outfitId, shopId: payload.shopId },
      select: { errorMessage: true },
    });
    if (existing?.errorMessage === 'Cancelled by user') return;
    const errorMessage = error instanceof Error ? error.message : 'Generation failed.';
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
      modelImageUrl,
      modelHeight,
      modelGender,
      styleId,
      brandStyleId,
      pricePoint,
      brandEnergy,
      primaryCategory,
      allowedPoses,
    } = payload;
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
    const rawFrontB64 = await fetchAsBase64(rawFrontUrl);
    const rawBackB64 = rawBackUrl ? await fetchAsBase64(rawBackUrl).catch(() => null) : null;

    // ── 1. Clean flat lay — skipped for demo to save ~20s ────────────────────
    let cleanFlatLayB64: string;
    let cleanFlatLayUrl: string;
    let cleanBackFlatLayB64: string | null = null;
    let cleanBackFlatLayUrl: string | null = null;
    const cleanMime = 'image/png';

    if (isDemo) {
      // Run aggressive cleanup for quality, but skip blob upload (demo has no regeneration)
      cleanFlatLayB64 = await cleanFlatLayForDemo(rawFrontB64, frontMime, apiKey);
      cleanBackFlatLayB64 = rawBackB64;
      cleanFlatLayUrl = rawFrontUrl;
    } else {
      cleanFlatLayB64 = await cleanFlatLay(rawFrontB64, frontMime, apiKey);
      const [uploadedUrl, cleanedBack] = await Promise.all([
        uploadImageToBlob(Buffer.from(cleanFlatLayB64, 'base64'), `outfits/${shopId}/${outfitId}/flat-lay.png`),
        rawBackB64 ? cleanFlatLay(rawBackB64, backMime, apiKey).catch(() => null) : Promise.resolve(null),
      ]);
      cleanFlatLayUrl = uploadedUrl;
      cleanBackFlatLayB64 = cleanedBack;
      if (cleanBackFlatLayB64) {
        cleanBackFlatLayUrl = await uploadImageToBlob(
          Buffer.from(cleanBackFlatLayB64, 'base64'),
          `outfits/${shopId}/${outfitId}/flat-lay-back.png`,
        );
      }
    }

    // ── 2. Spec extraction + model normalisation in parallel ──────────────────
    const [garmentSpec, normalizedModelB64] = await Promise.all([
      extractGarmentSpec(cleanFlatLayB64, cleanMime, apiKey),
      fetchAsBuffer(modelImageUrl)
        .then(buf => normalizeReferenceImageServer(buf))
        .then(buf => buf.toString('base64')),
    ]);

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { frontFlatLayUrl: cleanFlatLayUrl, cleanFlatLayUrl, cleanBackFlatLayUrl, garmentSpec: JSON.parse(JSON.stringify(garmentSpec)) },
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
    // A persistent chat causes the front image to appear twice in the 3/4 context
    // (once as chat history, once as the length anchor), anchoring the model to
    // the front pose and collapsing the 45° rotation.
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

    const hasBack = !!cleanBackFlatLayB64;

    // ── 6. Front pose ─────────────────────────────────────────────────────────
    let frontB64: string;
    if (completedPoses.has('front')) {
      const frontRecord = existingImages.find((img) => img.pose === 'front')!;
      frontB64 = await fetchAsBase64(frontRecord.imageUrl);
    } else {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_front' } });
      const frontPrompt = isDemo
        ? buildTryDemoPrompt(garmentSpec, modelGender, modelHeight)
        : buildPromptFromSpec(garmentSpec, 'front', backdropSnippet, hasBack, false, modelHeight, stylingDir, modelGender, pricePoint, brandEnergy, primaryCategory);
      const frontResp = await ai.models.generateContent({
        model: MODEL,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: cleanFlatLayB64, mimeType: cleanMime } },
            { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
            { text: frontPrompt },
          ],
        }],
        config: frontGenConfig,
      });
      frontB64 = extractBase64(frontResp);
      const frontCropped = await sharp(Buffer.from(frontB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      const frontUrl = await uploadImageToBlob(frontCropped, `outfits/${shopId}/${outfitId}/front.png`);
      await prisma.generatedImage.create({ data: { shopId, outfitId, imageUrl: frontUrl, pose: 'front', styleId } });
    }

    // ── 7. Three-quarter + back poses (parallel) ─────────────────────────────
    // Both depend on frontB64 but NOT on each other — run in parallel to save
    // ~25-35s. Text primer before images primes Gemini for rotation before it
    // processes front-oriented reference images.
    const needsTq = poses.includes('three-quarter') && !completedPoses.has('three-quarter');
    const needsBack = poses.includes('back') && !completedPoses.has('back');

    if (needsTq || needsBack) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_poses' } });
    }

    const generateThreeQuarter = async () => {
      if (!needsTq) return;
      const tqPrompt = buildPromptFromSpec(
        garmentSpec, 'three-quarter', backdropSnippet, hasBack, true, modelHeight, stylingDir, modelGender, pricePoint, brandEnergy, primaryCategory,
      );
      const tqContents = [{
        role: 'user' as const,
        parts: [
          { text: 'THREE-QUARTER VIEW: camera positioned 45° to the model\'s right. Do NOT generate a front-facing pose.' },
          { inlineData: { data: cleanFlatLayB64, mimeType: cleanMime } },
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
      // Validate pose — retry once with slightly higher temperature if 3/4 collapsed to front
      const tqValid = await validatePose(ai, tqB64, 'three-quarter');
      if (!tqValid) {
        const retryResp = await ai.models.generateContent({
          model: MODEL,
          contents: tqContents,
          config: { ...threeQuarterGenConfig, temperature: 0.45 },
        });
        tqB64 = extractBase64(retryResp);
      }
      const tqCropped = await sharp(Buffer.from(tqB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png()
        .toBuffer();
      const tqUrl = await uploadImageToBlob(tqCropped, `outfits/${shopId}/${outfitId}/three-quarter.png`);
      await prisma.generatedImage.create({ data: { shopId, outfitId, imageUrl: tqUrl, pose: 'three-quarter', styleId } });
    };

    const generateBack = async () => {
      if (!needsBack) return;
      const backPrompt = buildPromptFromSpec(
        garmentSpec, 'back', backdropSnippet, hasBack, true, modelHeight, stylingDir, modelGender, pricePoint, brandEnergy, primaryCategory,
      );
      const backContents = [{
        role: 'user' as const,
        parts: [
          { text: 'BACK VIEW: camera directly behind the model. Do NOT generate a front-facing pose.' },
          { inlineData: { data: cleanBackFlatLayB64 ?? cleanFlatLayB64, mimeType: cleanMime } },
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
      // Validate pose — retry once with slightly higher temperature if back collapsed
      const backValid = await validatePose(ai, backB64, 'back');
      if (!backValid) {
        const retryResp = await ai.models.generateContent({
          model: MODEL,
          contents: backContents,
          config: { ...backGenConfig, temperature: 0.4 },
        });
        backB64 = extractBase64(retryResp);
      }
      const backCropped = await sharp(Buffer.from(backB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'attention' })
        .png()
        .toBuffer();
      const backUrl = await uploadImageToBlob(backCropped, `outfits/${shopId}/${outfitId}/back.png`);
      await prisma.generatedImage.create({ data: { shopId, outfitId, imageUrl: backUrl, pose: 'back', styleId } });
    };

    await Promise.all([generateThreeQuarter(), generateBack()]);

    // ── 9. Complete ───────────────────────────────────────────────────────────
    await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'completed' } });

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
