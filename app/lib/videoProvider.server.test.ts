import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  replicateRun: vi.fn(),
  waitFor: vi.fn(),
  consumeReplicatePredictionCreateSlot: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("replicate", () => ({
  default: vi.fn().mockImplementation(() => ({
    run: mocks.replicateRun,
  })),
}));

vi.mock("@trigger.dev/sdk", () => ({
  wait: {
    for: mocks.waitFor,
  },
}));

vi.mock("./replicatePredictionThrottle.server", () => ({
  consumeReplicatePredictionCreateSlot: mocks.consumeReplicatePredictionCreateSlot,
  getReplicatePredictionCreateWindowMs: () => 10_000,
  getReplicateThrottleRetryAfterMs: () => null,
}));

vi.mock("./observability.server", () => ({
  logServerEvent: mocks.logServerEvent,
}));

import {
  buildProviderInput,
  buildFalProviderInput,
  selectVideoSourceImages,
  getVideoDurationSeconds,
  isRetryableReplicateInterruptedPrediction,
  createVideoProvider,
  KlingReplicateProvider,
  FalKlingProvider,
  type OutfitSourceImage,
} from "./videoProvider.server";

const baseImages: OutfitSourceImage[] = [
  { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
  { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
  { url: "https://example.com/three-quarter.png", pose: "three-quarter", isUpscaled: false },
];

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
  mocks.consumeReplicatePredictionCreateSlot.mockResolvedValue({ allowed: true });
  mocks.waitFor.mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = originalEnv;
});

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

  it("keeps the front image as primary even when three-quarter is upscaled", () => {
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
      url: "https://example.com/front.png",
      pose: "front",
      isUpscaled: false,
    });
    expect(selection.orderedImages.map((image) => image.pose)).toEqual([
      "front",
      "three-quarter",
      "back",
    ]);
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
      "back",
      "detail",
    ]);
    expect(selection.hero.pose).toBe("front");
  });

  it("uses front as the Omni start/end frame by default without reference_images", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      {
        url: "https://example.com/three-quarter-upscaled.png",
        pose: "three-quarter",
        isUpscaled: true,
      },
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
    ];

    const input = buildProviderInput("kwaivgi/kling-v3-omni-video", {
      sourceImages: images,
      motionPrompt: "Subtle runway turn.",
      durationSeconds: 8,
    });

    expect(input).toMatchObject({
      start_image: "https://example.com/front.png",
      end_image: "https://example.com/front.png",
      duration: 8,
      mode: "standard",
      generate_audio: false,
    });
    expect(String(input.prompt)).toContain("Use start_image as the exact first front-facing frame");
    expect(String(input.prompt)).toContain("end_image as the exact final front-facing frame");
    expect(input).not.toHaveProperty("reference_images");
  });

  it("can use non-front Omni references when explicitly configured without end_image", () => {
    process.env.VIDEO_PROVIDER_OMNI_INPUT_MODE = "references";
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      {
        url: "https://example.com/three-quarter-upscaled.png",
        pose: "three-quarter",
        isUpscaled: true,
      },
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
    ];

    const input = buildProviderInput("kwaivgi/kling-v3-omni-video", {
      sourceImages: images,
      motionPrompt: "Subtle runway turn.",
      durationSeconds: 8,
    });

    expect(input).toMatchObject({
      start_image: "https://example.com/front.png",
      reference_images: [
        "https://example.com/three-quarter-upscaled.png",
        "https://example.com/back.png",
      ],
    });
    expect(input).not.toHaveProperty("end_image");
    expect(String(input.prompt)).toContain("<<<image_1>>> is the three-quarter view");
    expect(String(input.prompt)).toContain("<<<image_2>>> is the back view");
    expect(String(input.prompt)).not.toContain("<<<image_1>>> as the primary model");
    expect(input.reference_images).not.toContain("https://example.com/front.png");
  });

  it("omits reference_images in Omni mode when only the front source exists", () => {
    const input = buildProviderInput("kwaivgi/kling-v3-omni-video", {
      sourceImages: [
        { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      ],
      motionPrompt: "Subtle product turn.",
      durationSeconds: 8,
    });

    expect(input).toMatchObject({
      start_image: "https://example.com/front.png",
      end_image: "https://example.com/front.png",
    });
    expect(input).not.toHaveProperty("reference_images");
  });
});

describe("getVideoDurationSeconds", () => {
  it("defaults to 12 seconds", () => {
    expect(getVideoDurationSeconds("")).toBe(12);
  });

  it("clamps to the Kling supported range", () => {
    expect(getVideoDurationSeconds("1")).toBe(3);
    expect(getVideoDurationSeconds("30")).toBe(15);
  });

  it("uses valid integer env values", () => {
    expect(getVideoDurationSeconds("10")).toBe(10);
  });
});

describe("isRetryableReplicateInterruptedPrediction", () => {
  it("recognizes Replicate interrupted prediction errors", () => {
    expect(
      isRetryableReplicateInterruptedPrediction(
        new Error("Prediction failed: Prediction interrupted; please retry (code: PA)"),
      ),
    ).toBe(true);
  });

  it("does not treat arbitrary provider failures as retryable interruption", () => {
    expect(
      isRetryableReplicateInterruptedPrediction(
        new Error("Prediction failed: invalid input image"),
      ),
    ).toBe(false);
  });
});

describe("KlingReplicateProvider", () => {
  it("retries interrupted predictions before surfacing failure to the task", async () => {
    mocks.replicateRun
      .mockRejectedValueOnce(
        new Error("Prediction failed: Prediction interrupted; please retry (code: PA)"),
      )
      .mockResolvedValueOnce("https://replicate.example.com/video.mp4");

    const provider = new KlingReplicateProvider();
    const result = await provider.generate({
      sourceImages: baseImages,
      motionPrompt: "Slow turn.",
      durationSeconds: 8,
    });

    expect(result.videoUrl).toBe("https://replicate.example.com/video.mp4");
    expect(mocks.replicateRun).toHaveBeenCalledTimes(2);
    expect(mocks.waitFor).toHaveBeenCalledWith({ seconds: 5 });
    expect(mocks.logServerEvent).toHaveBeenCalledWith(
      "warn",
      "video.provider_interrupted_retry",
      expect.objectContaining({
        attempt: 1,
        retrySeconds: 5,
      }),
    );
  });
});

// ── buildFalProviderInput ───────────────────────────────────────────────────

describe("buildFalProviderInput", () => {
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

  it("selects hero image using same front-first policy as Replicate builder", () => {
    const images: OutfitSourceImage[] = [
      { url: "https://example.com/front.png", pose: "front", isUpscaled: false },
      { url: "https://example.com/back.png", pose: "back", isUpscaled: false },
      { url: "https://example.com/three-quarter-upscaled.png", pose: "three-quarter", isUpscaled: true },
    ];

    const input = buildFalProviderInput({
      sourceImages: images,
      motionPrompt: "Orbit.",
      durationSeconds: 5,
    });

    expect(input.start_image_url).toBe("https://example.com/front.png");
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
