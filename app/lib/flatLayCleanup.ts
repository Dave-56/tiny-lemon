import { GoogleGenAI } from '@google/genai';
import { GEMINI_IMAGE_MODEL } from './geminiModels';
import { logServerEvent } from './observability.server';

const LIGHT_BACKGROUND_THRESHOLD = 238;
const MAX_CHANNEL_SPREAD = 18;
export const IMAGE_SERVICE_CAPACITY_MESSAGE =
  'AI image generation is temporarily at capacity. Please try again in a few minutes.';
export const IMAGE_SERVICE_QUOTA_OR_RATE_LIMIT_MESSAGE =
  'AI image generation is busy right now. Please try again in a few minutes.';
export const IMAGE_SERVICE_BILLING_CONFIGURATION_MESSAGE =
  'AI image generation is currently unavailable. Our team has been alerted. Please try again later.';
export const IMAGE_SERVICE_UNAVAILABLE_MESSAGE =
  'AI image generation provider is temporarily unavailable. Please try again shortly.';

export type ImageProviderErrorKind =
  | 'quota_or_rate_limit'
  | 'provider_billing'
  | 'safety'
  | 'invalid_input'
  | 'provider_unavailable'
  | 'unknown';

const REFUNDABLE_IMAGE_PROVIDER_ERROR_KINDS: readonly ImageProviderErrorKind[] = [
  'quota_or_rate_limit',
  'provider_billing',
  'provider_unavailable',
];

export class UserFacingImageProviderError extends Error {
  providerErrorKind: ImageProviderErrorKind;

  constructor(message: string, providerErrorKind: ImageProviderErrorKind) {
    super(message);
    this.name = 'UserFacingImageProviderError';
    this.providerErrorKind = providerErrorKind;
  }
}

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
    logImageProviderError(e, {
      taskId: 'flat-lay-cleanup',
      stage: 'cleanup',
    });
    throw createUserFacingImageProviderError(e, 'Failed to process image. Please try again.');
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
    logImageProviderError(e, {
      taskId: 'flat-lay-cleanup',
      stage: 'demo_cleanup',
    });
    throw createUserFacingImageProviderError(e, 'Failed to process image. Please try again.');
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  throw new Error('No cleaned image was returned. Please try a different garment photo.');
}

export function getUserFacingImageServiceError(error: unknown, fallback: string): string {
  const providerErrorKind = classifyImageProviderError(error);
  const msg = getImageProviderErrorMessage(error);
  const lower = msg.toLowerCase();

  if (providerErrorKind === 'safety') {
    return 'Image was flagged by the safety filter. Try a different garment photo.';
  }

  if (providerErrorKind === 'invalid_input') {
    return 'Invalid image format. Please use a JPEG or PNG.';
  }

  if (providerErrorKind === 'provider_billing') {
    return IMAGE_SERVICE_BILLING_CONFIGURATION_MESSAGE;
  }

  if (providerErrorKind === 'quota_or_rate_limit') {
    return IMAGE_SERVICE_QUOTA_OR_RATE_LIMIT_MESSAGE;
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
    lower.includes('404') ||
    providerErrorKind === 'provider_unavailable'
  ) {
    return IMAGE_SERVICE_UNAVAILABLE_MESSAGE;
  }

  return fallback;
}

export function createUserFacingImageProviderError(error: unknown, fallback: string) {
  return new UserFacingImageProviderError(
    getUserFacingImageServiceError(error, fallback),
    classifyImageProviderError(error),
  );
}

export function classifyImageProviderError(error: unknown): ImageProviderErrorKind {
  const msg = getImageProviderErrorMessage(error).toLowerCase();

  if (
    msg.includes('safety') ||
    msg.includes('blocked') ||
    msg.includes('prohibited')
  ) {
    return 'safety';
  }

  if (
    msg.includes('invalid_argument') ||
    msg.includes('invalid image') ||
    msg.includes('unsupported image') ||
    msg.includes('unsupported mime') ||
    msg.includes('400')
  ) {
    return 'invalid_input';
  }

  if (
    msg.includes('billing') ||
    msg.includes('payment') ||
    msg.includes('credit')
  ) {
    return 'provider_billing';
  }

  if (
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('429')
  ) {
    return 'quota_or_rate_limit';
  }

  if (
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('capacity') ||
    msg.includes('timeout') ||
    msg.includes('deadline') ||
    msg.includes('internal') ||
    msg.includes('500') ||
    msg.includes('503')
  ) {
    return 'provider_unavailable';
  }

  return 'unknown';
}

export function getImageProviderErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

function getImageProviderErrorField(error: unknown, field: 'status' | 'code') {
  if (!error || typeof error !== 'object') return undefined;
  const value = (error as Record<string, unknown>)[field];
  if (typeof value === 'string' || typeof value === 'number') return value;
  return undefined;
}

function shouldAlertForProviderConfiguration(error: unknown, providerErrorKind: ImageProviderErrorKind) {
  if (providerErrorKind === 'provider_billing') return true;
  if (providerErrorKind !== 'quota_or_rate_limit') return false;

  const message = getImageProviderErrorMessage(error).toLowerCase();
  return (
    message.includes('resource_exhausted') ||
    message.includes('quota') ||
    message.includes('billing') ||
    message.includes('credit')
  );
}

export function logImageProviderError(
  error: unknown,
  context: {
    taskId: string;
    stage: string;
    outfitId?: string;
    shopId?: string;
  },
) {
  const providerErrorKind = classifyImageProviderError(error);
  const providerStatus = getImageProviderErrorField(error, 'status');
  const providerCode = getImageProviderErrorField(error, 'code');
  const rawMessage = getImageProviderErrorMessage(error);

  logServerEvent('error', 'image_provider.gemini_failed', {
    ...context,
    providerErrorKind,
    providerStatus,
    providerCode,
    rawMessage,
  });

  if (shouldAlertForProviderConfiguration(error, providerErrorKind)) {
    logServerEvent('error', 'image_provider.gemini_configuration_alert', {
      ...context,
      providerErrorKind,
      providerStatus,
      providerCode,
      rawMessage,
    });
  }
}

export function isImageServiceCapacityErrorMessage(message: string): boolean {
  return message === IMAGE_SERVICE_CAPACITY_MESSAGE;
}

export function isRefundableImageProviderFailure(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const providerErrorKind = (error as { providerErrorKind?: unknown }).providerErrorKind;
    if (
      typeof providerErrorKind === 'string' &&
      REFUNDABLE_IMAGE_PROVIDER_ERROR_KINDS.includes(providerErrorKind as ImageProviderErrorKind)
    ) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return isImageServiceCapacityErrorMessage(message);
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
