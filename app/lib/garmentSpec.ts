/**
 * Garment spec: structured descriptor extracted from a flat-lay image.
 * Single source of truth for all poses in the flat-lay → model flow.
 */
export interface GarmentSpec {
  garment_type: string;
  hem_length: string;
  sleeve_length: string;
  fit: string;
  silhouette: string;
  primary_colors: string[];
  has_logo_or_text: boolean;
  notable_details: string;
}

const EXTRACTION_PROMPT = `This image is the FRONT flat lay of the garment. The hem_length you report will be the single source of truth for all poses (front, three-quarter, back). Report length from this image only.

Analyze this flat-lay garment image. Return ONLY valid JSON with these exact keys (no markdown, no code block):
{
  "garment_type": "specific type, e.g. midi dress, cropped hoodie",
  "hem_length": "above knee | at knee | below knee | ankle | floor (for tops: waist | hip)",
  "sleeve_length": "sleeveless | cap | short | elbow | three-quarter | long",
  "fit": "tight | fitted | relaxed | oversized",
  "silhouette": "bodycon | straight | A-line | trapeze | oversized",
  "primary_colors": ["array of 1-3 dominant colors"],
  "has_logo_or_text": true or false,
  "notable_details": "brief string of distinctive features"
}`;

function parseSpecFromText(text: string): GarmentSpec | null {
  const trimmed = text.trim();
  // Strip markdown code block if present
  const jsonStr = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return {
      garment_type: String(parsed.garment_type ?? 'garment'),
      hem_length: String(parsed.hem_length ?? 'at knee'),
      sleeve_length: String(parsed.sleeve_length ?? 'short'),
      fit: String(parsed.fit ?? 'relaxed'),
      silhouette: String(parsed.silhouette ?? 'straight'),
      primary_colors: Array.isArray(parsed.primary_colors)
        ? (parsed.primary_colors as string[]).map(String).slice(0, 3)
        : ['neutral'],
      has_logo_or_text: Boolean(parsed.has_logo_or_text),
      notable_details: String(parsed.notable_details ?? ''),
    };
  } catch {
    return null;
  }
}

import { GoogleGenAI } from '@google/genai';

/**
 * Extract a structured garment spec from a flat-lay image using one vision call.
 * Uses a fast text-only model (e.g. Gemini Flash). One call per garment.
 */
export async function extractGarmentSpec(
  flatLayBase64: string,
  mimeType: string,
  apiKey: string
): Promise<GarmentSpec> {
  const ai = new GoogleGenAI({ apiKey });
  const mime = mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: {
      parts: [
        { inlineData: { data: flatLayBase64, mimeType: mime } },
        { text: EXTRACTION_PROMPT },
      ],
    },
    config: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const text = (response.text ?? '').trim();
  const spec = parseSpecFromText(text);
  if (spec) return spec;

  // Fallback if JSON parse failed
  return {
    garment_type: 'garment',
    hem_length: 'at knee',
    sleeve_length: 'short',
    fit: 'relaxed',
    silhouette: 'straight',
    primary_colors: ['neutral'],
    has_logo_or_text: false,
    notable_details: '',
  };
}
