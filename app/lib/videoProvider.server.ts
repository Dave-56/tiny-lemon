import Replicate from "replicate";
import { wait } from "@trigger.dev/sdk";
import { logServerEvent } from "./observability.server";
import {
  consumeReplicatePredictionCreateSlot,
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

    logServerEvent("info", "video.provider_started", {
      model: this.model,
      heroImagePose: hero.pose,
      heroIsUpscaled: hero.isUpscaled,
      sourceImageCount: input.sourceImages.length,
    });

    // Throttle: wait for a Replicate prediction slot
    const slot = await consumeReplicatePredictionCreateSlot();
    if (!slot.allowed) {
      const retryMs = slot.retryAfterMs ?? 10_000;
      logServerEvent("info", "video.provider_throttled", { retryMs });
      await wait.for({ seconds: Math.ceil(retryMs / 1000) });
    }

    const providerInput: Record<string, unknown> = {
      prompt: input.motionPrompt,
      start_image: hero.url,
      duration: input.durationSeconds,
      aspect_ratio: "2:3",
    };

    if (input.negativePrompt) {
      providerInput.negative_prompt = input.negativePrompt;
    }

    let output: unknown;
    try {
      output = await this.replicate.run(this.model, { input: providerInput });
    } catch (error) {
      const retryMs = getReplicateThrottleRetryAfterMs(error);
      if (retryMs != null) {
        logServerEvent("info", "video.provider_rate_limited", {
          retryMs,
          model: this.model,
        });
        await wait.for({ seconds: Math.ceil(retryMs / 1000) });
        output = await this.replicate.run(this.model, {
          input: providerInput,
        });
      } else {
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
