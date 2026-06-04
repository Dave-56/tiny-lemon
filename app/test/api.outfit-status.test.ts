import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outfitFindFirst: vi.fn(),
  outfitUpdate: vi.fn(),
  cancelRunSafely: vi.fn(),
}));

vi.mock("../db.server", () => ({
  default: {
    outfit: {
      findFirst: mocks.outfitFindFirst,
      update: mocks.outfitUpdate,
    },
  },
}));

vi.mock("../lib/triggerJobs.server", () => ({
  cancelRunSafely: mocks.cancelRunSafely,
}));

import { loader } from "../routes/api.outfit-status.$outfitId";

function makeRequest(path = "https://example.com/api/outfit-status/outfit-123") {
  return new Request(path);
}

describe("api.outfit-status loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outfitUpdate.mockResolvedValue({});
    mocks.cancelRunSafely.mockResolvedValue(undefined);
  });

  it("marks stale queued generation runs as failed", async () => {
    mocks.outfitFindFirst.mockResolvedValue({
      status: "pending",
      errorMessage: null,
      jobId: "run_expired",
      createdAt: new Date(Date.now() - 3 * 60 * 1000),
      cleanFlatLayUrl: null,
      videoStatus: null,
      videoUrl: null,
      videoErrorMessage: null,
      videoGeneratedAt: null,
      images: [],
    });

    const res = await loader({
      request: makeRequest(),
      params: { outfitId: "outfit-123" },
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: "failed",
      errorMessage: "Generation didn't start in time. Please try again.",
      cleanFlatLayUrl: null,
      videoStatus: null,
      videoUrl: null,
      videoErrorMessage: null,
      videoGeneratedAt: null,
      images: [],
    });
    expect(mocks.cancelRunSafely).toHaveBeenCalledWith("run_expired");
    expect(mocks.outfitUpdate).toHaveBeenCalledWith({
      where: { id: "outfit-123" },
      data: {
        status: "failed",
        errorMessage: "Generation didn't start in time. Please try again.",
        jobId: null,
      },
    });
  });

  it("leaves fresh queued generation runs as pending", async () => {
    mocks.outfitFindFirst.mockResolvedValue({
      status: "pending",
      errorMessage: null,
      jobId: "run_fresh",
      createdAt: new Date(),
      cleanFlatLayUrl: null,
      videoStatus: null,
      videoUrl: null,
      videoErrorMessage: null,
      videoGeneratedAt: null,
      images: [],
    });

    const res = await loader({
      request: makeRequest(),
      params: { outfitId: "outfit-123" },
      context: {},
    } as any);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "pending",
      errorMessage: null,
    });
    expect(mocks.cancelRunSafely).not.toHaveBeenCalled();
    expect(mocks.outfitUpdate).not.toHaveBeenCalled();
  });
});
