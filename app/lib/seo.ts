import type { MetaDescriptor } from "react-router";

export const SITE_URL = "https://tinylemon.xyz";
export const DEFAULT_OG_IMAGE_PATH = "/og-default.jpg";
export const DEFAULT_OG_IMAGE_ALT =
  "TinyLemon turns flat-lay fashion product photos into Shopify-ready AI model images.";

type SeoMetaOptions = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  ogImagePath?: string;
  ogImageAlt?: string;
  extra?: MetaDescriptor[];
};

export function absoluteSiteUrl(path: string): string {
  if (path.startsWith("https://") || path.startsWith("http://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath === "/" ? "/" : normalizedPath}`;
}

export function buildSeoMeta({
  title,
  description,
  path,
  type = "website",
  ogImagePath = DEFAULT_OG_IMAGE_PATH,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
  extra = [],
}: SeoMetaOptions): MetaDescriptor[] {
  const canonicalUrl = absoluteSiteUrl(path);
  const ogImageUrl = absoluteSiteUrl(ogImagePath);

  return [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { property: "og:url", content: canonicalUrl },
    { property: "og:image", content: ogImageUrl },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: ogImageAlt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImageUrl },
    ...extra,
  ];
}
