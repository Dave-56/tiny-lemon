import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  buildProviderInput,
  buildFalProviderInput,
  selectVideoSourceImages,
  createVideoProvider,
  KlingReplicateProvider,
  FalKlingProvider,
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

// ── buildFalProviderInput ───────────────────────────────────────────────────

describe("buildFalProviderInput", () => {
  const baseImages: OutfitSourceImage[] = [
    { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
    { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
    { url: "https://example.com/three-quarter.png", pose: "three-quarter", isUpscaled: false },
  ];

  it("uses start_image_url (not start_image) and string duration", () => {
    const input = buildFalProviderInput({
      sourceImages: baseImages,
      motionPrompt: "Slow camera orbit.",
      durationSeconds: 5,
    });

    expect(input).toMatchObject({
      start_image_url: "https://example.com/front.png",
      duration: "5",
      prompt: "Slow camera orbit.",
      generate_audio: false,
    });
    // Must NOT have Replicate-shaped keys
    expect(input).not.toHaveProperty("start_image");
    expect(input).not.toHaveProperty("aspect_ratio");
  });

  it("includes negative_prompt when provided", () => {
    const input = buildFalProviderInput({
      sourceImages: baseImages,
      motionPrompt: "Orbit.",
      negativePrompt: "blur, distort",
      durationSeconds: 5,
    });

    expect(input.negative_prompt).toBe("blur, distort");
  });

  it("omits negative_prompt when not provided", () => {
    const input = buildFalProviderInput({
      sourceImages: baseImages,
      motionPrompt: "Orbit.",
      durationSeconds: 5,
    });

    expect(input).not.toHaveProperty("negative_prompt");
  });

  it("selects hero image using same scoring as Replicate builder", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
      { url: "https://example.com/three-quarter-upscaled.png", pose: "three-quarter", isUpscaled: true },
    ];

    const input = buildFalProviderInput({
      sourceImages: images,
      motionPrompt: "Orbit.",
      durationSeconds: 5,
    });

    expect(input.start_image_url).toBe("https://example.com/three-quarter-upscaled.png");
  });

  it("does not include multi-reference fields (no omni support on fal)", () => {
    const input = buildFalProviderInput({
      sourceImages: baseImages,
      motionPrompt: "Orbit.",
      durationSeconds: 5,
    });

    expect(input).not.toHaveProperty("reference_images");
  });
});

// ── createVideoProvider factory ─────────────────────────────────────────────

describe("createVideoProvider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns KlingReplicateProvider by default (no env var)", () => {
    delete process.env.VIDEO_PROVIDER;
    const provider = createVideoProvider();
    expect(provider).toBeInstanceOf(KlingReplicateProvider);
  });

  it("returns FalKlingProvider when VIDEO_PROVIDER=fal", () => {
    process.env.VIDEO_PROVIDER = "fal";
    const provider = createVideoProvider();
    expect(provider).toBeInstanceOf(FalKlingProvider);
  });

  it("returns KlingReplicateProvider when VIDEO_PROVIDER=replicate", () => {
    process.env.VIDEO_PROVIDER = "replicate";
    const provider = createVideoProvider();
    expect(provider).toBeInstanceOf(KlingReplicateProvider);
  });

  it("respects explicit backend parameter over env var", () => {
    process.env.VIDEO_PROVIDER = "fal";
    const provider = createVideoProvider("replicate");
    expect(provider).toBeInstanceOf(KlingReplicateProvider);
  });
});
