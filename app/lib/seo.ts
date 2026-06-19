import type { MetaDescriptor } from "react-router";

export const SITE_URL = "https://tinylemon.xyz";
export const DEFAULT_OG_IMAGE_PATH = "/og-default.jpg";
export const DEFAULT_OG_IMAGE_ALT =
  "TinyLemon turns flat-lay fashion product photos into Shopify-ready AI model images.";
const SITE_ORIGIN = new URL(SITE_URL).origin;
const SITE_HOSTNAME = new URL(SITE_URL).hostname;
const REDIRECTABLE_CANONICAL_HOSTS = new Set([
  SITE_HOSTNAME,
  "www.tinylemon.xyz",
  "tinylemon.vercel.app",
]);

type SeoMetaOptions = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  ogImagePath?: string;
  ogImageAlt?: string;
  extra?: MetaDescriptor[];
};

export function normalizeCanonicalPath(path: string): string {
  let pathname = path;

  try {
    pathname = new URL(path, SITE_URL).pathname;
  } catch {
    pathname = path.startsWith("/") ? path : `/${path}`;
  }

  pathname = pathname.split(/[?#]/, 1)[0] || "/";

  if (pathname !== "/") {
    pathname = pathname.replace(/\/+$/, "");
  }

  return pathname || "/";
}

export function canonicalSiteUrl(path: string): string {
  return `${SITE_ORIGIN}${normalizeCanonicalPath(path)}`;
}

export function absoluteSiteUrl(path: string): string {
  if (path.startsWith("https://") || path.startsWith("http://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath === "/" ? "/" : normalizedPath}`;
}

export function getCanonicalRedirectUrl(request: Request): string | null {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const url = new URL(request.url);

  if (!REDIRECTABLE_CANONICAL_HOSTS.has(url.hostname)) {
    return null;
  }

  const canonicalUrl = new URL(url);
  let shouldRedirect = false;

  if (canonicalUrl.protocol !== "https:") {
    canonicalUrl.protocol = "https:";
    shouldRedirect = true;
  }

  if (canonicalUrl.hostname !== SITE_HOSTNAME) {
    canonicalUrl.host = SITE_HOSTNAME;
    shouldRedirect = true;
  }

  const normalizedPath = normalizeCanonicalPath(canonicalUrl.pathname);
  if (normalizedPath !== canonicalUrl.pathname) {
    canonicalUrl.pathname = normalizedPath;
    shouldRedirect = true;
  }

  return shouldRedirect ? canonicalUrl.toString() : null;
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
  const canonicalUrl = canonicalSiteUrl(path);
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
