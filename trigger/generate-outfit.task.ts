import { task } from '@trigger.dev/sdk/v3';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { uploadImageToBlob } from '../app/blob.server';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../app/lib/pdpPresets';
import type { GarmentSpec } from '../app/lib/garmentSpec';

// ── Payload ───────────────────────────────────────────────────────────────────

interface GenerateOutfitPayload {
  outfitId: string;
  shopId: string;
  modelImageUrl: string;
  modelHeight?: string;
  styleId: string;
  stylingDirectionId: string;
  allowedPoses: string[];
  cleanBackFlatLayUrl?: string;
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
    const { outfitId, shopId, modelImageUrl, modelHeight, styleId, stylingDirectionId, allowedPoses, cleanBackFlatLayUrl } = payload;
    // Fallback: if payload is missing allowedPoses (old client), default to front only
    const poses = allowedPoses?.length ? allowedPoses : ['front'];

    // ── Reset status — preserves completed poses across retries ──────────────
    await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'pending' } });

    // ── 1. Fetch outfit data ──────────────────────────────────────────────────
    const outfit = await prisma.outfit.findFirstOrThrow({
      where: { id: outfitId, shopId },
      select: { cleanFlatLayUrl: true, garmentSpec: true, name: true },
    });

    const garmentSpec = outfit.garmentSpec as GarmentSpec | null;
    if (!garmentSpec) throw new Error('Garment spec missing from outfit record');
    if (!outfit.cleanFlatLayUrl) throw new Error('Clean flat lay URL missing from outfit record');

    // ── Query completed poses for retry idempotency ───────────────────────────
    const existingImages = await prisma.generatedImage.findMany({
      where: { outfitId },
      select: { pose: true, imageUrl: true },
    });
    const completedPoses = new Set(existingImages.map((img) => img.pose));

    // ── 2. Download flat lay(s) ───────────────────────────────────────────────
    const cleanFlatLayB64 = await fetchAsBase64(outfit.cleanFlatLayUrl);
    const cleanBackFlatLayB64 = cleanBackFlatLayUrl
      ? await fetchAsBase64(cleanBackFlatLayUrl).catch(() => null)
      : null;

    // ── 3. Download + normalize model reference ───────────────────────────────
    const modelBuffer = await fetchAsBuffer(modelImageUrl);
    const normalizedModelBuffer = await normalizeReferenceImageServer(modelBuffer);
    const normalizedModelB64 = normalizedModelBuffer.toString('base64');

    // ── 4. Resolve style presets ──────────────────────────────────────────────
    const stylePreset = PDP_STYLE_PRESETS.find(p => p.id === styleId) ?? PDP_STYLE_PRESETS[0];
    const stylingDir =
      STYLING_DIRECTION_PRESETS.find(p => p.id === stylingDirectionId) ??
      STYLING_DIRECTION_PRESETS[0];

    // ── 5. Init Gemini stateful chat ──────────────────────────────────────────
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const genConfig = {
      temperature: 0.2,
      imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    };
    const chat = ai.chats.create({ model: 'gemini-3.1-flash-image-preview', config: genConfig });
    const sharp = (await import('sharp')).default;

    const hasBack = !!cleanBackFlatLayB64;

    // ── 6. Front pose ─────────────────────────────────────────────────────────
    let frontB64: string;
    if (completedPoses.has('front')) {
      // Front already generated on a previous attempt — re-fetch from blob so
      // tq/back can use it as an inline reference without regenerating.
      const frontRecord = existingImages.find((img) => img.pose === 'front')!;
      frontB64 = await fetchAsBase64(frontRecord.imageUrl);
    } else {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_front' } });

      const frontPrompt = buildPromptFromSpec(
        garmentSpec, 'front', stylePreset.promptSnippet, hasBack, false, modelHeight, stylingDir,
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

    // ── 7. Three-quarter pose ─────────────────────────────────────────────────
    if (poses.includes('three-quarter') && !completedPoses.has('three-quarter')) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_tq' } });

      const tqPrompt = buildPromptFromSpec(
        garmentSpec, 'three-quarter', stylePreset.promptSnippet, hasBack, true, modelHeight, stylingDir,
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

    // ── 8. Back pose ──────────────────────────────────────────────────────────
    if (poses.includes('back') && !completedPoses.has('back')) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_back' } });

      const backPrompt = buildPromptFromSpec(
        garmentSpec, 'back', stylePreset.promptSnippet, hasBack, true, modelHeight, stylingDir,
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
