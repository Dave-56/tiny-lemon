export type PoseImageVariantFormat = "avif" | "webp";

export interface PoseImageVariant {
  url: string;
  width: number;
  contentType: string;
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

  return {
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
}

export function buildVariantSrcSet(variants: PoseImageVariant[]): string {
  return variants.map((variant) => `${variant.url} ${variant.width}w`).join(", ");
}
