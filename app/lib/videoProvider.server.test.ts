import { describe, expect, it } from "vitest";

import { buildProviderInput, type OutfitSourceImage } from "./videoProvider.server";

describe("buildProviderInput", () => {
  it("uses a Kling-supported portrait aspect ratio", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      { url: "https://example.com/three-quarter.png", pose: "three-quarter", isUpscaled: false },
    ];

    const input = buildProviderInput("kwaivgi/kling-v3-video", {
      sourceImages: images,
      motionPrompt: "Subtle runway turn.",
      durationSeconds: 5,
    });

    expect(input).toMatchObject({
      start_image: "https://example.com/front.png",
      duration: 5,
      aspect_ratio: "9:16",
    });
  });
});
