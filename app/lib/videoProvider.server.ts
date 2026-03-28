import Replicate from "replicate";
import { wait } from "@trigger.dev/sdk";
import { logServerEvent } from "./observability.server";
import {
  consumeReplicatePredictionCreateSlot,
  getReplicatePredictionCreateWindowMs,
  getReplicateThrottleRetryAfterMs,
} from "./replicatePredictionThrottle.server";

// ── Types ────────────────────────────────────────────────────────────────────

export interface OutfitSourceImage {
  url: string;
  pose: string; // front | three-quarter | back
  isUpscaled: boolean;
}

export interface VideoProviderInput {
  sourceImages: OutfitSourceImage[];
  motionPrompt: string;
  negativePrompt?: string;
  durationSeconds: number;
}

export interface VideoProviderResult {
  videoUrl: string; // downloadable URL from provider
  providerJobId: string;
}

export interface VideoProvider {
  generate(input: VideoProviderInput): Promise<VideoProviderResult>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PREFERRED_POSE_ORDER = ["front", "three-quarter", "back"] as const;
type SupportedVideoAspectRatio = "16:9" | "9:16" | "1:1";
const UNKNOWN_POSE_INDEX = PREFERRED_POSE_ORDER.length;

const POSE_SCORE: Record<string, number> = {
  front: 24,
  "three-quarter": 24,
  back: 8,
};
const UPSCALE_SCORE_BONUS = 12;

export interface ScoredVideoSourceImage {
  image: OutfitSourceImage;
  poseScore: number;
  upscaleBonus: number;
  totalScore: number;
  poseRank: number;
}

export interface VideoSourceSelection {
  hero: OutfitSourceImage;
  orderedImages: OutfitSourceImage[];
  scoredImages: ScoredVideoSourceImage[];
}

// ── Kling v3 via Replicate (single-image mode) ──────────────────────────────

const DEFAULT_KLING_MODEL =
  "kwaivgi/kling-v3-video" as `${string}/${string}`;
const MAX_REPLICATE_VIDEO_RETRIES = 6;

type VideoProviderMode = "single-image" | "multi-reference";

function getProviderMode(model: `${string}/${string}`): VideoProviderMode {
  if (model.includes("omni")) {
    return "multi-reference";
  }
  return "single-image";
}

function getPoseRank(pose: string): number {
  const idx = PREFERRED_POSE_ORDER.indexOf(
    pose as (typeof PREFERRED_POSE_ORDER)[number],
  );
  return idx === -1 ? UNKNOWN_POSE_INDEX : idx;
}

function scoreSourceImage(image: OutfitSourceImage): ScoredVideoSourceImage {
  const poseScore = POSE_SCORE[image.pose] ?? 0;
  const upscaleBonus = image.isUpscaled ? UPSCALE_SCORE_BONUS : 0;

  return {
    image,
    poseScore,
    upscaleBonus,
    totalScore: poseScore + upscaleBonus,
    poseRank: getPoseRank(image.pose),
  };
}

export function selectVideoSourceImages(
  images: OutfitSourceImage[],
): VideoSourceSelection {
  if (images.length === 0) {
    throw new Error("selectVideoSourceImages requires at least one source image");
  }

  const scoredImages = images
    .map(scoreSourceImage)
    .sort((a, b) => {
      const scoreDiff = b.totalScore - a.totalScore;
      if (scoreDiff !== 0) return scoreDiff;

      const rankDiff = a.poseRank - b.poseRank;
      if (rankDiff !== 0) return rankDiff;

      return a.image.url.localeCompare(b.image.url);
    });

  return {
    hero: scoredImages[0]!.image,
    orderedImages: scoredImages.map((entry) => entry.image),
    scoredImages,
  };
}

async function waitForReplicatePredictionSlot(model: `${string}/${string}`) {
  while (true) {
    const slot = await consumeReplicatePredictionCreateSlot();
    if (slot.allowed) {
      return;
    }

    const retryMs = Math.max(
      1000,
      slot.retryAfterMs ?? getReplicatePredictionCreateWindowMs(),
    );
    logServerEvent("info", "video.provider_throttled", { retryMs, model });
    await wait.for({ seconds: Math.ceil(retryMs / 1000) });
  }
}

function getSupportedAspectRatio(): SupportedVideoAspectRatio {
  // Outfit source renders are portrait (roughly 2:3), and Kling only accepts
  // 16:9, 9:16, or 1:1. 9:16 is the closest supported fit for fashion clips.
  return "9:16";
}

export function buildProviderInput(
  model: `${string}/${string}`,
  input: VideoProviderInput,
): Record<string, unknown> {
  const selection = selectVideoSourceImages(input.sourceImages);
  const mode = getProviderMode(model);

  const providerInput: Record<string, unknown> = {
    prompt: input.motionPrompt,
    start_image: selection.hero.url,
    duration: input.durationSeconds,
    aspect_ratio: getSupportedAspectRatio(),
  };

  if (input.negativePrompt) {
    providerInput.negative_prompt = input.negativePrompt;
  }

  if (mode === "multi-reference") {
    providerInput.reference_images = selection.orderedImages.map((image) => image.url);
    providerInput.prompt = [
      "Use <<<image_1>>> as the primary subject reference and maintain the same garment and identity.",
      selection.orderedImages.length > 1
        ? "Use the remaining reference images for consistency of silhouette, styling, and garment details."
        : "",
      input.motionPrompt,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return providerInput;
}

export class KlingReplicateProvider implements VideoProvider {
  private replicate: Replicate;
  private model: `${string}/${string}`;

  constructor() {
    this.replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
    this.model =
      (process.env.VIDEO_PROVIDER_MODEL as `${string}/${string}`) ??
      DEFAULT_KLING_MODEL;
  }

  async generate(input: VideoProviderInput): Promise<VideoProviderResult> {
    const selection = selectVideoSourceImages(input.sourceImages);
    const mode = getProviderMode(this.model);

    logServerEvent("info", "video.provider_started", {
      model: this.model,
      mode,
      heroImagePose: selection.hero.pose,
      heroIsUpscaled: selection.hero.isUpscaled,
      sourceImageCount: input.sourceImages.length,
      orderedPoses: selection.orderedImages.map((image) => image.pose),
      scoreBreakdown: selection.scoredImages.map((entry) => ({
        pose: entry.image.pose,
        isUpscaled: entry.image.isUpscaled,
        poseScore: entry.poseScore,
        upscaleBonus: entry.upscaleBonus,
        totalScore: entry.totalScore,
      })),
    });

    const providerInput = buildProviderInput(this.model, input);

    let output: unknown = null;
    for (let attempt = 1; attempt <= MAX_REPLICATE_VIDEO_RETRIES; attempt += 1) {
      await waitForReplicatePredictionSlot(this.model);

      try {
        output = await this.replicate.run(this.model, { input: providerInput });
        break;
      } catch (error) {
        const retryMs = getReplicateThrottleRetryAfterMs(error);
        if (retryMs == null || attempt === MAX_REPLICATE_VIDEO_RETRIES) {
          throw error;
        }

        logServerEvent("info", "video.provider_rate_limited", {
          retryMs,
          model: this.model,
          attempt,
        });
        await wait.for({ seconds: Math.ceil(retryMs / 1000) });
      }
    }

    // Kling on Replicate returns a URL string to the generated video
    const videoUrl = typeof output === "string" ? output : String(output);
    if (!videoUrl || !videoUrl.startsWith("http")) {
      throw new Error(
        `Unexpected video provider output: ${JSON.stringify(output).slice(0, 200)}`,
      );
    }

    logServerEvent("info", "video.provider_success", {
      model: this.model,
      heroImagePose: selection.hero.pose,
    });

    return {
      videoUrl,
      providerJobId: `replicate-${this.model}`,
    };
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createVideoProvider(): VideoProvider {
  return new KlingReplicateProvider();
}
