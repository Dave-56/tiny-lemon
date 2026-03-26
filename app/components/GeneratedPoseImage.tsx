import { useEffect, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import {
  buildVariantSrcSet,
  parsePoseImageAssetManifest,
  type PoseImageVariant,
} from "../lib/imageAssetManifest";

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
  placeholderClassName?: string;
};

export function GeneratedPoseImage({
  url,
  asset,
  label,
  placeholderClassName,
  fetchPriority,
  ...imgProps
}: GeneratedPoseImageProps) {
  const [baseFailed, setBaseFailed] = useState(false);
  const manifest = parsePoseImageAssetManifest(asset);
  const resolvedUrl = manifest?.original.url ?? url;

  useEffect(() => {
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
      onError={() => setBaseFailed(true)}
      // React SSR doesn't map camelCase fetchPriority to the DOM attribute
      {...(fetchPriority ? { fetchpriority: fetchPriority } : {})}
      {...imgProps}
    />
  );

  // Merge upscaled variants (larger widths) into the base srcset so the browser
  // picks the best variant for the viewport — mobile gets 320/640, desktop gets 1600+.
  const avifVariants = dedupeByWidth([
    ...(manifest?.variants.avif ?? []),
    ...(manifest?.upscaled?.variants.avif ?? []),
  ]);
  const webpVariants = dedupeByWidth([
    ...(manifest?.variants.webp ?? []),
    ...(manifest?.upscaled?.variants.webp ?? []),
  ]);

  if (avifVariants.length === 0 && webpVariants.length === 0) {
    return image;
  }

  return (
    <picture>
      {avifVariants.length > 0 ? (
        <source
          type="image/avif"
          srcSet={buildVariantSrcSet(avifVariants)}
          sizes={imgProps.sizes}
        />
      ) : null}
      {webpVariants.length > 0 ? (
        <source
          type="image/webp"
          srcSet={buildVariantSrcSet(webpVariants)}
          sizes={imgProps.sizes}
        />
      ) : null}
      {image}
    </picture>
  );
}
