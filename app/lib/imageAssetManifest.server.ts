import sharp from "sharp";

import { uploadImageToBlob, uploadImageVariant } from "../blob.server";
import type {
  PoseImageAssetManifest,
  PoseImageVariant,
  UpscaledImageBlock,
} from "./imageAssetManifest";
import {
  getBaseVariantWidths,
  getDefaultDisplayFallbackWidth,
  getUpscaledDisplayFallbackWidth,
  getUpscaledVariantWidths,
} from "./poseImagePolicy";

async function createWebpDisplayFallback(
  pngBuffer: Buffer,
  pathnameStem: string,
  width: number,
  fallbackWidth: number,
): Promise<{ url: string; width: number; contentType: "image/webp" }> {
  const safeWidth = Math.min(fallbackWidth, width);
  const fallbackBuffer = await sharp(pngBuffer)
    .resize({ width: safeWidth, withoutEnlargement: true })
    .webp({ quality: 65 })
    .toBuffer();
  const fallbackUrl = await uploadImageVariant(
    fallbackBuffer,
    `${pathnameStem}-${safeWidth}w.display.webp`,
    "image/webp",
    31536000,
  );

  return {
    url: fallbackUrl,
    width: safeWidth,
    contentType: "image/webp",
  };
}

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
  const variantWidths = getBaseVariantWidths(width);
  const originalUrl = await uploadImageToBlob(
    pngBuffer,
    `${pathnameStem}.png`,
    "image/png",
    31536000,
    "inline",
  );
  const displayFallback = await createWebpDisplayFallback(
    pngBuffer,
    pathnameStem,
    width,
    getDefaultDisplayFallbackWidth(width),
  );

  const avif: PoseImageVariant[] = [];
  const webp: PoseImageVariant[] = [];

  for (const variantWidth of variantWidths) {
    const resized = sharp(pngBuffer).resize({
      width: variantWidth,
      withoutEnlargement: true,
    });

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

    const webpBuffer = await resized.clone().webp({ quality: 60 }).toBuffer();
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
    kind: "pose-image-v2",
    original: {
      url: originalUrl,
      width,
      height,
      contentType: "image/png",
    },
    displayFallback,
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
  const variantWidths = getUpscaledVariantWidths(width);

  const originalUrl = await uploadImageToBlob(
    upscaledPngBuffer,
    `${upscaledStem}.png`,
    "image/png",
    31536000,
    "inline",
  );
  const displayFallback = await createWebpDisplayFallback(
    upscaledPngBuffer,
    upscaledStem,
    width,
    getUpscaledDisplayFallbackWidth(width),
  );
  const avif: PoseImageVariant[] = [];
  const webp: PoseImageVariant[] = [];

  for (const variantWidth of variantWidths) {
    if (variantWidth > width) continue;

    const resized = sharp(upscaledPngBuffer).resize({
      width: variantWidth,
      withoutEnlargement: true,
    });

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

    const webpBuffer = await resized.clone().webp({ quality: 60 }).toBuffer();
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
    displayFallback,
    variants: { avif, webp },
    downloadUrl: originalUrl,
    scale,
  };

  return {
    ...existingManifest,
    upscaled,
  };
}
