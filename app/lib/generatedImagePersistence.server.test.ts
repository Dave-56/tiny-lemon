import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import {
  createGeneratedImageOrReuse,
  deleteGeneratedImagesNotInPoses,
  upsertGeneratedImageByPose,
} from "./generatedImagePersistence.server";

function uniqueConflictError() {
  return new Prisma.PrismaClientKnownRequestError("duplicate", {
    code: "P2002",
    clientVersion: "test",
  });
}

describe("generatedImagePersistence", () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const deleteMany = vi.fn();
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing pose row when create hits a uniqueness conflict", async () => {
    create.mockRejectedValueOnce(uniqueConflictError());
    findFirst.mockResolvedValueOnce({ id: "existing-row" });

    const result = await createGeneratedImageOrReuse(
      { create, findFirst },
      {
        shopId: "shop-a",
        outfitId: "outfit-1",
        imageUrl: "https://blob.example/front.png",
        pose: "front",
        styleId: "minimal",
      },
      "generate-outfit",
    );

    expect(result).toBe("reused");
    expect(findFirst).toHaveBeenCalledWith({
      where: { outfitId: "outfit-1", pose: "front" },
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[generated_image.unique_conflict]",
      expect.objectContaining({
        context: "generate-outfit",
        action: "reused",
        outfitId: "outfit-1",
        pose: "front",
      }),
    );
  });

  it("updates an existing pose in place during regenerate", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await upsertGeneratedImageByPose(
      { create, findFirst, updateMany, deleteMany },
      {
        shopId: "shop-a",
        outfitId: "outfit-1",
        imageUrl: "https://blob.example/front-new.png",
        pose: "front",
        styleId: "minimal",
      },
      "regenerate-outfit",
    );

    expect(result).toBe("updated");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a new pose during regenerate when no row exists", async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    create.mockResolvedValueOnce({ id: "new-row" });

    const result = await upsertGeneratedImageByPose(
      { create, findFirst, updateMany, deleteMany },
      {
        shopId: "shop-a",
        outfitId: "outfit-1",
        imageUrl: "https://blob.example/back.png",
        pose: "back",
        styleId: "minimal",
      },
      "regenerate-outfit",
    );

    expect(result).toBe("created");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("deletes stale generated images outside the keep list", async () => {
    deleteMany.mockResolvedValueOnce({});

    await deleteGeneratedImagesNotInPoses(
      { deleteMany },
      "outfit-1",
      ["front", "three-quarter"],
    );

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        outfitId: "outfit-1",
        pose: { notIn: ["front", "three-quarter"] },
      },
    });
  });
});
