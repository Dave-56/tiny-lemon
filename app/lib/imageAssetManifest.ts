export type PoseImageVariantFormat = "avif" | "webp";

export interface PoseImageVariant {
  url: string;
  width: number;
  contentType: string;
}

export interface UpscaledImageBlock {
  original: {
    url: string;
    width: number;
    height: number;
    contentType: string;
  };
  variants: {
    avif: PoseImageVariant[];
    webp: PoseImageVariant[];
  };
  downloadUrl: string;
  scale: 2 | 4;
}

export interface PoseImageAssetManifest {
  kind: "pose-image-v1";
  original: {
    url: string;
    width: number;
    height: number;
    contentType: string;
  };
  variants: {
    avif: PoseImageVariant[];
    webp: PoseImageVariant[];
  };
  downloadUrl: string;
  upscaled?: UpscaledImageBlock;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseVariant(value: unknown): PoseImageVariant | null {
  if (!isRecord(value)) return null;
  if (typeof value.url !== "string") return null;
  if (typeof value.width !== "number") return null;
  if (typeof value.contentType !== "string") return null;

  return {
    url: value.url,
    width: value.width,
    contentType: value.contentType,
  };
}

function parseVariantList(value: unknown): PoseImageVariant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseVariant)
    .filter((variant): variant is PoseImageVariant => variant !== null)
    .sort((a, b) => a.width - b.width);
}

export function parsePoseImageAssetManifest(
  value: unknown,
): PoseImageAssetManifest | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "pose-image-v1") return null;
  if (!isRecord(value.original)) return null;
  if (!isRecord(value.variants)) return null;
  if (typeof value.downloadUrl !== "string") return null;

  const original = value.original;
  if (typeof original.url !== "string") return null;
  if (typeof original.width !== "number") return null;
  if (typeof original.height !== "number") return null;
  if (typeof original.contentType !== "string") return null;

  const manifest: PoseImageAssetManifest = {
    kind: "pose-image-v1",
    original: {
      url: original.url,
      width: original.width,
      height: original.height,
      contentType: original.contentType,
    },
    variants: {
      avif: parseVariantList(value.variants.avif),
      webp: parseVariantList(value.variants.webp),
    },
    downloadUrl: value.downloadUrl,
  };

  if (isRecord(value.upscaled)) {
    const up = value.upscaled;
    if (
      isRecord(up.original) &&
      typeof up.original.url === "string" &&
      typeof up.original.width === "number" &&
      typeof up.original.height === "number" &&
      typeof up.original.contentType === "string" &&
      isRecord(up.variants) &&
      typeof up.downloadUrl === "string" &&
      (up.scale === 2 || up.scale === 4)
    ) {
      manifest.upscaled = {
        original: {
          url: up.original.url,
          width: up.original.width,
          height: up.original.height,
          contentType: up.original.contentType,
        },
        variants: {
          avif: parseVariantList(up.variants.avif),
          webp: parseVariantList(up.variants.webp),
        },
        downloadUrl: up.downloadUrl,
        scale: up.scale as 2 | 4,
      };
    }
  }

  return manifest;
}

export function buildVariantSrcSet(variants: PoseImageVariant[]): string {
  return variants.map((variant) => `${variant.url} ${variant.width}w`).join(", ");
}
