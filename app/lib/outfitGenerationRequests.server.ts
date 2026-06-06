import prisma from "../db.server";

export type OutfitGenerationRequestOperation = "generate" | "regenerate";

type CreateOutfitGenerationRequestArgs = {
  shopId: string;
  outfitId: string;
  operation: OutfitGenerationRequestOperation;
  merchantDirection?: string | null;
  frontDescription?: string | null;
  backDescription?: string | null;
  targetPoses?: string[];
  resolvedPoses?: string[];
  modelId: string;
  brandStyleId: string;
  brandEnergy?: string | null;
  pricePoint?: string | null;
  primaryCategory?: string | null;
  requestKey: string;
  runToken: string;
};

export async function createOutfitGenerationRequest(
  args: CreateOutfitGenerationRequestArgs,
) {
  return prisma.outfitGenerationRequest.create({
    data: {
      shopId: args.shopId,
      outfitId: args.outfitId,
      operation: args.operation,
      merchantDirection: args.merchantDirection ?? null,
      frontDescription: args.frontDescription ?? null,
      backDescription: args.backDescription ?? null,
      targetPoses: args.targetPoses ?? [],
      resolvedPoses: args.resolvedPoses ?? [],
      modelId: args.modelId,
      brandStyleId: args.brandStyleId,
      brandEnergy: args.brandEnergy ?? null,
      pricePoint: args.pricePoint ?? null,
      primaryCategory: args.primaryCategory ?? null,
      requestKey: args.requestKey,
      runToken: args.runToken,
      status: "pending",
    },
  });
}

export async function markOutfitGenerationRequestEnqueued(args: {
  generationRequestId: string;
  shopId: string;
  jobId: string;
}) {
  const now = new Date();
  await prisma.outfitGenerationRequest.updateMany({
    where: {
      id: args.generationRequestId,
      shopId: args.shopId,
      status: "pending",
    },
    data: {
      jobId: args.jobId,
      status: "enqueued",
      enqueuedAt: now,
      failureReason: null,
    },
  });
}

export async function markOutfitGenerationRequestCompleted(args: {
  generationRequestId?: string | null;
  shopId: string;
}) {
  if (!args.generationRequestId) return;
  const now = new Date();
  await prisma.outfitGenerationRequest.updateMany({
    where: {
      id: args.generationRequestId,
      shopId: args.shopId,
    },
    data: {
      status: "completed",
      completedAt: now,
      failureReason: null,
    },
  });
}

export async function markOutfitGenerationRequestFailed(args: {
  generationRequestId?: string | null;
  shopId: string;
  failureReason: string;
}) {
  if (!args.generationRequestId) return;
  const now = new Date();
  await prisma.outfitGenerationRequest.updateMany({
    where: {
      id: args.generationRequestId,
      shopId: args.shopId,
    },
    data: {
      status: "failed",
      failedAt: now,
      failureReason: args.failureReason,
    },
  });
}

export async function markOutfitGenerationRequestFailedByJob(args: {
  shopId: string;
  outfitId: string;
  jobId: string;
  failureReason: string;
}) {
  const now = new Date();
  await prisma.outfitGenerationRequest.updateMany({
    where: {
      shopId: args.shopId,
      outfitId: args.outfitId,
      jobId: args.jobId,
      status: { in: ["pending", "enqueued"] },
    },
    data: {
      status: "failed",
      failedAt: now,
      failureReason: args.failureReason,
    },
  });
}
