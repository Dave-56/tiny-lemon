import { describe, expect, it } from "vitest";

import {
  buildSeoMeta,
  canonicalSiteUrl,
  getCanonicalRedirectUrl,
  normalizeCanonicalPath,
} from "./seo";

describe("seo canonical URLs", () => {
  it("normalizes canonical paths without trailing slashes", () => {
    expect(normalizeCanonicalPath("/blog/")).toBe("/blog");
    expect(normalizeCanonicalPath("/")).toBe("/");
    expect(normalizeCanonicalPath("pricing")).toBe("/pricing");
  });

  it("builds canonical site URLs on the production origin", () => {
    expect(canonicalSiteUrl("/blog/")).toBe("https://tinylemon.xyz/blog");
    expect(canonicalSiteUrl("https://www.tinylemon.xyz/pricing?utm_source=test")).toBe(
      "https://tinylemon.xyz/pricing"
    );
  });

  it("uses normalized canonical URLs in SEO metadata", () => {
    const meta = buildSeoMeta({
      title: "Tiny Lemon",
      description: "AI model photos for Shopify fashion brands.",
      path: "/features/",
    });

    expect(meta).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://tinylemon.xyz/features",
    });
    expect(meta).toContainEqual({
      property: "og:url",
      content: "https://tinylemon.xyz/features",
    });
  });
});

describe("canonical redirects", () => {
  it("redirects www, HTTP, and trailing-slash variants to the canonical URL", () => {
    const request = new Request("http://www.tinylemon.xyz/blog/?utm_source=test");

    expect(getCanonicalRedirectUrl(request)).toBe(
      "https://tinylemon.xyz/blog?utm_source=test"
    );
  });

  it("redirects the legacy Vercel hostname", () => {
    const request = new Request("https://tinylemon.vercel.app/pricing");

    expect(getCanonicalRedirectUrl(request)).toBe("https://tinylemon.xyz/pricing");
  });

  it("does not redirect already-canonical URLs", () => {
    const request = new Request("https://tinylemon.xyz/features");

    expect(getCanonicalRedirectUrl(request)).toBeNull();
  });

  it("does not redirect local or tunnel hosts used for development", () => {
    const request = new Request("https://example.ngrok-free.dev/blog/");

    expect(getCanonicalRedirectUrl(request)).toBeNull();
  });

  it("does not redirect non-GET requests", () => {
    const request = new Request("http://www.tinylemon.xyz/try/", {
      method: "POST",
    });

    expect(getCanonicalRedirectUrl(request)).toBeNull();
  });
});
