import { task } from '@trigger.dev/sdk/v3';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { uploadImageToBlob } from '../app/blob.server';
import { cleanFlatLay } from '../app/lib/flatLayCleanup';
import { extractGarmentSpec } from '../app/lib/garmentSpec';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../app/lib/pdpPresets';
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
  stylingDirectionId: string;
  allowedPoses: string[];
}

// ── Task ──────────────────────────────────────────────────────────────────────

export const generateOutfitTask = task({
  id: 'generate-outfit',
  /** Generous ceiling: 3 Gemini image calls + sharp crops + blob uploads ≈ 60–120s */
  maxDuration: 300,
  /** Cap at 3 concurrent jobs to stay within Gemini rate limits */
  queue: { concurrencyLimit: 3 },
  retry: { maxAttempts: 2 },

  /** Called only after all retry attempts are exhausted — mark outfit failed */
  onFailure: async ({ payload, error }: { payload: GenerateOutfitPayload; error: unknown }) => {
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
      stylingDirectionId,
      allowedPoses,
    } = payload;
    const poses = allowedPoses?.length ? allowedPoses : ['front'];
    const apiKey = process.env.GEMINI_API_KEY!;

    // ── Reset status — preserves completed poses across retries ──────────────
    const existing = await prisma.outfit.findFirst({ where: { id: outfitId, shopId }, select: { id: true } });
    if (!existing) {
      throw new Error(
        `Outfit ${outfitId} not found for shop ${shopId}. Ensure Trigger.dev DATABASE_URL matches the app (same Neon DB).`,
      );
    }
    await prisma.outfit.update({ where: { id: outfitId, shopId }, data: { status: 'pending' } });

    // ── 0. Fetch raw images, clean, extract spec, upload cleaned, backfill outfit ─
    const rawFrontB64 = await fetchAsBase64(rawFrontUrl);
    const rawBackB64 = rawBackUrl ? await fetchAsBase64(rawBackUrl).catch(() => null) : null;

    const cleanFlatLayB64 = await cleanFlatLay(rawFrontB64, frontMime, apiKey);
    const cleanBackFlatLayB64 =
      rawBackB64
        ? await cleanFlatLay(rawBackB64, backMime, apiKey).catch(() => null)
        : null;

    const garmentSpec = await extractGarmentSpec(cleanFlatLayB64, 'image/png', apiKey);

    const cleanFlatLayUrl = await uploadImageToBlob(
      Buffer.from(cleanFlatLayB64, 'base64'),
      `outfits/${shopId}/${outfitId}/flat-lay.png`,
    );
    let cleanBackFlatLayUrl: string | null = null;
    if (cleanBackFlatLayB64) {
      cleanBackFlatLayUrl = await uploadImageToBlob(
        Buffer.from(cleanBackFlatLayB64, 'base64'),
        `outfits/${shopId}/${outfitId}/flat-lay-back.png`,
      );
    }

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: {
        frontFlatLayUrl: cleanFlatLayUrl,
        cleanFlatLayUrl,
        cleanBackFlatLayUrl,
        garmentSpec: JSON.parse(JSON.stringify(garmentSpec)),
      },
    });

    // ── 1. Fetch outfit data (now with clean URLs + spec) ──────────────────────
    const outfit = await prisma.outfit.findFirstOrThrow({
      where: { id: outfitId, shopId },
      select: { cleanFlatLayUrl: true, garmentSpec: true, name: true },
    });

    const outfitGarmentSpec = outfit.garmentSpec as GarmentSpec | null;
    if (!outfitGarmentSpec) throw new Error('Garment spec missing from outfit record');
    if (!outfit.cleanFlatLayUrl) throw new Error('Clean flat lay URL missing from outfit record');

    // ── Query completed poses for retry idempotency ───────────────────────────
    const existingImages = await prisma.generatedImage.findMany({
      where: { outfitId },
      select: { pose: true, imageUrl: true },
    });
    const completedPoses = new Set(existingImages.map((img) => img.pose));

    // cleanFlatLayB64 and cleanBackFlatLayB64 already in memory from phase 0

    // ── 2. Download + normalize model reference ───────────────────────────────
    const modelBuffer = await fetchAsBuffer(modelImageUrl);
    const normalizedModelBuffer = await normalizeReferenceImageServer(modelBuffer);
    const normalizedModelB64 = normalizedModelBuffer.toString('base64');

    // ── 3. Resolve style presets ──────────────────────────────────────────────
    const stylePreset = PDP_STYLE_PRESETS.find(p => p.id === styleId) ?? PDP_STYLE_PRESETS[0];
    const stylingDir =
      STYLING_DIRECTION_PRESETS.find(p => p.id === stylingDirectionId) ??
      STYLING_DIRECTION_PRESETS[0];

    // ── 4. Init Gemini stateful chat ──────────────────────────────────────────
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const genConfig = {
      temperature: 0.2,
      imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    };
    const chat = ai.chats.create({ model: 'gemini-3.1-flash-image-preview', config: genConfig });
    const sharp = (await import('sharp')).default;

    const hasBack = !!cleanBackFlatLayB64;

    // ── 5. Front pose ─────────────────────────────────────────────────────────
    let frontB64: string;
    if (completedPoses.has('front')) {
      // Front already generated on a previous attempt — re-fetch from blob so
      // tq/back can use it as an inline reference without regenerating.
      const frontRecord = existingImages.find((img) => img.pose === 'front')!;
      frontB64 = await fetchAsBase64(frontRecord.imageUrl);
    } else {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_front' } });

      const frontPrompt = buildPromptFromSpec(
        outfitGarmentSpec, 'front', stylePreset.promptSnippet, hasBack, false, modelHeight, stylingDir, modelGender,
      );
      const frontResp = await chat.sendMessage({
        message: [
          { inlineData: { data: cleanFlatLayB64, mimeType: 'image/png' as const } },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { text: frontPrompt },
        ],
        config: genConfig,
      });
      frontB64 = extractBase64(frontResp);
      const frontCropped = await sharp(Buffer.from(frontB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      const frontUrl = await uploadImageToBlob(
        frontCropped,
        `outfits/${shopId}/${outfitId}/front.png`,
      );
      await prisma.generatedImage.create({
        data: { shopId, outfitId, imageUrl: frontUrl, pose: 'front', styleId },
      });
    }

    // ── 6. Three-quarter pose ─────────────────────────────────────────────────
    if (poses.includes('three-quarter') && !completedPoses.has('three-quarter')) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_tq' } });

      const tqPrompt = buildPromptFromSpec(
        outfitGarmentSpec, 'three-quarter', stylePreset.promptSnippet, hasBack, true, modelHeight, stylingDir, modelGender,
      );
      const tqResp = await chat.sendMessage({
        message: [
          { inlineData: { data: cleanFlatLayB64, mimeType: 'image/png' as const } },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { inlineData: { data: frontB64, mimeType: 'image/png' as const } },
          { text: tqPrompt },
        ],
        config: genConfig,
      });
      const tqB64 = extractBase64(tqResp);
      const tqCropped = await sharp(Buffer.from(tqB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      const tqUrl = await uploadImageToBlob(
        tqCropped,
        `outfits/${shopId}/${outfitId}/three-quarter.png`,
      );
      await prisma.generatedImage.create({
        data: { shopId, outfitId, imageUrl: tqUrl, pose: 'three-quarter', styleId },
      });
    }

    // ── 7. Back pose ──────────────────────────────────────────────────────────
    if (poses.includes('back') && !completedPoses.has('back')) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_back' } });

      const backPrompt = buildPromptFromSpec(
        outfitGarmentSpec, 'back', stylePreset.promptSnippet, hasBack, true, modelHeight, stylingDir, modelGender,
      );
      const backResp = await chat.sendMessage({
        message: [
          { inlineData: { data: cleanBackFlatLayB64 ?? cleanFlatLayB64, mimeType: 'image/png' as const } },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { inlineData: { data: frontB64, mimeType: 'image/png' as const } },
          { text: backPrompt },
        ],
        config: genConfig,
      });
      const backB64 = extractBase64(backResp);
      const backCropped = await sharp(Buffer.from(backB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
        .png()
        .toBuffer();
      const backUrl = await uploadImageToBlob(
        backCropped,
        `outfits/${shopId}/${outfitId}/back.png`,
      );
      await prisma.generatedImage.create({
        data: { shopId, outfitId, imageUrl: backUrl, pose: 'back', styleId },
      });
    }

    // ── 8. Complete ───────────────────────────────────────────────────────────
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
