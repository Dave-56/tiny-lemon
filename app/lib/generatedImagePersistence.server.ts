import { Prisma } from "@prisma/client";

export type GeneratedImageWrite = {
  shopId: string;
  outfitId: string;
  imageUrl: string;
  pose: string;
  styleId?: string | null;
};

type GeneratedImageCreateStore = {
  create: (args: { data: GeneratedImageWrite }) => Promise<unknown>;
  findFirst: (args: { where: { outfitId: string; pose: string } }) => Promise<unknown>;
};

type GeneratedImageUpdateStore = GeneratedImageCreateStore & {
  updateMany: (args: {
    where: { outfitId: string; pose: string };
    data: { imageUrl: string; styleId?: string | null };
  }) => Promise<{ count: number }>;
  deleteMany: (args: { where: { outfitId: string; pose?: { notIn: string[] } } }) => Promise<unknown>;
};

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
    await store.create({ data });
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
  const updated = await store.updateMany({
    where: { outfitId: data.outfitId, pose: data.pose },
    data: { imageUrl: data.imageUrl, styleId: data.styleId ?? null },
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
