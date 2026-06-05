import type { GarmentSpec } from './garmentSpec';
import type { GoogleGenAI } from '@google/genai';
import { GEMINI_TEXT_MODEL } from './geminiModels';
import { logImageProviderError } from './flatLayCleanup';

const GRAPHIC_DETAIL_RE =
  /\b(logo|text|lettering|word|words|typography|type|print|printed|graphic|number|numbers|slogan|chest|back graphic|emblem|badge|label)\b/i;

export type GraphicSourceSide = 'front' | 'back';
export type GraphicPose = 'front' | 'three-quarter' | 'back';

export interface GraphicFidelityReference {
  sourceSide: GraphicSourceSide;
  rawReferenceUrl?: string;
  referenceCropUrl?: string;
  description?: string;
}

export interface GraphicFidelityMetadata {
  critical: boolean;
  description?: string;
  references?: GraphicFidelityReference[];
  /** Legacy single-reference fields. Prefer references[]. */
  rawReferenceUrl?: string;
  referenceCropUrl?: string;
}

export interface GraphicFidelityPromptContext {
  critical: boolean;
  sourceSide?: GraphicSourceSide;
  description?: string;
  rawReferenceUrl?: string;
  referenceCropUrl?: string;
  hasRawReference?: boolean;
  hasReferenceCrop?: boolean;
}

export type GraphicFidelityValidationVerdict = 'ok' | 'failed' | 'uncertain';

export function isGraphicCriticalSpec(spec: Pick<GarmentSpec, 'has_logo_or_text' | 'notable_details'>): boolean {
  return spec.has_logo_or_text || GRAPHIC_DETAIL_RE.test(spec.notable_details ?? '');
}

export function getGraphicDescription(spec: Pick<GarmentSpec, 'notable_details'>): string | undefined {
  const details = spec.notable_details?.trim();
  return details ? details : undefined;
}

export function mergeGraphicFidelityIntoSpec(
  cleanedSpec: GarmentSpec,
  rawSpec: GarmentSpec,
  referenceCropUrl?: string,
  rawReferenceUrl?: string,
  sourceSide: GraphicSourceSide = 'front',
): GarmentSpec {
  const rawCritical = isGraphicCriticalSpec(rawSpec);
  const cleanCritical = isGraphicCriticalSpec(cleanedSpec);
  const critical = rawCritical || cleanCritical;
  const rawDescription = getGraphicDescription(rawSpec);
  const cleanDescription = getGraphicDescription(cleanedSpec);
  const description = rawDescription ?? cleanDescription;

  return {
    ...cleanedSpec,
    has_logo_or_text: cleanedSpec.has_logo_or_text || rawSpec.has_logo_or_text || critical,
    notable_details: description ?? cleanedSpec.notable_details,
    graphicFidelity: critical
      ? {
          critical: true,
          description,
          references: [
            {
              sourceSide,
              ...(description ? { description } : {}),
              ...(rawReferenceUrl ? { rawReferenceUrl } : {}),
              ...(referenceCropUrl ? { referenceCropUrl } : {}),
            },
          ],
          ...(rawReferenceUrl ? { rawReferenceUrl } : {}),
          ...(referenceCropUrl ? { referenceCropUrl } : {}),
        }
      : undefined,
  };
}

function graphicSideForPose(pose: GraphicPose): GraphicSourceSide {
  return pose === 'back' ? 'back' : 'front';
}

function getLegacyGraphicReference(metadata: GraphicFidelityMetadata, spec: GarmentSpec): GraphicFidelityReference | undefined {
  if (!metadata.rawReferenceUrl && !metadata.referenceCropUrl) return undefined;
  const referenceContext = (spec as { referenceContext?: { primaryImageSide?: GraphicSourceSide } }).referenceContext;
  return {
    sourceSide: referenceContext?.primaryImageSide ?? 'front',
    description: metadata.description,
    ...(metadata.rawReferenceUrl ? { rawReferenceUrl: metadata.rawReferenceUrl } : {}),
    ...(metadata.referenceCropUrl ? { referenceCropUrl: metadata.referenceCropUrl } : {}),
  };
}

export function getGraphicReferenceForPose(
  spec: GarmentSpec,
  pose: GraphicPose,
): GraphicFidelityReference | undefined {
  const metadata = spec.graphicFidelity;
  if (!metadata?.critical) return undefined;
  const targetSide = graphicSideForPose(pose);
  const references = metadata.references?.length
    ? metadata.references
    : [getLegacyGraphicReference(metadata, spec)].filter(Boolean) as GraphicFidelityReference[];

  return references.find((reference) => {
    if (reference.sourceSide !== targetSide) return false;
    return Boolean(reference.rawReferenceUrl || reference.referenceCropUrl);
  });
}

export function getGraphicPromptContextForPose(
  spec: GarmentSpec,
  pose: GraphicPose,
): GraphicFidelityPromptContext | undefined {
  const reference = getGraphicReferenceForPose(spec, pose);
  if (reference) {
    return {
      critical: true,
      sourceSide: reference.sourceSide,
      description: reference.description ?? spec.graphicFidelity?.description ?? getGraphicDescription(spec),
      rawReferenceUrl: reference.rawReferenceUrl,
      referenceCropUrl: reference.referenceCropUrl,
      hasRawReference: Boolean(reference.rawReferenceUrl),
      hasReferenceCrop: Boolean(reference.referenceCropUrl),
    };
  }

  if (spec.graphicFidelity?.critical) {
    return { critical: false };
  }

  return undefined;
}

export function getGraphicPromptContext(spec: GarmentSpec): GraphicFidelityPromptContext | undefined {
  const metadata = spec.graphicFidelity;
  const critical = Boolean(metadata?.critical) || isGraphicCriticalSpec(spec);
  if (!critical) return undefined;
  const reference = metadata?.references?.find((entry) => entry.rawReferenceUrl || entry.referenceCropUrl);

  return {
    critical: true,
    sourceSide: reference?.sourceSide,
    description: reference?.description ?? metadata?.description ?? getGraphicDescription(spec),
    rawReferenceUrl: reference?.rawReferenceUrl ?? metadata?.rawReferenceUrl,
    referenceCropUrl: reference?.referenceCropUrl ?? metadata?.referenceCropUrl,
    hasRawReference: Boolean(reference?.rawReferenceUrl ?? metadata?.rawReferenceUrl),
    hasReferenceCrop: Boolean(reference?.referenceCropUrl ?? metadata?.referenceCropUrl),
  };
}

export async function extractGraphicReferenceCrop(rawImageBase64: string): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const image = sharp(Buffer.from(rawImageBase64, 'base64'))
    .rotate()
    .flatten({ background: '#ffffff' });
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) {
    throw new Error('Cannot extract graphic crop from image with missing dimensions.');
  }

  const cropWidth = Math.max(1, Math.round(width * 0.72));
  const cropHeight = Math.max(1, Math.round(height * 0.56));
  const left = Math.max(0, Math.round((width - cropWidth) / 2));
  const top = Math.max(0, Math.round(height * 0.08));

  return image
    .extract({
      left,
      top,
      width: Math.min(cropWidth, width - left),
      height: Math.min(cropHeight, height - top),
    })
    .resize({
      width: 900,
      height: 700,
      fit: 'inside',
      withoutEnlargement: true,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ progressive: true })
    .toBuffer();
}

export async function validateGeneratedGraphicFidelity(
  ai: GoogleGenAI,
  args: {
    referenceCropBase64: string;
    generatedImageBase64: string;
    description?: string;
    outfitId: string;
    shopId: string;
    taskId: string;
    stage: string;
  },
): Promise<GraphicFidelityValidationVerdict> {
  const description = args.description
    ? `Expected graphic detail: ${args.description}`
    : 'Expected graphic detail: preserve the major logo, text, print, typography, or graphic from the reference crop.';

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: 'Image 1 is a close-up reference crop of a garment graphic. Image 2 is a generated full-body fashion image.' },
          { inlineData: { data: args.referenceCropBase64, mimeType: 'image/png' } },
          { inlineData: { data: args.generatedImageBase64, mimeType: 'image/png' } },
          {
            text:
              `${description}\n\n` +
              'Judge only whether the main visible graphic/logo/print survives in Image 2. Ignore tiny text that is too small to read at full-body scale. ' +
              'Return ONLY one word: ok, failed, or uncertain. Use failed only if the main graphic is missing, replaced, mirrored, or clearly changed. Use uncertain if Image 2 is too small or ambiguous.',
          },
        ],
      }],
      config: { temperature: 0 },
    });
    const text = (response.text ?? '').trim().toLowerCase();
    if (text.includes('failed')) return 'failed';
    if (text.includes('ok')) return 'ok';
    return 'uncertain';
  } catch (error) {
    logImageProviderError(error, {
      taskId: args.taskId,
      outfitId: args.outfitId,
      shopId: args.shopId,
      stage: `validate_graphic_${args.stage}`,
    });
    return 'uncertain';
  }
}
