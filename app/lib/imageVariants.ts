export type VariantFormat = 'avif' | 'webp';

function insertBeforeExt(url: string, insertion: string): string {
  // Assumes no query/hash. If present, they will be preserved as they are not used currently.
  const idx = url.lastIndexOf('.png');
  if (idx === -1) return url;
  return url.slice(0, idx) + insertion + url.slice(idx);
}

/**
 * From a stored PNG URL (possibly with a short content hash before .png),
 * derive variant URLs like `-640w.avif` and `-640w.webp`.
 */
export function buildVariantUrl(pngUrl: string, width: number, fmt: VariantFormat): string {
  const hasHash = /\.[a-f0-9]{8}\.png$/i.test(pngUrl);
  const insertion = hasHash ? `-${width}w.${fmt}` : `-${width}w.${fmt}`; // same suffix whether hashed or not
  return insertBeforeExt(pngUrl, insertion).replace(/\.png$/i, `.${fmt}`);
}

export function buildSrcSet(pngUrl: string, fmt: VariantFormat, widths: number[]): string {
  return widths.map((w) => `${buildVariantUrl(pngUrl, w, fmt)} ${w}w`).join(', ');
}

