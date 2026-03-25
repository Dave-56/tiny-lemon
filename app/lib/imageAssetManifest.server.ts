import sharp from "sharp";

import { uploadImageToBlob, uploadImageVariant } from "../blob.server";
import type { PoseImageAssetManifest, PoseImageVariant } from "./imageAssetManifest";

const DEFAULT_VARIANT_WIDTHS = [320, 640, 800] as const;

export async function createPoseAssetManifest({
  pngBuffer,
  pathnameStem,
  width,
  height,
}: {
  pngBuffer: Buffer;
  pathnameStem: string;
  width: number;
  height: number;
}): Promise<PoseImageAssetManifest> {
  const originalUrl = await uploadImageToBlob(
    pngBuffer,
    `${pathnameStem}.png`,
    "image/png",
    86400,
    "inline",
  );

  const avif: PoseImageVariant[] = [];
  const webp: PoseImageVariant[] = [];

  for (const variantWidth of DEFAULT_VARIANT_WIDTHS) {
    const resized = sharp(pngBuffer).resize({ width: variantWidth });

    const avifBuffer = await resized
      .clone()
      .avif({ quality: 50, effort: 4 })
      .toBuffer();
    const avifUrl = await uploadImageVariant(
      avifBuffer,
      `${pathnameStem}-${variantWidth}w.avif`,
      "image/avif",
      31536000,
    );
    avif.push({
      url: avifUrl,
      width: variantWidth,
      contentType: "image/avif",
    });

    const webpBuffer = await resized
      .clone()
      .webp({ quality: 60 })
      .toBuffer();
    const webpUrl = await uploadImageVariant(
      webpBuffer,
      `${pathnameStem}-${variantWidth}w.webp`,
      "image/webp",
      31536000,
    );
    webp.push({
      url: webpUrl,
      width: variantWidth,
      contentType: "image/webp",
    });
  }

  return {
    kind: "pose-image-v1",
    original: {
      url: originalUrl,
      width,
      height,
      contentType: "image/png",
    },
    variants: { avif, webp },
    downloadUrl: originalUrl,
  };
}
