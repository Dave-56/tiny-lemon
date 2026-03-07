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

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-preview-image-generation',
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

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  throw new Error('flatLayCleanup: no image returned from Gemini');
}
