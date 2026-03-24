import { describe, expect, it } from "vitest";

import { buildSrcSet, buildVariantUrl } from "./imageVariants";

describe("buildVariantUrl", () => {
  it("builds hashed variant URLs without duplicating the extension", () => {
    expect(
      buildVariantUrl(
        "https://blob.example/outfits/shop/outfit/front.abcd1234.png",
        640,
        "avif",
      ),
    ).toBe("https://blob.example/outfits/shop/outfit/front.abcd1234-640w.avif");
  });

  it("preserves query strings and hashes", () => {
    expect(
      buildVariantUrl(
        "https://blob.example/outfits/shop/outfit/front.abcd1234.png?foo=1#bar",
        800,
        "webp",
      ),
    ).toBe("https://blob.example/outfits/shop/outfit/front.abcd1234-800w.webp?foo=1#bar");
  });

  it("returns the original URL when it is not a png", () => {
    expect(buildVariantUrl("https://blob.example/front.jpg", 640, "avif")).toBe(
      "https://blob.example/front.jpg",
    );
  });
});

describe("buildSrcSet", () => {
  it("builds a comma-separated srcset", () => {
    expect(
      buildSrcSet(
        "https://blob.example/outfits/shop/outfit/front.abcd1234.png",
        "avif",
        [640, 800],
      ),
    ).toBe(
      "https://blob.example/outfits/shop/outfit/front.abcd1234-640w.avif 640w, https://blob.example/outfits/shop/outfit/front.abcd1234-800w.avif 800w",
    );
  });
});
