export type VariantFormat = 'avif' | 'webp';

function splitUrlSuffix(url: string): { base: string; suffix: string } {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const cutIndex =
    hashIndex === -1 ? queryIndex
    : queryIndex === -1 ? hashIndex
    : Math.min(hashIndex, queryIndex);

  if (cutIndex === -1) {
    return { base: url, suffix: '' };
  }

  return {
    base: url.slice(0, cutIndex),
    suffix: url.slice(cutIndex),
  };
}

/**
 * From a stored PNG URL (possibly with a short content hash before .png),
 * derive variant URLs like `-640w.avif` and `-640w.webp`.
 */
export function buildVariantUrl(pngUrl: string, width: number, fmt: VariantFormat): string {
  const { base, suffix } = splitUrlSuffix(pngUrl);
  const match = base.match(/^(.*)\.png$/i);
  if (!match) return pngUrl;
  return `${match[1]}-${width}w.${fmt}${suffix}`;
}

export function buildSrcSet(pngUrl: string, fmt: VariantFormat, widths: number[]): string {
  return widths.map((w) => `${buildVariantUrl(pngUrl, w, fmt)} ${w}w`).join(', ');
}
