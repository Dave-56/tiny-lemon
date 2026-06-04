import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    outfit: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  canGenerateVideo: vi.fn(),
  getEffectiveEntitlements: vi.fn(),
  getMonthlyUsage: vi.fn(),
  reserveGenerations: vi.fn(),
  refundReservedGeneration: vi.fn(),
  enqueueGenerateVideo: vi.fn(),
  cancelRunSafely: vi.fn(),
  logServerEvent: vi.fn(),
}));

vi.mock("../db.server", () => ({ default: mocks.prisma }));
vi.mock("./plans", () => ({ canGenerateVideo: mocks.canGenerateVideo }));
vi.mock("./billing.server", () => ({
  getEffectiveEntitlements: mocks.getEffectiveEntitlements,
  getMonthlyUsage: mocks.getMonthlyUsage,
  reserveGenerations: mocks.reserveGenerations,
  refundReservedGeneration: mocks.refundReservedGeneration,
}));
vi.mock("./triggerJobs.server", () => ({
  enqueueGenerateVideo: mocks.enqueueGenerateVideo,
  cancelRunSafely: mocks.cancelRunSafely,
}));
vi.mock("./observability.server", () => ({
  logServerEvent: mocks.logServerEvent,
}));

import { handleVideoGenerateRequest, clearOutfitVideoState } from "./videoOrchestration.server";

describe("handleVideoGenerateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canGenerateVideo.mockReturnValue(true);
    mocks.getEffectiveEntitlements.mockResolvedValue({
      publicPlan: "free",
      isBeta: true,
      effectiveLimit: 100,
    });
    mocks.getMonthlyUsage.mockResolvedValue(0);
    mocks.reserveGenerations.mockResolvedValue({
      publicPlan: "free",
      isBeta: true,
      effectiveLimit: 100,
    });
    mocks.refundReservedGeneration.mockResolvedValue(true);
    mocks.enqueueGenerateVideo.mockResolvedValue({ id: "run_123" });
    mocks.prisma.outfit.update.mockResolvedValue({});
    mocks.prisma.outfit.updateMany.mockResolvedValue({ count: 1 });
  });

  it("returns 402 when user does not have video access", async () => {
    mocks.canGenerateVideo.mockReturnValue(false);

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("upgrade_required");
  });

  it("returns 404 when outfit is not found", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue(null);

    const res = await handleVideoGenerateRequest({
      outfitId: "nonexistent",
      shopId: "shop-a.myshopify.com",
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 when outfit is not completed", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "pending",
      brandStyleId: "minimal",
      videoStatus: null,
      videoUrl: null,
      images: [{ id: "img_1" }],
    });

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    expect(res.status).toBe(400);
  });

  it("returns idempotent alreadyInProgress for pending/processing", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "minimal",
      videoStatus: "processing",
      videoUrl: null,
      images: [{ id: "img_1" }],
    });

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyInProgress).toBe(true);
    expect(body.videoStatus).toBe("processing");
    expect(mocks.enqueueGenerateVideo).not.toHaveBeenCalled();
    expect(mocks.reserveGenerations).not.toHaveBeenCalled();
  });

  it("returns idempotent alreadyCompleted for completed with videoUrl", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "minimal",
      videoStatus: "completed",
      videoUrl: "https://blob.example.com/video.mp4",
      images: [{ id: "img_1" }],
    });

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.alreadyCompleted).toBe(true);
    expect(body.videoUrl).toBe("https://blob.example.com/video.mp4");
    expect(mocks.enqueueGenerateVideo).not.toHaveBeenCalled();
    expect(mocks.reserveGenerations).not.toHaveBeenCalled();
  });

  it("enqueues a fresh job for explicit regenerate and keeps the existing videoUrl", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "minimal",
      videoStatus: "completed",
      videoUrl: "https://blob.example.com/old-video.mp4",
      images: [{ id: "img_1" }],
    });

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
      mode: "regenerate",
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe("run_123");

    const claim = mocks.prisma.outfit.updateMany.mock.calls[0]?.[0];
    expect(claim).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "outfit_1",
          OR: expect.arrayContaining([{ videoStatus: "completed" }]),
        }),
        data: expect.objectContaining({
          videoStatus: "pending",
          videoJobId: null,
          videoErrorMessage: null,
        }),
      }),
    );
    expect(claim.data).not.toHaveProperty("videoUrl");
    expect(mocks.reserveGenerations).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      1,
      { description: expect.stringMatching(/^generation reservation:video:regenerate:outfit_1:/) },
    );
    expect(mocks.enqueueGenerateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        outfitId: "outfit_1",
        shopId: "shop-a.myshopify.com",
        brandStyleId: "minimal",
        creditReservation: {
          reservationDescription: expect.stringMatching(/^generation reservation:video:regenerate:outfit_1:/),
          refundDescription: expect.stringMatching(/^generation refund:video:regenerate:outfit_1:.*:no_output_failure$/),
        },
      }),
    );
  });

  it("claims and enqueues for a fresh outfit", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "editorial",
      videoStatus: null,
      videoUrl: null,
      images: [{ id: "img_1" }],
    });

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.jobId).toBe("run_123");
    expect(mocks.prisma.outfit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "outfit_1" }),
        data: expect.objectContaining({ videoStatus: "pending" }),
      }),
    );
    expect(mocks.reserveGenerations).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      1,
      { description: expect.stringMatching(/^generation reservation:video:generate:outfit_1:/) },
    );
    expect(mocks.enqueueGenerateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        outfitId: "outfit_1",
        shopId: "shop-a.myshopify.com",
        brandStyleId: "editorial",
        creditReservation: {
          reservationDescription: expect.stringMatching(/^generation reservation:video:generate:outfit_1:/),
          refundDescription: expect.stringMatching(/^generation refund:video:generate:outfit_1:.*:no_output_failure$/),
        },
      }),
    );
  });

  it("returns 402 and restores claim when video credit limit is reached", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "minimal",
      videoStatus: null,
      videoUrl: null,
      images: [{ id: "img_1" }],
    });
    mocks.reserveGenerations.mockRejectedValue(new Error("insufficient_credits"));
    mocks.getMonthlyUsage.mockResolvedValue(100);
    mocks.getEffectiveEntitlements.mockResolvedValue({
      publicPlan: "free",
      isBeta: true,
      effectiveLimit: 100,
    });

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: "limit_reached",
      used: 100,
      limit: 100,
      isBeta: true,
    });
    expect(mocks.enqueueGenerateVideo).not.toHaveBeenCalled();
    expect(mocks.prisma.outfit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outfit_1" },
        data: expect.objectContaining({ videoStatus: null, videoJobId: null }),
      }),
    );
  });

  it("returns 503 and restores claim when enqueue fails", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "minimal",
      videoStatus: null,
      videoUrl: null,
      images: [{ id: "img_1" }],
    });
    mocks.enqueueGenerateVideo.mockRejectedValue(new Error("trigger down"));

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
    });

    expect(res.status).toBe(503);
    expect(mocks.refundReservedGeneration).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      {
        reservationDescription: expect.stringMatching(/^generation reservation:video:generate:outfit_1:/),
        refundDescription: expect.stringMatching(/^generation refund:video:generate:outfit_1:.*:pre_enqueue_failure$/),
      },
    );
    // Should restore the claim
    expect(mocks.prisma.outfit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outfit_1" },
        data: expect.objectContaining({ videoStatus: null, videoJobId: null }),
      }),
    );
  });

  it("restores completed status and keeps old video when regenerate enqueue fails", async () => {
    mocks.prisma.outfit.findFirst.mockResolvedValue({
      id: "outfit_1",
      status: "completed",
      brandStyleId: "minimal",
      videoStatus: "completed",
      videoUrl: "https://blob.example.com/old-video.mp4",
      images: [{ id: "img_1" }],
    });
    mocks.enqueueGenerateVideo.mockRejectedValue(new Error("trigger down"));

    const res = await handleVideoGenerateRequest({
      outfitId: "outfit_1",
      shopId: "shop-a.myshopify.com",
      mode: "regenerate",
    });

    expect(res.status).toBe(503);
    expect(mocks.prisma.outfit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outfit_1" },
        data: expect.objectContaining({
          videoStatus: "completed",
          videoJobId: null,
        }),
      }),
    );
    const restore = mocks.prisma.outfit.update.mock.calls.at(-1)?.[0];
    expect(restore.data).not.toHaveProperty("videoUrl");
  });
});

describe("clearOutfitVideoState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.outfit.update.mockResolvedValue({});
  });

  it("cancels in-flight job and clears all video fields", async () => {
    mocks.prisma.outfit.findUnique.mockResolvedValue({
      videoStatus: "processing",
      videoJobId: "run_789",
    });

    await clearOutfitVideoState("outfit_1");

    expect(mocks.cancelRunSafely).toHaveBeenCalledWith("run_789");
    expect(mocks.prisma.outfit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "outfit_1" },
        data: expect.objectContaining({
          videoStatus: null,
          videoJobId: null,
          videoUrl: null,
          videoErrorMessage: null,
          videoGeneratedAt: null,
        }),
      }),
    );
  });

  it("does not cancel when videoStatus is completed", async () => {
    mocks.prisma.outfit.findUnique.mockResolvedValue({
      videoStatus: "completed",
      videoJobId: "run_789",
    });

    await clearOutfitVideoState("outfit_1");

    expect(mocks.cancelRunSafely).not.toHaveBeenCalled();
    expect(mocks.prisma.outfit.update).toHaveBeenCalled();
  });

  it("does nothing when outfit is not found", async () => {
    mocks.prisma.outfit.findUnique.mockResolvedValue(null);

    await clearOutfitVideoState("outfit_1");

    expect(mocks.cancelRunSafely).not.toHaveBeenCalled();
    expect(mocks.prisma.outfit.update).not.toHaveBeenCalled();
  });
});
