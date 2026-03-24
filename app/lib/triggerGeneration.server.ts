import { readFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import prisma, { ensureShop } from "../db.server";
import { uploadBufferToBlob } from "../blob.server";
import { tasks } from "../trigger.server";
import {
  getMonthlyUsage,
  getEffectiveEntitlements,
  reserveGenerations,
  refundReservedGeneration,
  PLAN_LIMITS,
  DEMO_SHOP_ID,
} from "./billing.server";
import {
  claimGenerateRequestIdempotency,
  claimRegenerateRequestIdempotency,
  markRequestEnqueued,
  markRequestFailed,
  type OwnedRequestClaim,
} from "./requestIdempotency.server";

export type TriggerGenerationBody = {
  skuName?: string;
  modelId: string;
  modelImageUrl?: string;
  modelHeight?: string;
  modelGender?: string;
  styleId?: string;
  brandStyleId?: string;
  frontB64: string;
  frontMime?: string;
  backB64?: string | null;
  backMime?: string | null;
};

type ResolvedModel = {
  modelId: string;
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
};

type ReservationContext = {
  refundDescription: string;
  reservationDescription: string;
};

let presetModelsCache:
  | Array<{ id: string; imageUrl: string; height?: string; gender?: string }>
  | null = null;

function getPresetModels(): Array<{
  id: string;
  imageUrl: string;
  height?: string;
  gender?: string;
}> {
  if (presetModelsCache) return presetModelsCache;

  const presetPath = join(process.cwd(), "public", "preset-models.json");
  presetModelsCache = JSON.parse(readFileSync(presetPath, "utf-8")) as Array<{
    id: string;
    imageUrl: string;
    height?: string;
    gender?: string;
  }>;
  return presetModelsCache;
}

function isAllowedModelImageUrl(modelImageUrl: string): boolean {
  try {
    const u = new URL(modelImageUrl);
    return (
      u.hostname.endsWith("vercel-storage.com") ||
      u.hostname.endsWith(".vercel.app") ||
      u.hostname.endsWith(".blob.vercel-storage.com")
    );
  } catch {
    return false;
  }
}

function createReservationContext(flow: "generate" | "regenerate", referenceId: string): ReservationContext {
  const operationId = crypto.randomUUID();
  const prefix = `${flow}:${referenceId}:${operationId}`;
  return {
    reservationDescription: `generation reservation:${prefix}`,
    refundDescription: `generation refund:${prefix}:pre_enqueue_failure`,
  };
}

function createLimitReachedMessage(isBeta: boolean) {
  if (isBeta) {
    return "You've used your beta allocation for now. Contact us if you need more access.";
  }
  return "You've used all your generations this month. Upgrade to continue.";
}

function normalizeOptionalInput(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function digestBase64Payload(payload?: string | null): string | null {
  if (!payload) return null;
  return createHash("sha256").update(payload).digest("hex");
}

function buildGenerateRequestKey(body: {
  skuName?: string;
  modelId: string;
  styleId?: string;
  brandStyleId?: string;
  frontB64: string;
  frontMime?: string;
  backB64?: string | null;
  backMime?: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        skuName: normalizeOptionalInput(body.skuName) ?? "Untitled",
        modelId: body.modelId,
        styleId: normalizeOptionalInput(body.styleId) ?? "white-studio",
        brandStyleId: normalizeOptionalInput(body.brandStyleId) ?? "minimal",
        frontMime: normalizeOptionalInput(body.frontMime) ?? "image/png",
        backMime: normalizeOptionalInput(body.backMime),
        frontDigest: digestBase64Payload(body.frontB64),
        backDigest: digestBase64Payload(body.backB64),
      })
    )
    .digest("hex");
}

function buildRegenerateRequestKey(args: {
  outfitId: string;
  userDirection?: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        outfitId: args.outfitId,
        userDirection: normalizeOptionalInput(args.userDirection),
      })
    )
    .digest("hex");
}

async function resolveModelForGeneration(
  shopId: string,
  modelId: string
): Promise<ResolvedModel> {
  const dbModel = await prisma.model.findFirst({
    where: { id: modelId, shopId },
    select: { id: true, imageUrl: true, height: true, gender: true },
  });
  if (dbModel) {
    return {
      modelId: dbModel.id,
      modelImageUrl: dbModel.imageUrl,
      modelHeight: dbModel.height ?? undefined,
      modelGender: dbModel.gender ?? undefined,
    };
  }

  const preset = getPresetModels().find((entry) => entry.id === modelId);
  if (preset) {
    return {
      modelId: preset.id,
      modelImageUrl: preset.imageUrl,
      modelHeight: preset.height,
      modelGender: preset.gender,
    };
  }

  throw new Error("Model not found.");
}

/**
 * Runs trigger_generation logic. Call from route action (after authenticate.admin)
 * or from API route (after Bearer token validation). Always returns JSON Response.
 */
export async function handleTriggerGeneration(
  shopId: string,
  body: TriggerGenerationBody
): Promise<Response> {
  const skuName = body.skuName || "Untitled";
  const modelId = body.modelId;
  const styleId = body.styleId ?? "white-studio";
  const brandStyleId = body.brandStyleId ?? "minimal";
  const frontB64 = body.frontB64;
  const frontMime = body.frontMime ?? "image/png";
  const backB64 = body.backB64 ?? null;
  const backMime = body.backMime ?? null;
  const reservation = createReservationContext("generate", modelId);
  let idempotencyClaim: OwnedRequestClaim | null = null;
  let requestKey: string | null = null;
  let reservedCredit = false;
  let enqueueSucceeded = false;

  try {
    const resolvedModel = await resolveModelForGeneration(shopId, modelId);
    if (!isAllowedModelImageUrl(resolvedModel.modelImageUrl)) {
      return Response.json({ error: "Invalid model image URL" }, { status: 400 });
    }

    requestKey = buildGenerateRequestKey({
      skuName,
      modelId: resolvedModel.modelId,
      styleId,
      brandStyleId,
      frontB64,
      frontMime,
      backB64,
      backMime,
    });
    const claim = await claimGenerateRequestIdempotency({
      shopId,
      requestKey,
    });
    if (claim.disposition === "reused") {
      console.info("[trigger_generation.idempotent_reuse]", {
        shopId,
        outfitId: claim.outfitId,
        jobId: claim.jobId ?? undefined,
        status: claim.status,
      });
      return Response.json({
        outfitId: claim.outfitId,
        shopId,
        reused: true,
        jobId: claim.jobId ?? undefined,
      });
    }
    idempotencyClaim = claim;

    let entitlements;
    try {
      entitlements = await reserveGenerations(shopId, 1, {
        description: reservation.reservationDescription,
      });
      reservedCredit = true;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "insufficient_credits") {
        const [used, effectiveEntitlements] = await Promise.all([
          getMonthlyUsage(shopId),
          getEffectiveEntitlements(shopId),
        ]);
        return Response.json(
          {
            error: "limit_reached",
            used,
            limit: effectiveEntitlements.effectiveLimit,
            plan: effectiveEntitlements.publicPlan,
            isBeta: effectiveEntitlements.isBeta,
            message: createLimitReachedMessage(effectiveEntitlements.isBeta),
          },
          { status: 402 }
        );
      }
      return Response.json({ error: "try_again" }, { status: 503 });
    }

    await ensureShop(shopId);

    const brandStyleRecord = await prisma.brandStyle.findUnique({
      where: { shopId },
      select: { angleIds: true, pricePoint: true, brandEnergy: true, primaryCategory: true },
    });
    const effectiveAngleIds =
      brandStyleRecord?.angleIds?.length ?
        brandStyleRecord.angleIds
      : entitlements.effectiveAngles;
    let allowedPoses = [...entitlements.effectiveAngles].filter((p) =>
      effectiveAngleIds.includes(p)
    );
    if (shopId === DEMO_SHOP_ID) {
      allowedPoses = ["front"];
    }

    const outfit = await prisma.outfit.upsert({
      where: { id: idempotencyClaim.outfitId },
      create: {
        id: idempotencyClaim.outfitId,
        shopId,
        name: skuName,
        frontFlatLayUrl: "",
        modelId: resolvedModel.modelId,
        brandStyleId,
        status: "pending",
      } as import("@prisma/client").Prisma.OutfitUncheckedCreateInput,
      update: {
        name: skuName,
        frontFlatLayUrl: "",
        modelId: resolvedModel.modelId,
        brandStyleId,
        status: "pending",
        errorMessage: null,
      },
    });

    const frontExt = frontMime === "image/jpeg" ? "jpg" : "png";
    const rawFrontUrl = await uploadBufferToBlob(
      Buffer.from(frontB64, "base64"),
      `outfits/${shopId}/${outfit.id}/raw-front.${frontExt}`,
      frontMime
    );
    let rawBackUrl: string | undefined;
    if (backB64 && backMime) {
      const backExt = backMime === "image/jpeg" ? "jpg" : "png";
      rawBackUrl = await uploadBufferToBlob(
        Buffer.from(backB64, "base64"),
        `outfits/${shopId}/${outfit.id}/raw-back.${backExt}`,
        backMime
      );
    }

    const handle = await tasks.trigger("generate-outfit", {
      outfitId: outfit.id,
      shopId,
      rawFrontUrl,
      rawBackUrl,
      frontMime,
      backMime: backB64 && backMime ? backMime : undefined,
      modelImageUrl: resolvedModel.modelImageUrl,
      modelHeight: resolvedModel.modelHeight,
      modelGender: resolvedModel.modelGender,
      styleId,
      brandStyleId,
      pricePoint: brandStyleRecord?.pricePoint ?? undefined,
      brandEnergy: brandStyleRecord?.brandEnergy ?? undefined,
      primaryCategory: brandStyleRecord?.primaryCategory ?? undefined,
      allowedPoses,
    });
    enqueueSucceeded = true;
    const markedEnqueued = await markRequestEnqueued({
      shopId,
      operation: "generate",
      requestKey,
      runToken: idempotencyClaim.runToken,
      jobId: handle.id,
    });
    if (!markedEnqueued) {
      console.warn("[trigger_generation.idempotency_transition_lost]", {
        shopId,
        outfitId: outfit.id,
      });
    }
    console.info("[trigger_generation.fresh_enqueue]", {
      shopId,
      outfitId: outfit.id,
      jobId: handle.id,
      reused: false,
    });

    await prisma.outfit.update({
      where: { id: outfit.id },
      data: { jobId: handle.id },
    });

    return Response.json({ outfitId: outfit.id, shopId, reused: false, jobId: handle.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (idempotencyClaim && requestKey && !enqueueSucceeded) {
      await markRequestFailed({
        shopId,
        operation: "generate",
        requestKey,
        runToken: idempotencyClaim.runToken,
      }).catch(() => false);
    }
    if (reservedCredit && !enqueueSucceeded) {
      const refunded = await refundReservedGeneration(shopId, {
        reservationDescription: reservation.reservationDescription,
        refundDescription: reservation.refundDescription,
      }).catch(() => false);
      console.info("[trigger_generation.pre_enqueue_failure_refund]", {
        refunded,
        reason: "pre_enqueue_failure",
        shopId,
      });
    }
    if (message === "Model not found.") {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("[trigger_generation]", e);
    return Response.json(
      { error: message || "Server error" },
      { status: 500 }
    );
  }
}

/** Resolve model image URL and optional height/gender from DB or preset JSON. */
async function resolveModelForRegenerate(
  shopId: string,
  modelId: string
): Promise<{
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
}> {
  try {
    const model = await resolveModelForGeneration(shopId, modelId);
    return {
      modelImageUrl: model.modelImageUrl,
      modelHeight: model.modelHeight,
      modelGender: model.modelGender,
    };
  } catch {
    throw new Error("Model not found. Cannot regenerate.");
  }
}

/**
 * Regenerate an existing outfit: same inputs, optional user direction in prompt.
 * Outfit must be completed or failed and have cleanFlatLayUrl. Uses 1 credit.
 */
export async function handleRegenerateOutfit(
  shopId: string,
  outfitId: string,
  userDirection?: string
): Promise<Response> {
  const outfit = await prisma.outfit.findFirst({
    where: { id: outfitId, shopId },
    select: {
      status: true,
      cleanFlatLayUrl: true,
      modelId: true,
      brandStyleId: true,
    },
  });
  if (!outfit) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (outfit.status !== "completed" && outfit.status !== "failed") {
    return Response.json(
      { error: "Outfit is still generating. Wait for it to complete or fail." },
      { status: 400 }
    );
  }
  if (!outfit.cleanFlatLayUrl) {
    return Response.json(
      { error: "Outfit has no clean flat lay. Cannot regenerate." },
      { status: 400 }
    );
  }
  const reservation = createReservationContext("regenerate", outfitId);
  const normalizedUserDirection = normalizeOptionalInput(userDirection);
  let idempotencyClaim: OwnedRequestClaim | null = null;
  let requestKey: string | null = null;
  let reservedCredit = false;
  let enqueueSucceeded = false;

  try {
    const model = await resolveModelForRegenerate(shopId, outfit.modelId);
    if (!isAllowedModelImageUrl(model.modelImageUrl)) {
      return Response.json({ error: "Invalid model image URL" }, { status: 400 });
    }

    requestKey = buildRegenerateRequestKey({
      outfitId,
      userDirection: normalizedUserDirection,
    });
    const claim = await claimRegenerateRequestIdempotency({
      shopId,
      requestKey,
      outfitId,
    });
    if (claim.disposition === "reused") {
      console.info("[regenerate_outfit.idempotent_reuse]", {
        shopId,
        outfitId: claim.outfitId,
        jobId: claim.jobId ?? undefined,
        status: claim.status,
      });
      return Response.json({
        ok: true,
        outfitId: claim.outfitId,
        reused: true,
        jobId: claim.jobId ?? undefined,
      });
    }
    idempotencyClaim = claim;

    let entitlements;
    try {
      entitlements = await reserveGenerations(shopId, 1, {
        description: reservation.reservationDescription,
      });
      reservedCredit = true;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "insufficient_credits") {
        const [used, effectiveEntitlements] = await Promise.all([
          getMonthlyUsage(shopId),
          getEffectiveEntitlements(shopId),
        ]);
        return Response.json(
          {
            error: "limit_reached",
            used,
            limit: effectiveEntitlements.effectiveLimit,
            plan: effectiveEntitlements.publicPlan,
            isBeta: effectiveEntitlements.isBeta,
            message: createLimitReachedMessage(effectiveEntitlements.isBeta),
          },
          { status: 402 }
        );
      }
      return Response.json({ error: "try_again" }, { status: 503 });
    }

    const brandStyle = await prisma.brandStyle.findUnique({
      where: { shopId },
      select: { angleIds: true, pricePoint: true, brandEnergy: true, primaryCategory: true },
    });
    const styleId = "white-studio";
    const effectiveAngleIds =
      brandStyle?.angleIds?.length ?
        brandStyle.angleIds
      : entitlements.effectiveAngles;
    const allowedPoses = [...entitlements.effectiveAngles].filter((p) =>
      effectiveAngleIds.includes(p)
    );

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { status: "pending", errorMessage: null },
    });

    const handle = await tasks.trigger("regenerate-outfit", {
      outfitId,
      shopId,
      userDirection: normalizedUserDirection ?? undefined,
      modelImageUrl: model.modelImageUrl,
      modelHeight: model.modelHeight,
      modelGender: model.modelGender,
      styleId,
      pricePoint: brandStyle?.pricePoint ?? undefined,
      brandEnergy: brandStyle?.brandEnergy ?? undefined,
      primaryCategory: brandStyle?.primaryCategory ?? undefined,
      allowedPoses,
    });
    enqueueSucceeded = true;
    const markedEnqueued = await markRequestEnqueued({
      shopId,
      operation: "regenerate",
      requestKey,
      runToken: idempotencyClaim.runToken,
      jobId: handle.id,
    });
    if (!markedEnqueued) {
      console.warn("[regenerate_outfit.idempotency_transition_lost]", {
        shopId,
        outfitId,
      });
    }
    console.info("[regenerate_outfit.fresh_enqueue]", {
      shopId,
      outfitId,
      jobId: handle.id,
      reused: false,
    });

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { jobId: handle.id },
    });

    return Response.json({ ok: true, outfitId, reused: false, jobId: handle.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (idempotencyClaim && requestKey && !enqueueSucceeded) {
      await markRequestFailed({
        shopId,
        operation: "regenerate",
        requestKey,
        runToken: idempotencyClaim.runToken,
      }).catch(() => false);
    }
    if (reservedCredit && !enqueueSucceeded) {
      const refunded = await refundReservedGeneration(shopId, {
        reservationDescription: reservation.reservationDescription,
        refundDescription: reservation.refundDescription,
      }).catch(() => false);
      console.info("[regenerate_outfit.pre_enqueue_failure_refund]", {
        refunded,
        reason: "pre_enqueue_failure",
        outfitId,
        shopId,
      });
    }
    if (message === "Model not found. Cannot regenerate.") {
      return Response.json({ error: message }, { status: 400 });
    }
    console.error("[regenerate_outfit]", e);
    return Response.json(
      { error: message || "Server error" },
      { status: 500 }
    );
  }
}
