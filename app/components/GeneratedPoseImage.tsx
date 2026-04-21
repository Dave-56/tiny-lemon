import { useEffect, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import {
  buildVariantSrcSet,
  getManifestDisplayFallback,
  parsePoseImageAssetManifest,
  type PoseImageVariant,
} from "../lib/imageAssetManifest";
import {
  getPoseImagePreset,
  type PoseImagePresetId,
} from "../lib/poseImagePolicy";

/** Deduplicate variants by width, preferring the upscaled (later) entry for shared widths. */
function dedupeByWidth(variants: PoseImageVariant[]): PoseImageVariant[] {
  const map = new Map<number, PoseImageVariant>();
  for (const v of variants) {
    map.set(v.width, v);
  }
  return Array.from(map.values()).sort((a, b) => a.width - b.width);
}

type GeneratedPoseImageProps = Omit<
  ComponentPropsWithoutRef<"img">,
  "src" | "alt" | "onError"
> & {
  url?: string;
  asset?: unknown;
  label: string;
  preset?: PoseImagePresetId;
  placeholderClassName?: string;
};

export function GeneratedPoseImage({
  url,
  asset,
  label,
  preset,
  placeholderClassName,
  fetchPriority,
  ...imgProps
}: GeneratedPoseImageProps) {
  const [manifestFailed, setManifestFailed] = useState(false);
  const [baseFailed, setBaseFailed] = useState(false);
  const manifest = parsePoseImageAssetManifest(asset);
  const displayFallback = manifest
    ? getManifestDisplayFallback(manifest)
    : null;
  const manifestUrl = displayFallback?.url ?? manifest?.original.url;
  const fallbackUrl = url && url !== manifestUrl ? url : undefined;
  const shouldUseManifest = Boolean(manifestUrl) && !manifestFailed;
  const resolvedUrl = shouldUseManifest
    ? manifestUrl
    : (fallbackUrl ?? manifestUrl ?? url);
  const resolvedSizes = preset
    ? getPoseImagePreset(preset).sizes
    : imgProps.sizes;

  useEffect(() => {
    setManifestFailed(false);
    setBaseFailed(false);
  }, [asset, url]);

  if (!resolvedUrl || baseFailed) {
    return (
      <div
        aria-hidden
        data-testid="generated-pose-placeholder"
        className={placeholderClassName}
      />
    );
  }

  const image = (
    <img
      key={resolvedUrl}
      src={resolvedUrl}
      alt={label}
      onError={() => {
        if (shouldUseManifest && fallbackUrl) {
          setManifestFailed(true);
          return;
        }
        setBaseFailed(true);
      }}
      // React SSR doesn't map camelCase fetchPriority to the DOM attribute
      {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
      {...imgProps}
      sizes={resolvedSizes}
    />
  );

  // Merge base and upscaled variants so responsive selection follows the shared
  // image policy instead of per-callsite guesses.
  const avifVariants = dedupeByWidth([
    ...(manifest?.variants.avif ?? []),
    ...(manifest?.upscaled?.variants.avif ?? []),
  ]);
  const webpVariants = dedupeByWidth([
    ...(manifest?.variants.webp ?? []),
    ...(manifest?.upscaled?.variants.webp ?? []),
  ]);

  if (
    !shouldUseManifest ||
    (avifVariants.length === 0 && webpVariants.length === 0)
  ) {
    return image;
  }

  return (
    <picture>
      {avifVariants.length > 0 ? (
        <source
          type="image/avif"
          srcSet={buildVariantSrcSet(avifVariants)}
          sizes={resolvedSizes}
        />
      ) : null}
      {webpVariants.length > 0 ? (
        <source
          type="image/webp"
          srcSet={buildVariantSrcSet(webpVariants)}
          sizes={resolvedSizes}
        />
      ) : null}
      {image}
    </picture>
  );
}
