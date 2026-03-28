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

const PREFERRED_POSE_ORDER = ["front", "three-quarter", "back"];
type SupportedVideoAspectRatio = "16:9" | "9:16" | "1:1";

/**
 * Pick the single best hero image for single-image providers.
 * Prefers front > three-quarter > back, and upscaled variants over originals.
 */
function pickHeroImage(images: OutfitSourceImage[]): OutfitSourceImage {
  const sorted = [...images].sort((a, b) => {
    const aIdx = PREFERRED_POSE_ORDER.indexOf(a.pose);
    const bIdx = PREFERRED_POSE_ORDER.indexOf(b.pose);
    const poseDiff =
      (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    if (poseDiff !== 0) return poseDiff;
    // Prefer upscaled
    return (b.isUpscaled ? 1 : 0) - (a.isUpscaled ? 1 : 0);
  });
  return sorted[0];
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

function sortSourceImages(images: OutfitSourceImage[]): OutfitSourceImage[] {
  return [...images].sort((a, b) => {
    const aIdx = PREFERRED_POSE_ORDER.indexOf(a.pose);
    const bIdx = PREFERRED_POSE_ORDER.indexOf(b.pose);
    const poseDiff = (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    if (poseDiff !== 0) return poseDiff;
    return (b.isUpscaled ? 1 : 0) - (a.isUpscaled ? 1 : 0);
  });
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
  const orderedImages = sortSourceImages(input.sourceImages);
  const hero = pickHeroImage(orderedImages);
  const mode = getProviderMode(model);

  const providerInput: Record<string, unknown> = {
    prompt: input.motionPrompt,
    start_image: hero.url,
    duration: input.durationSeconds,
    aspect_ratio: getSupportedAspectRatio(),
  };

  if (input.negativePrompt) {
    providerInput.negative_prompt = input.negativePrompt;
  }

  if (mode === "multi-reference") {
    providerInput.reference_images = orderedImages.map((image) => image.url);
    providerInput.prompt = [
      "Use <<<image_1>>> as the primary subject reference and maintain the same garment and identity.",
      orderedImages.length > 1
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
    const hero = pickHeroImage(input.sourceImages);
    const mode = getProviderMode(this.model);

    logServerEvent("info", "video.provider_started", {
      model: this.model,
      mode,
      heroImagePose: hero.pose,
      heroIsUpscaled: hero.isUpscaled,
      sourceImageCount: input.sourceImages.length,
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
      heroImagePose: hero.pose,
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
