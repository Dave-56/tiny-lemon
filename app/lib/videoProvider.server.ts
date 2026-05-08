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
const MAX_OMNI_REFERENCE_IMAGES = 7;
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

// ── Kling v3 via Replicate ──────────────────────────────────────────────────

const DEFAULT_KLING_MODEL =
  "kwaivgi/kling-v3-omni-video" as `${string}/${string}`;
const MAX_REPLICATE_VIDEO_RETRIES = 6;
const REPLICATE_INTERRUPTED_RETRY_DELAYS_SECONDS = [5, 10, 20];
const DEFAULT_VIDEO_DURATION_SECONDS = 12;
const MIN_VIDEO_DURATION_SECONDS = 3;
const MAX_VIDEO_DURATION_SECONDS = 15;

type VideoProviderMode = "single-image" | "multi-reference";
type OmniInputMode = "end-frame" | "references";
type ReplicateVideoMode = "standard" | "pro";

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

  const scoredImages = images.map(scoreSourceImage).sort((a, b) => {
    const rankDiff = a.poseRank - b.poseRank;
    if (rankDiff !== 0) return rankDiff;

    const upscaleDiff = b.upscaleBonus - a.upscaleBonus;
    if (upscaleDiff !== 0) return upscaleDiff;

    const scoreDiff = b.poseScore - a.poseScore;
    if (scoreDiff !== 0) return scoreDiff;

    return a.image.url.localeCompare(b.image.url);
  });

  return {
    hero: scoredImages[0]!.image,
    orderedImages: scoredImages.map((entry) => entry.image),
    scoredImages,
  };
}

function selectOmniReferenceImages(
  selection: VideoSourceSelection,
): OutfitSourceImage[] {
  return selection.orderedImages
    .filter((image) => image.url !== selection.hero.url)
    .slice(0, MAX_OMNI_REFERENCE_IMAGES);
}

function buildReferenceMapPrompt(referenceImages: OutfitSourceImage[]): string {
  if (referenceImages.length === 0) {
    return "";
  }

  const referenceMap = referenceImages
    .map((image, index) => `<<<image_${index + 1}>>> is the ${image.pose} view`)
    .join("; ");

  return `Reference map: ${referenceMap}. Use these references only to preserve identity, styling, garment details, and target body angles during interpolation.`;
}

export function getVideoDurationSeconds(
  rawValue = process.env.VIDEO_DURATION_SECONDS,
): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_VIDEO_DURATION_SECONDS;
  return Math.min(
    MAX_VIDEO_DURATION_SECONDS,
    Math.max(MIN_VIDEO_DURATION_SECONDS, parsed),
  );
}

function getReplicateVideoMode(): ReplicateVideoMode {
  return process.env.VIDEO_PROVIDER_MODE === "pro" ? "pro" : "standard";
}

function getOmniInputMode(): OmniInputMode {
  return process.env.VIDEO_PROVIDER_OMNI_INPUT_MODE === "references"
    ? "references"
    : "end-frame";
}

export function isRetryableReplicateInterruptedPrediction(
  error: unknown,
): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /prediction interrupted/i.test(message) ||
    /please retry/i.test(message) ||
    /code:\s*PA/i.test(message)
  );
}

function getInterruptedPredictionRetryDelaySeconds(attempt: number): number {
  return (
    REPLICATE_INTERRUPTED_RETRY_DELAYS_SECONDS[attempt - 1] ??
    REPLICATE_INTERRUPTED_RETRY_DELAYS_SECONDS[
      REPLICATE_INTERRUPTED_RETRY_DELAYS_SECONDS.length - 1
    ]!
  );
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
    mode: getReplicateVideoMode(),
    generate_audio: false,
  };

  if (input.negativePrompt) {
    providerInput.negative_prompt = input.negativePrompt;
  }

  if (mode === "multi-reference") {
    const referenceImages = selectOmniReferenceImages(selection);
    const omniInputMode = getOmniInputMode();

    if (omniInputMode === "references" && referenceImages.length > 0) {
      providerInput.reference_images = referenceImages.map((image) => image.url);
    } else {
      providerInput.end_image = selection.hero.url;
    }

    providerInput.prompt = [
      "Create a single continuous vertical fashion try-on clip.",
      omniInputMode === "references"
        ? "Use start_image as the exact first front-facing frame."
        : "Use start_image as the exact first front-facing frame and end_image as the exact final front-facing frame.",
      omniInputMode === "references" ? buildReferenceMapPrompt(referenceImages) : "",
      omniInputMode === "references" && referenceImages.length > 0
        ? "Do not cut between references; smoothly interpolate one uninterrupted same-direction body turn."
        : "",
      "Keep the camera locked, preserve the outfit exactly, and avoid adding accessories or changing the garment.",
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
        if (retryMs != null && attempt < MAX_REPLICATE_VIDEO_RETRIES) {
          logServerEvent("info", "video.provider_rate_limited", {
            retryMs,
            model: this.model,
            attempt,
          });
          await wait.for({ seconds: Math.ceil(retryMs / 1000) });
          continue;
        }

        if (
          isRetryableReplicateInterruptedPrediction(error) &&
          attempt < MAX_REPLICATE_VIDEO_RETRIES
        ) {
          const retrySeconds = getInterruptedPredictionRetryDelaySeconds(attempt);
          logServerEvent("warn", "video.provider_interrupted_retry", {
            retrySeconds,
            model: this.model,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
          await wait.for({ seconds: retrySeconds });
          continue;
        }

        throw error;
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

// ── Kling v3 via fal.ai (single-image mode) ────────────────────────────────

const FAL_KLING_V3_STANDARD = "fal-ai/kling-video/v3/standard/image-to-video";
const FAL_KLING_V3_PRO = "fal-ai/kling-video/v3/pro/image-to-video";

type FalKlingTier = "standard" | "pro";

function getFalModelId(tier: FalKlingTier): string {
  return tier === "pro" ? FAL_KLING_V3_PRO : FAL_KLING_V3_STANDARD;
}

export function buildFalProviderInput(
  input: VideoProviderInput,
): Record<string, unknown> {
  const selection = selectVideoSourceImages(input.sourceImages);

  const providerInput: Record<string, unknown> = {
    prompt: input.motionPrompt,
    start_image_url: selection.hero.url,
    duration: String(input.durationSeconds),
    generate_audio: false,
  };

  if (input.negativePrompt) {
    providerInput.negative_prompt = input.negativePrompt;
  }

  return providerInput;
}

export class FalKlingProvider implements VideoProvider {
  private tier: FalKlingTier;
  private modelId: string;

  constructor() {
    const tierEnv = process.env.FAL_KLING_TIER?.toLowerCase();
    this.tier = tierEnv === "pro" ? "pro" : "standard";
    this.modelId = getFalModelId(this.tier);
  }

  async generate(input: VideoProviderInput): Promise<VideoProviderResult> {
    // Dynamic import — @fal-ai/client reads FAL_KEY from env automatically
    const { fal } = await import("@fal-ai/client");

    const selection = selectVideoSourceImages(input.sourceImages);

    logServerEvent("info", "video.provider_started", {
      provider: "fal",
      model: this.modelId,
      tier: this.tier,
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

    const providerInput = buildFalProviderInput(input);

    const result = await fal.subscribe(this.modelId, {
      input: providerInput,
    });

    const videoUrl = result.data?.video?.url;
    if (!videoUrl || typeof videoUrl !== "string" || !videoUrl.startsWith("http")) {
      throw new Error(
        `Unexpected fal video output: ${JSON.stringify(result.data).slice(0, 200)}`,
      );
    }

    const providerJobId = result.requestId ?? `fal-${this.modelId}`;

    logServerEvent("info", "video.provider_success", {
      provider: "fal",
      model: this.modelId,
      tier: this.tier,
      heroImagePose: selection.hero.pose,
      providerJobId,
    });

    return { videoUrl, providerJobId };
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

export type VideoProviderBackend = "fal" | "replicate";

export function createVideoProvider(
  backend?: VideoProviderBackend,
): VideoProvider {
  const resolved =
    backend ?? (process.env.VIDEO_PROVIDER as VideoProviderBackend | undefined) ?? "replicate";

  if (resolved === "replicate") {
    return new KlingReplicateProvider();
  }
  return new FalKlingProvider();
}
