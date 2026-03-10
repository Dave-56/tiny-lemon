import { readFileSync } from "fs";
import { join } from "path";
import prisma, { ensureShop } from "../db.server";
import { uploadBufferToBlob } from "../blob.server";
import { tasks } from "../trigger.server";
import {
  getPlanForShop,
  getMonthlyUsage,
  reserveGenerations,
  PLAN_LIMITS,
  PLAN_ANGLES,
  DEMO_SHOP_ID,
} from "./billing.server";

export type TriggerGenerationBody = {
  skuName?: string;
  modelId: string;
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
  styleId?: string;
  stylingDirectionId?: string;
  frontB64: string;
  frontMime?: string;
  backB64?: string | null;
  backMime?: string | null;
};

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
  const modelImageUrl = body.modelImageUrl;
  const modelHeight = body.modelHeight;
  const modelGender = body.modelGender;
  const styleId = body.styleId ?? "white-studio";
  const stylingDirectionId = body.stylingDirectionId ?? "minimal";
  const frontB64 = body.frontB64;
  const frontMime = body.frontMime ?? "image/png";
  const backB64 = body.backB64 ?? null;
  const backMime = body.backMime ?? null;

  let plan: string;
  try {
    plan = await reserveGenerations(shopId, 1);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_credits") {
      const [used, limitPlan] = await Promise.all([
        getMonthlyUsage(shopId),
        getPlanForShop(shopId),
      ]);
      return Response.json(
        {
          error: "limit_reached",
          used,
          limit: PLAN_LIMITS[limitPlan] ?? PLAN_LIMITS.free,
          plan: limitPlan,
        },
        { status: 402 }
      );
    }
    return Response.json({ error: "try_again" }, { status: 503 });
  }

  try {
    const u = new URL(modelImageUrl);
    if (
      !u.hostname.endsWith("vercel-storage.com") &&
      !u.hostname.endsWith(".vercel.app") &&
      !u.hostname.endsWith(".blob.vercel-storage.com")
    ) {
      return Response.json({ error: "Invalid model image URL" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Invalid model image URL" }, { status: 400 });
  }

  try {
    await ensureShop(shopId);

    const brandStyleRecord = await prisma.brandStyle.findUnique({
      where: { shopId },
      select: { angleIds: true },
    });
    const effectiveAngleIds =
      brandStyleRecord?.angleIds?.length ?
        brandStyleRecord.angleIds
      : PLAN_ANGLES[plan] ?? PLAN_ANGLES.free;
    let allowedPoses = (PLAN_ANGLES[plan] ?? PLAN_ANGLES.free).filter((p) =>
      effectiveAngleIds.includes(p)
    );
    if (shopId === DEMO_SHOP_ID) {
      allowedPoses = ["front"];
    }

    const outfit = await prisma.outfit.create({
      data: {
        shopId,
        name: skuName,
        frontFlatLayUrl: "",
        modelId,
        stylingDirectionId,
        status: "pending",
      } as import("@prisma/client").Prisma.OutfitUncheckedCreateInput,
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
      modelImageUrl,
      modelHeight,
      modelGender,
      styleId,
      stylingDirectionId,
      allowedPoses,
    });

    await prisma.outfit.update({
      where: { id: outfit.id },
      data: { jobId: handle.id },
    });

    return Response.json({ outfitId: outfit.id, shopId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[trigger_generation]", e);
    return Response.json(
      { error: message || "Server error" },
      { status: 500 }
    );
  }
}

/** Resolve model image URL and optional height/gender from DB or preset JSON. */
async function resolveModelForRegenerate(modelId: string): Promise<{
  modelImageUrl: string;
  modelHeight?: string;
  modelGender?: string;
}> {
  const dbModel = await prisma.model.findUnique({
    where: { id: modelId },
    select: { imageUrl: true, height: true, gender: true },
  });
  if (dbModel) {
    return {
      modelImageUrl: dbModel.imageUrl,
      modelHeight: dbModel.height ?? undefined,
      modelGender: dbModel.gender ?? undefined,
    };
  }
  try {
    const presetPath = join(process.cwd(), "public", "preset-models.json");
    const presets = JSON.parse(readFileSync(presetPath, "utf-8")) as Array<{
      id: string;
      imageUrl: string;
      height?: string;
      gender?: string;
    }>;
    const preset = presets.find((p) => p.id === modelId);
    if (preset) {
      return {
        modelImageUrl: preset.imageUrl,
        modelHeight: preset.height,
        modelGender: preset.gender,
      };
    }
  } catch {
    // ignore
  }
  throw new Error("Model not found. Cannot regenerate.");
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
      stylingDirectionId: true,
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

  let plan: string;
  try {
    plan = await reserveGenerations(shopId, 1);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_credits") {
      const [used, limitPlan] = await Promise.all([
        getMonthlyUsage(shopId),
        getPlanForShop(shopId),
      ]);
      return Response.json(
        {
          error: "limit_reached",
          used,
          limit: PLAN_LIMITS[limitPlan] ?? PLAN_LIMITS.free,
          plan: limitPlan,
        },
        { status: 402 }
      );
    }
    return Response.json({ error: "try_again" }, { status: 503 });
  }

  try {
    const model = await resolveModelForRegenerate(outfit.modelId);
    const brandStyle = await prisma.brandStyle.findUnique({
      where: { shopId },
      select: { styleIds: true, angleIds: true },
    });
    const styleId =
      brandStyle?.styleIds?.length ?
        brandStyle.styleIds[0]
      : "white-studio";
    const effectiveAngleIds =
      brandStyle?.angleIds?.length ?
        brandStyle.angleIds
      : PLAN_ANGLES[plan] ?? PLAN_ANGLES.free;
    const allowedPoses = (PLAN_ANGLES[plan] ?? PLAN_ANGLES.free).filter((p) =>
      effectiveAngleIds.includes(p)
    );

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { status: "pending", errorMessage: null },
    });

    const handle = await tasks.trigger("regenerate-outfit", {
      outfitId,
      shopId,
      userDirection: userDirection?.trim() || undefined,
      modelImageUrl: model.modelImageUrl,
      modelHeight: model.modelHeight,
      modelGender: model.modelGender,
      styleId,
      allowedPoses,
    });

    await prisma.outfit.update({
      where: { id: outfitId, shopId },
      data: { jobId: handle.id },
    });

    return Response.json({ ok: true, outfitId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[regenerate_outfit]", e);
    return Response.json(
      { error: message || "Server error" },
      { status: 500 }
    );
  }
}
