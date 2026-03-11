import { task } from '@trigger.dev/sdk/v3';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import prisma from '../app/db.server';
import { uploadImageToBlob } from '../app/blob.server';
import { buildPromptFromSpec } from '../app/lib/garmentFidelityPrompt';
import { normalizeReferenceImageServer } from '../app/lib/normalizeReferenceImage.server';
import { PDP_STYLE_PRESETS, STYLING_DIRECTION_PRESETS } from '../app/lib/pdpPresets';
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
  maxDuration: 300,
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
      allowedPoses,
    } = payload;
    const poses = allowedPoses?.length ? allowedPoses : ['front'];

    const outfit = await prisma.outfit.findFirst({
      where: { id: outfitId, shopId },
      select: {
        cleanFlatLayUrl: true,
        cleanBackFlatLayUrl: true,
        garmentSpec: true,
        stylingDirectionId: true,
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

    const stylePreset = PDP_STYLE_PRESETS.find((p) => p.id === styleId) ?? PDP_STYLE_PRESETS[0];
    const stylingDir =
      STYLING_DIRECTION_PRESETS.find((p) => p.id === outfit.stylingDirectionId) ??
      STYLING_DIRECTION_PRESETS[0];

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const genConfig = {
      temperature: 0.2,
      imageConfig: { aspectRatio: '2:3' as const, imageSize: '1K' as const },
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    };
    const chat = ai.chats.create({ model: 'gemini-3.1-flash-image-preview', config: genConfig });
    const sharp = (await import('sharp')).default;

    const blobPrefix = `outfits/${shopId}/${outfitId}/regenerate`;

    // ── Front ─────────────────────────────────────────────────────────────────
    await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_front' } });
    const frontPrompt = appendUserDirection(
      buildPromptFromSpec(
        garmentSpec,
        'front',
        stylePreset.promptSnippet,
        hasBack,
        false,
        modelHeight,
        stylingDir,
        modelGender,
      ),
      userDirection,
    );
    const frontResp = await chat.sendMessage({
      message: [
        { inlineData: { data: cleanFlatLayB64, mimeType: 'image/png' as const } },
        { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
        { text: frontPrompt },
      ],
      config: genConfig,
    });
    let frontB64 = extractBase64(frontResp);
    const frontUrl = await uploadImageToBlob(
      await sharp(Buffer.from(frontB64, 'base64'))
        .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
        .png()
        .toBuffer(),
      `${blobPrefix}-front.png`,
    );

    // ── Three-quarter ─────────────────────────────────────────────────────────
    let tqUrl: string | null = null;
    if (poses.includes('three-quarter')) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_tq' } });
      const tqPrompt = appendUserDirection(
        buildPromptFromSpec(
          garmentSpec,
          'three-quarter',
          stylePreset.promptSnippet,
          hasBack,
          true,
          modelHeight,
          stylingDir,
          modelGender,
        ),
        userDirection,
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
      tqUrl = await uploadImageToBlob(
        await sharp(Buffer.from(tqB64, 'base64'))
          .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
          .png()
          .toBuffer(),
        `${blobPrefix}-three-quarter.png`,
      );
    }

    // ── Back ──────────────────────────────────────────────────────────────────
    let backUrl: string | null = null;
    if (poses.includes('back')) {
      await prisma.outfit.update({ where: { id: outfitId }, data: { status: 'generating_back' } });
      const backPrompt = appendUserDirection(
        buildPromptFromSpec(
          garmentSpec,
          'back',
          stylePreset.promptSnippet,
          hasBack,
          true,
          modelHeight,
          stylingDir,
          modelGender,
        ),
        userDirection,
      );
      const backResp = await chat.sendMessage({
        message: [
          {
            inlineData: {
              data: cleanBackFlatLayB64 ?? cleanFlatLayB64,
              mimeType: 'image/png' as const,
            },
          },
          { inlineData: { data: normalizedModelB64, mimeType: 'image/png' as const } },
          { inlineData: { data: frontB64, mimeType: 'image/png' as const } },
          { text: backPrompt },
        ],
        config: genConfig,
      });
      const backB64 = extractBase64(backResp);
      backUrl = await uploadImageToBlob(
        await sharp(Buffer.from(backB64, 'base64'))
          .resize({ width: 800, height: 1200, fit: 'cover', position: 'top' })
          .png()
          .toBuffer(),
        `${blobPrefix}-back.png`,
      );
    }

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
