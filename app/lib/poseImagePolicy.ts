export type PoseImagePresetId =
  | "outfitCardHero"
  | "outfitCardSecondary"
  | "dressModelPreview"
  | "lightbox";

export type PoseImageFallbackKind = "webp";

type PoseImagePreset = {
  sizes: string;
  baseWidths: number[];
  upscaledWidths: number[];
  fallbackKind: PoseImageFallbackKind;
};

export const POSE_IMAGE_PRESETS: Record<PoseImagePresetId, PoseImagePreset> = {
  // Cards render inside a constrained 4xl container. Keep the advertised size
  // close to the real slot width so the browser doesn't over-select candidates.
  outfitCardHero: {
    sizes: "(min-width: 1024px) 260px, (min-width: 768px) 34vw, 45vw",
    baseWidths: [240, 320, 480],
    upscaledWidths: [240, 320, 480, 640],
    fallbackKind: "webp",
  },
  outfitCardSecondary: {
    sizes: "(min-width: 1024px) 220px, (min-width: 768px) 30vw, 42vw",
    baseWidths: [240, 320, 480],
    upscaledWidths: [240, 320, 480, 640],
    fallbackKind: "webp",
  },
  dressModelPreview: {
    sizes: "(min-width: 1024px) 240px, 45vw",
    baseWidths: [240, 320, 480],
    upscaledWidths: [240, 320, 480, 640],
    fallbackKind: "webp",
  },
  lightbox: {
    sizes: "800px",
    baseWidths: [480, 640, 800],
    upscaledWidths: [480, 640, 800, 1200, 1600],
    fallbackKind: "webp",
  },
};

export function getPoseImagePreset(
  presetId: PoseImagePresetId,
): PoseImagePreset {
  return POSE_IMAGE_PRESETS[presetId];
}

function collectWidths<K extends "baseWidths" | "upscaledWidths">(
  key: K,
  maxWidth?: number,
): number[] {
  return Array.from(
    new Set(
      Object.values(POSE_IMAGE_PRESETS)
        .flatMap((preset) => preset[key])
        .filter((width) => maxWidth == null || width <= maxWidth),
    ),
  ).sort((a, b) => a - b);
}

export function getBaseVariantWidths(maxWidth?: number): number[] {
  return collectWidths("baseWidths", maxWidth);
}

export function getUpscaledVariantWidths(maxWidth?: number): number[] {
  return collectWidths("upscaledWidths", maxWidth);
}

export function getDefaultDisplayFallbackWidth(maxWidth: number): number {
  const preferredWidth = 640;
  return Math.min(preferredWidth, maxWidth);
}

export function getUpscaledDisplayFallbackWidth(maxWidth: number): number {
  const preferredWidth = 1200;
  return Math.min(preferredWidth, maxWidth);
}
