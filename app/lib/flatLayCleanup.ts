import { GoogleGenAI } from '@google/genai';
import { GEMINI_IMAGE_MODEL } from './geminiModels';

const LIGHT_BACKGROUND_THRESHOLD = 238;
const MAX_CHANNEL_SPREAD = 18;

const CLEANUP_PROMPT = `You are given a photo of a clothing item. It may be on a hanger, on a person, on a table, or have a messy background.

TASK: Generate a clean, professional flat lay product photo of this garment only.

REQUIREMENTS:
- The garment must be laid completely flat, as if pressed and arranged on a surface
- Background: pure white seamless studio surface (#FFFFFF) — no shadows, no texture, no edges visible
- Lighting: soft, even, shadowless — no harsh highlights or dark areas on the fabric
- Fabric must look smooth and wrinkle-free (as if steamed and styled by a professional)
- Show the full garment from collar/shoulders to hem — nothing cropped
- Centre the garment in the frame with even margins on all sides
- No mannequin, no hanger, no person, no props, no accessories
- Preserve all garment details exactly: buttons, zippers, logos, labels, stitching, hardware, pockets, seams, pattern, print, color
- Do not add or remove design elements. Do not change neckline, sleeve length, or hem
- Output: one photorealistic image in the style of premium e-commerce flat lay photography (e.g. Mr Porter, SSENSE, COS)`;

/**
 * Takes any raw garment photo (hanger, on model, messy background, kitchen table)
 * and returns a clean white-background studio flat lay via Gemini image generation.
 *
 * Output is the base64 PNG string (no data: prefix).
 * This is deliverable 1 AND the input to extractGarmentSpec + all generation calls.
 */
export async function cleanFlatLay(
  rawImageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const mime = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: rawImageBase64, mimeType: mime } },
          { text: CLEANUP_PROMPT },
        ],
      },
      config: {
        responseModalities: ['IMAGE'],
        temperature: 0.2,
      },
    });
  } catch (e) {
    throw new Error(getUserFacingImageServiceError(e, 'Failed to process image. Please try again.'));
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  throw new Error('No cleaned image was returned. Please try a different garment photo.');
}

const DEMO_CLEANUP_PROMPT = `You are given a photo of a clothing item. It may be on a hanger, on a person, on a table, in a room, against a coloured wall, on a coloured or patterned surface, or in any other setting.

TASK: Generate a clean, professional flat lay product photo of this garment only.

REQUIREMENTS:
- Strip the background completely — no matter what it is (coloured, patterned, shadowed, cluttered, natural, or white). Replace it with a pure white (#FFFFFF) seamless studio surface with no texture, no edges, no shadows.
- The garment must be laid completely flat, as if pressed and arranged on a surface
- Lighting: soft, even, shadowless — no harsh highlights or dark areas on the fabric
- Fabric must look smooth and wrinkle-free (as if steamed and styled by a professional)
- Show the full garment from collar/shoulders to hem — nothing cropped
- Centre the garment in the frame with even margins on all sides
- No mannequin, no hanger, no person, no props, no accessories, no background elements of any kind
- Preserve all garment details exactly: buttons, zippers, logos, labels, stitching, hardware, pockets, seams, pattern, print, color
- Do not add or remove design elements. Do not change neckline, sleeve length, or hem
- Output: one photorealistic image in the style of premium e-commerce flat lay photography (e.g. Mr Porter, SSENSE, COS)`;

/**
 * More aggressive flat-lay cleanup for the /try demo path.
 * Explicitly strips any background (cluttered, coloured, shadowed) and normalises
 * to clean white. Lower temperature (0.1) for less variation.
 * Output is the base64 PNG string (no data: prefix).
 */
export async function cleanFlatLayForDemo(
  rawImageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const mime = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: {
        parts: [
          { inlineData: { data: rawImageBase64, mimeType: mime } },
          { text: DEMO_CLEANUP_PROMPT },
        ],
      },
      config: {
        responseModalities: ['IMAGE'],
        temperature: 0.1,
      },
    });
  } catch (e) {
    throw new Error(getUserFacingImageServiceError(e, 'Failed to process image. Please try again.'));
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  throw new Error('No cleaned image was returned. Please try a different garment photo.');
}

export function getUserFacingImageServiceError(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  const lower = msg.toLowerCase();

  if (
    lower.includes('safety') ||
    lower.includes('blocked') ||
    lower.includes('prohibited')
  ) {
    return 'Image was flagged by the safety filter. Try a different garment photo.';
  }

  if (
    lower.includes('invalid_argument') ||
    lower.includes('invalid image') ||
    lower.includes('unsupported image') ||
    lower.includes('unsupported mime') ||
    lower.includes('400')
  ) {
    return 'Invalid image format. Please use a JPEG or PNG.';
  }

  if (
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate_limit') ||
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('credit') ||
    lower.includes('billing')
  ) {
    return 'AI image generation is temporarily at capacity. Please try again in a few minutes.';
  }

  if (
    lower.includes('not_found') ||
    lower.includes('not found for api version') ||
    lower.includes('model not found') ||
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('api key') ||
    lower.includes('403') ||
    lower.includes('404')
  ) {
    return 'AI image service is temporarily unavailable. Please try again shortly.';
  }

  return fallback;
}

export async function normalizeFlatLayToPng(
  rawImageBase64: string,
): Promise<string> {
  const sharp = (await import('sharp')).default;
  const buffer = await sharp(Buffer.from(rawImageBase64, 'base64'))
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({
      width: 1400,
      height: 1400,
      fit: 'inside',
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ progressive: true })
    .toBuffer();
  return buffer.toString('base64');
}

export async function hasCleanWhiteFlatLayBackground(
  rawImageBase64: string,
): Promise<boolean> {
  try {
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(Buffer.from(rawImageBase64, 'base64'))
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: 80, height: 80, fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    if (!width || !height) return false;

    let borderPixels = 0;
    let lightBorderPixels = 0;
    let interiorPixels = 0;
    let garmentLikePixels = 0;
    const border = Math.max(3, Math.floor(Math.min(width, height) * 0.08));

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const isLightNeutral =
          r >= LIGHT_BACKGROUND_THRESHOLD &&
          g >= LIGHT_BACKGROUND_THRESHOLD &&
          b >= LIGHT_BACKGROUND_THRESHOLD &&
          max - min <= MAX_CHANNEL_SPREAD;
        const isBorder =
          x < border || y < border || x >= width - border || y >= height - border;

        if (isBorder) {
          borderPixels += 1;
          if (isLightNeutral) lightBorderPixels += 1;
        } else {
          interiorPixels += 1;
          if (!isLightNeutral) garmentLikePixels += 1;
        }
      }
    }

    const lightBorderRatio = borderPixels ? lightBorderPixels / borderPixels : 0;
    const garmentRatio = interiorPixels ? garmentLikePixels / interiorPixels : 0;
    return lightBorderRatio >= 0.88 && garmentRatio >= 0.03;
  } catch {
    return false;
  }
}
