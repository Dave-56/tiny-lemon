import { useEffect, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";

import { buildSrcSet } from "../lib/imageVariants";

type GeneratedPoseImageProps = Omit<
  ComponentPropsWithoutRef<"img">,
  "src" | "alt" | "onError"
> & {
  url: string;
  label: string;
  placeholderClassName?: string;
};

export function GeneratedPoseImage({
  url,
  label,
  placeholderClassName,
  ...imgProps
}: GeneratedPoseImageProps) {
  const [variantsEnabled, setVariantsEnabled] = useState(true);
  const [baseFailed, setBaseFailed] = useState(false);

  useEffect(() => {
    setVariantsEnabled(true);
    setBaseFailed(false);
  }, [url]);

  function handleError() {
    if (variantsEnabled) {
      setVariantsEnabled(false);
      return;
    }
    setBaseFailed(true);
  }

  if (baseFailed) {
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
      key={`${url}:${variantsEnabled ? "variants" : "base"}`}
      src={url}
      alt={label}
      onError={handleError}
      {...imgProps}
    />
  );

  if (!variantsEnabled) {
    return image;
  }

  return (
    <picture>
      <source
        type="image/avif"
        srcSet={buildSrcSet(url, "avif", [640, 800])}
        sizes={imgProps.sizes}
      />
      <source
        type="image/webp"
        srcSet={buildSrcSet(url, "webp", [640, 800])}
        sizes={imgProps.sizes}
      />
      {image}
    </picture>
  );
}
