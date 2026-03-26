import { Prisma } from "@prisma/client";

import type { PoseImageAssetManifest } from "./imageAssetManifest";
import { cancelRunSafely } from "./triggerJobs.server";

export type GeneratedImageWrite = {
  shopId: string;
  outfitId: string;
  imageUrl: string;
  assetManifest?: PoseImageAssetManifest | null;
  pose: string;
  styleId?: string | null;
};

type GeneratedImageDbWrite = Omit<GeneratedImageWrite, "assetManifest"> & {
  assetManifest?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

type GeneratedImageCreateStore = {
  create: (args: { data: GeneratedImageDbWrite }) => Promise<unknown>;
  findFirst: (args: { where: { outfitId: string; pose: string } }) => Promise<{ upscaleStatus?: string | null; upscaleJobId?: string | null } | null>;
};

type GeneratedImageUpdateStore = GeneratedImageCreateStore & {
  updateMany: (args: {
    where: { outfitId: string; pose: string };
    data: {
      imageUrl: string;
      assetManifest?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
      styleId?: string | null;
      upscaleStatus?: string | null;
      upscaleJobId?: string | null;
      upscaledAt?: Date | null;
    };
  }) => Promise<{ count: number }>;
  deleteMany: (args: { where: { outfitId: string; pose?: { notIn: string[] } } }) => Promise<unknown>;
};

function toJsonInput(manifest: PoseImageAssetManifest | null | undefined) {
  if (manifest === undefined) return undefined;
  if (manifest === null) return Prisma.JsonNull;
  return manifest as unknown as Prisma.InputJsonValue;
}

function toDbWrite(data: GeneratedImageWrite): GeneratedImageDbWrite {
  return {
    ...data,
    assetManifest: toJsonInput(data.assetManifest),
  };
}

function isUniquePoseConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function logConflict(event: string, data: Record<string, unknown>) {
  console.info(event, data);
}

export async function createGeneratedImageOrReuse(
  store: GeneratedImageCreateStore,
  data: GeneratedImageWrite,
  context: string,
): Promise<"created" | "reused"> {
  try {
    await store.create({ data: toDbWrite(data) });
    return "created";
  } catch (error) {
    if (!isUniquePoseConflict(error)) {
      throw error;
    }

    const existing = await store.findFirst({
      where: { outfitId: data.outfitId, pose: data.pose },
    });
    if (!existing) {
      throw error;
    }

    logConflict("[generated_image.unique_conflict]", {
      context,
      action: "reused",
      outfitId: data.outfitId,
      pose: data.pose,
    });
    return "reused";
  }
}

export async function upsertGeneratedImageByPose(
  store: GeneratedImageUpdateStore,
  data: GeneratedImageWrite,
  context: string,
): Promise<"updated" | "created" | "reused"> {
  // Cancel in-flight upscale job before overwriting the image
  const existingImage = await store.findFirst({
    where: { outfitId: data.outfitId, pose: data.pose },
  });
  if (
    existingImage?.upscaleJobId &&
    (existingImage.upscaleStatus === "pending" || existingImage.upscaleStatus === "processing")
  ) {
    await cancelRunSafely(existingImage.upscaleJobId);
  }

  // Strip the upscaled block from the new manifest (fresh generation has no upscale)
  let manifestToWrite = data.assetManifest;
  if (manifestToWrite?.upscaled) {
    const { upscaled: _, ...rest } = manifestToWrite;
    manifestToWrite = rest as PoseImageAssetManifest;
  }

  const updated = await store.updateMany({
    where: { outfitId: data.outfitId, pose: data.pose },
    data: {
      imageUrl: data.imageUrl,
      assetManifest: toJsonInput(manifestToWrite),
      styleId: data.styleId ?? null,
      upscaleStatus: null,
      upscaleJobId: null,
      upscaledAt: null,
    },
  });
  if (updated.count > 0) {
    return "updated";
  }

  const created = await createGeneratedImageOrReuse(store, data, context);
  return created;
}

export async function deleteGeneratedImagesNotInPoses(
  store: Pick<GeneratedImageUpdateStore, "deleteMany">,
  outfitId: string,
  posesToKeep: string[],
): Promise<void> {
  await store.deleteMany({
    where: {
      outfitId,
      pose: { notIn: posesToKeep },
    },
  });
}
