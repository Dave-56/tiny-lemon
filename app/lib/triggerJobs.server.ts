import { runs, tasks } from "../trigger.server";
import { logServerEvent } from "./observability.server";

type GenerateOutfitTriggerPayload = {
  outfitId: string;
  shopId: string;
  rawFrontUrl: string;
  rawBackUrl?: string;
  frontMime?: string;
  backMime?: string;
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
  styleId: string;
  brandStyleId: string;
  pricePoint?: string;
  brandEnergy?: string;
  primaryCategory?: string;
  allowedPoses: string[];
};

type RegenerateOutfitTriggerPayload = {
  outfitId: string;
  shopId: string;
  userDirection?: string;
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
  styleId: string;
  pricePoint?: string;
  brandEnergy?: string;
  primaryCategory?: string;
  allowedPoses: string[];
};

type SyncOutfitToShopifyTriggerPayload = {
  outfitId: string;
  shopId: string;
  shopifyProductId?: string;
};

type UpscaleImageTriggerPayload = {
  generatedImageId: string;
  shopId: string;
  targetScale: 2 | 4;
};

type BulkUpscaleImagesTriggerPayload = {
  outfitId: string;
  shopId: string;
  targetScale: 2 | 4;
};

type GenerateVideoTriggerPayload = {
  outfitId: string;
  shopId: string;
  brandStyleId: string;
};

async function triggerTaskWithLog<TPayload extends { shopId: string }>(
  taskId:
    | "generate-outfit"
    | "regenerate-outfit"
    | "sync-outfit-to-shopify"
    | "upscale-image"
    | "bulk-upscale-images"
    | "generate-video",
  payload: TPayload,
) {
  const handle = await tasks.trigger(taskId, payload);
  logServerEvent("info", "trigger_job.enqueued", {
    taskId,
    shopId: payload.shopId,
    jobId: handle.id,
    ...("outfitId" in payload ? { outfitId: (payload as any).outfitId } : {}),
    ...("generatedImageId" in payload ? { generatedImageId: (payload as any).generatedImageId } : {}),
  });
  return handle;
}

export function enqueueGenerateOutfit(payload: GenerateOutfitTriggerPayload) {
  return triggerTaskWithLog("generate-outfit", payload);
}

export function enqueueRegenerateOutfit(payload: RegenerateOutfitTriggerPayload) {
  return triggerTaskWithLog("regenerate-outfit", payload);
}

export function enqueueShopifySync(payload: SyncOutfitToShopifyTriggerPayload) {
  return triggerTaskWithLog("sync-outfit-to-shopify", payload);
}

export function enqueueUpscaleImage(payload: UpscaleImageTriggerPayload) {
  return triggerTaskWithLog("upscale-image", payload);
}

export function enqueueBulkUpscaleImages(payload: BulkUpscaleImagesTriggerPayload) {
  return triggerTaskWithLog("bulk-upscale-images", payload);
}

export function enqueueGenerateVideo(payload: GenerateVideoTriggerPayload) {
  return triggerTaskWithLog("generate-video", payload);
}

export async function cancelRunSafely(runId: string) {
  try {
    await runs.cancel(runId);
    logServerEvent("info", "trigger_job.cancelled", { jobId: runId });
  } catch {
    logServerEvent("info", "trigger_job.cancel_noop", { jobId: runId });
  }
}
