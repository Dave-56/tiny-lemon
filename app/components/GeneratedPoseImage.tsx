import { useEffect, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import {
  buildVariantSrcSet,
  parsePoseImageAssetManifest,
} from "../lib/imageAssetManifest";

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
      {...imgProps}
    />
  );

  const avifVariants = manifest?.variants.avif ?? [];
  const webpVariants = manifest?.variants.webp ?? [];

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
