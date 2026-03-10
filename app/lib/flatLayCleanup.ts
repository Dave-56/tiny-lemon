import { GoogleGenAI } from '@google/genai';

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
      model: 'gemini-3.1-flash-image-preview',
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
    const msg = (e as Error).message ?? '';
    if (msg.includes('NOT_FOUND') || msg.includes('not found for API version')) {
      throw new Error('AI image service is temporarily unavailable. Please try again shortly.');
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      throw new Error('AI rate limit reached. Please wait a moment and try again.');
    }
    if (msg.includes('SAFETY') || msg.includes('safety')) {
      throw new Error('Image was flagged by the safety filter. Try a different garment photo.');
    }
    if (msg.includes('INVALID_ARGUMENT')) {
      throw new Error('Invalid image format. Please use a JPEG or PNG.');
    }
    throw new Error('Failed to process image. Please try again.');
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
      model: 'gemini-3.1-flash-image-preview',
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
    const msg = (e as Error).message ?? '';
    if (msg.includes('NOT_FOUND') || msg.includes('not found for API version')) {
      throw new Error('AI image service is temporarily unavailable. Please try again shortly.');
    }
    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
      throw new Error('AI rate limit reached. Please wait a moment and try again.');
    }
    if (msg.includes('SAFETY') || msg.includes('safety')) {
      throw new Error('Image was flagged by the safety filter. Try a different garment photo.');
    }
    if (msg.includes('INVALID_ARGUMENT')) {
      throw new Error('Invalid image format. Please use a JPEG or PNG.');
    }
    throw new Error('Failed to process image. Please try again.');
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  throw new Error('No cleaned image was returned. Please try a different garment photo.');
}
