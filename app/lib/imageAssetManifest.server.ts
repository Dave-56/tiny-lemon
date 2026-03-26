import sharp from "sharp";

import { uploadImageToBlob, uploadImageVariant } from "../blob.server";
import type { PoseImageAssetManifest, PoseImageVariant, UpscaledImageBlock } from "./imageAssetManifest";

const DEFAULT_VARIANT_WIDTHS = [320, 640, 800] as const;

const UPSCALED_VARIANT_WIDTHS_2X = [320, 640, 800, 1200, 1600] as const;
const UPSCALED_VARIANT_WIDTHS_4X = [320, 640, 800, 1600, 2048, 3200] as const;

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

export async function addUpscaledToManifest({
  existingManifest,
  upscaledPngBuffer,
  pathnameStem,
  width,
  height,
  scale,
}: {
  existingManifest: PoseImageAssetManifest;
  upscaledPngBuffer: Buffer;
  pathnameStem: string;
  width: number;
  height: number;
  scale: 2 | 4;
}): Promise<PoseImageAssetManifest> {
  const upscaledStem = `${pathnameStem}-upscaled-${scale}x`;

  const originalUrl = await uploadImageToBlob(
    upscaledPngBuffer,
    `${upscaledStem}.png`,
    "image/png",
    86400,
    "inline",
  );

  const variantWidths = scale === 2 ? UPSCALED_VARIANT_WIDTHS_2X : UPSCALED_VARIANT_WIDTHS_4X;
  const avif: PoseImageVariant[] = [];
  const webp: PoseImageVariant[] = [];

  for (const variantWidth of variantWidths) {
    if (variantWidth > width) continue;

    const resized = sharp(upscaledPngBuffer).resize({ width: variantWidth });

    const avifBuffer = await resized
      .clone()
      .avif({ quality: 50, effort: 4 })
      .toBuffer();
    const avifUrl = await uploadImageVariant(
      avifBuffer,
      `${upscaledStem}-${variantWidth}w.avif`,
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
      `${upscaledStem}-${variantWidth}w.webp`,
      "image/webp",
      31536000,
    );
    webp.push({
      url: webpUrl,
      width: variantWidth,
      contentType: "image/webp",
    });
  }

  const upscaled: UpscaledImageBlock = {
    original: {
      url: originalUrl,
      width,
      height,
      contentType: "image/png",
    },
    variants: { avif, webp },
    downloadUrl: originalUrl,
    scale,
  };

  return {
    ...existingManifest,
    upscaled,
  };
}
