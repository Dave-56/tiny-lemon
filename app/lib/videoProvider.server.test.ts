import { describe, expect, it } from "vitest";

import {
  buildProviderInput,
  selectVideoSourceImages,
  type OutfitSourceImage,
} from "./videoProvider.server";

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

  it("prefers an upscaled three-quarter image over a non-upscaled front image", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      {
        url: "https://example.com/three-quarter-upscaled.png",
        pose: "three-quarter",
        isUpscaled: true,
      },
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
    ];

    const selection = selectVideoSourceImages(images);

    expect(selection.hero).toMatchObject({
      url: "https://example.com/three-quarter-upscaled.png",
      pose: "three-quarter",
      isUpscaled: true,
    });
    expect(selection.scoredImages.map((entry) => entry.totalScore)).toEqual([36, 24, 8]);
  });

  it("breaks equal scores predictably in favor of front over three-quarter", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      {
        url: "https://example.com/three-quarter.png",
        pose: "three-quarter",
        isUpscaled: false,
      },
    ];

    const selection = selectVideoSourceImages(images);

    expect(selection.hero.url).toBe("https://example.com/front.png");
    expect(selection.orderedImages.map((image) => image.pose)).toEqual([
      "front",
      "three-quarter",
    ]);
  });

  it("pushes unknown poses to the end without crashing", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/detail.png", pose: "detail", isUpscaled: true },
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
    ];

    const selection = selectVideoSourceImages(images);

    expect(selection.orderedImages.map((image) => image.pose)).toEqual([
      "front",
      "detail",
      "back",
    ]);
    expect(selection.hero.pose).toBe("front");
  });

  it("keeps start_image aligned with the first reference image in multi-reference mode", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      {
        url: "https://example.com/three-quarter-upscaled.png",
        pose: "three-quarter",
        isUpscaled: true,
      },
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
    ];

    const input = buildProviderInput("kwaivgi/kling-omni-v1", {
      sourceImages: images,
      motionPrompt: "Subtle runway turn.",
      durationSeconds: 5,
    });

    expect(input).toMatchObject({
      start_image: "https://example.com/three-quarter-upscaled.png",
      reference_images: [
        "https://example.com/three-quarter-upscaled.png",
        "https://example.com/front.png",
        "https://example.com/back.png",
      ],
    });
  });
});
