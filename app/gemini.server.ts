import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface ModelAttributes {
  name: string;
  gender: string;
  ethnicity: string;
  skinTone: string;
  bodyBuild: string;
  height: string;
  hairStyle: string;
  hairColor: string;
  ageRange: string;
}

const AGE_RANGES = ['18–24', '25–34', '35–44', '45–54', '55+'] as const;

export function buildModelPrompt(
  attrs: ModelAttributes,
  styleSnippet: string,
  angleSnippet: string,
): string {
  const namePart = attrs.name ? `Name: ${attrs.name}\n` : '';
  const outfit =
    attrs.gender === 'Male'
      ? 'Fitted black crew-neck t-shirt, full length with hem sitting at the waist. Black slim-fit shorts, mid-thigh length.'
      : 'Black short-sleeve fitted crop top ending at midriff. Black high-waist short shorts (hotpants length, upper thigh only).';

  return `Generate a photorealistic fashion model portrait with these attributes:

${namePart}Gender: ${attrs.gender}
Ethnicity: ${attrs.ethnicity}
Skin tone: ${attrs.skinTone}
Body build: ${attrs.bodyBuild}
Height: ${attrs.height}
Hair: ${attrs.hairStyle}, ${attrs.hairColor}
Age range: ${attrs.ageRange}

REQUIREMENTS:
- ${styleSnippet}
- ${angleSnippet}
- Full body portrait from head to toe
- IMPORTANT: Must not crop head or feet. The entire body from head to toes must be visible.
- 2:3 portrait framing. Center the model with even margins on all sides.
- OUTFIT (locked — use this exact description every time, no variation): ${outfit} Same garment style for all models.
- Footwear: Model must be BAREFOOT. No shoes, no heels, no sandals, no footwear of any kind.
- High resolution, sharp details
- The model should look like a real person, not AI-generated`;
}

/** Generate a model image. Returns raw base64 (no data URL prefix). */
export async function generateModelImage(
  attrs: ModelAttributes,
  styleSnippet: string,
  angleSnippet: string,
): Promise<string> {
  const prompt = buildModelPrompt(attrs, styleSnippet, angleSnippet);
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      temperature: 0.4,
      imageConfig: { aspectRatio: '2:3', imageSize: '1K' },
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return part.inlineData.data;
  }

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason === 'IMAGE_SAFETY' || finishReason === 'SAFETY') {
    throw new Error('Image was filtered by safety filters. Try different attributes.');
  }
  throw new Error('No image data returned from model.');
}

/** Estimate age range from a generated model image. Returns null on failure. */
export async function estimateAge(base64: string): Promise<string | null> {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: {
      parts: [
        { inlineData: { data: base64, mimeType: 'image/png' } },
        {
          text: 'Look at this fashion model image. What age range does this person appear to be? Reply with exactly one of these options, nothing else: 18–24, 25–34, 35–44, 45–54, 55+',
        },
      ],
    },
  });

  const text = response.text?.trim() ?? '';
  return AGE_RANGES.find(r => text.includes(r)) ?? null;
}
