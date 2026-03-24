import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import prisma from "../db.server";

export const IDEMPOTENCY_PENDING_TTL_MS = 2 * 60 * 1000;
export const IDEMPOTENCY_ENQUEUED_TTL_MS = 10 * 60 * 1000;

export type RequestIdempotencyOperation = "generate" | "regenerate";
export type RequestIdempotencyStatus = "pending" | "enqueued" | "failed" | "expired";

type ClaimRequestArgs = {
  shopId: string;
  operation: RequestIdempotencyOperation;
  requestKey: string;
  outfitId: string;
};

type TransitionRequestArgs = {
  shopId: string;
  operation: RequestIdempotencyOperation;
  requestKey: string;
  runToken: string;
  jobId?: string | null;
};

export type OwnedRequestClaim = {
  disposition: "owned";
  outfitId: string;
  jobId: null;
  runToken: string;
  status: "pending";
};

export type ReusedRequestClaim = {
  disposition: "reused";
  outfitId: string;
  jobId?: string | null;
  status: "pending" | "enqueued";
};

export type RequestClaim = OwnedRequestClaim | ReusedRequestClaim;

function createExpiry(msFromNow: number) {
  return new Date(Date.now() + msFromNow);
}

function isReusableRecord(
  record: {
    status: string;
    expiresAt: Date;
    outfitId: string | null;
    jobId: string | null;
  },
  now: Date
): record is {
  status: "pending" | "enqueued";
  expiresAt: Date;
  outfitId: string;
  jobId: string | null;
} {
  return (
    (record.status === "pending" || record.status === "enqueued") &&
    record.expiresAt.getTime() > now.getTime() &&
    typeof record.outfitId === "string" &&
    record.outfitId.length > 0
  );
}

function isExpiredRecord(record: { status: string; expiresAt: Date }, now: Date) {
  return (
    (record.status === "pending" || record.status === "enqueued") &&
    record.expiresAt.getTime() <= now.getTime()
  );
}

function isReclaimableRecord(record: { status: string }) {
  return record.status === "failed" || record.status === "expired";
}

async function claimRequestIdempotency(args: ClaimRequestArgs): Promise<RequestClaim> {
  const { shopId, operation, requestKey, outfitId } = args;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = new Date();
    const existing = await prisma.requestIdempotency.findUnique({
      where: {
        shopId_operation_requestKey: {
          shopId,
          operation,
          requestKey,
        },
      },
    });

    if (!existing) {
      const runToken = randomUUID();
      try {
        const created = await prisma.requestIdempotency.create({
          data: {
            shopId,
            operation,
            requestKey,
            status: "pending",
            runToken,
            outfitId,
            expiresAt: createExpiry(IDEMPOTENCY_PENDING_TTL_MS),
          },
        });

        return {
          disposition: "owned",
          outfitId: created.outfitId ?? outfitId,
          jobId: null,
          runToken,
          status: "pending",
        };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }
    }

    if (isReusableRecord(existing, now)) {
      return {
        disposition: "reused",
        outfitId: existing.outfitId,
        jobId: existing.jobId,
        status: existing.status,
      };
    }

    if (isExpiredRecord(existing, now)) {
      const expired = await prisma.requestIdempotency.updateMany({
        where: {
          shopId,
          operation,
          requestKey,
          runToken: existing.runToken,
          status: existing.status,
        },
        data: {
          status: "expired",
        },
      });
      if (expired.count === 0) {
        continue;
      }
    }

    const latest = await prisma.requestIdempotency.findUnique({
      where: {
        shopId_operation_requestKey: {
          shopId,
          operation,
          requestKey,
        },
      },
    });

    if (!latest) {
      continue;
    }

    if (isReusableRecord(latest, new Date())) {
      return {
        disposition: "reused",
        outfitId: latest.outfitId,
        jobId: latest.jobId,
        status: latest.status,
      };
    }

    if (!isReclaimableRecord(latest)) {
      continue;
    }

    const runToken = randomUUID();
    const reclaimed = await prisma.requestIdempotency.updateMany({
      where: {
        shopId,
        operation,
        requestKey,
        runToken: latest.runToken,
        status: latest.status,
      },
      data: {
        status: "pending",
        runToken,
        outfitId: latest.outfitId ?? outfitId,
        jobId: null,
        expiresAt: createExpiry(IDEMPOTENCY_PENDING_TTL_MS),
      },
    });

    if (reclaimed.count === 0) {
      continue;
    }

    return {
      disposition: "owned",
      outfitId: latest.outfitId ?? outfitId,
      jobId: null,
      runToken,
      status: "pending",
    };
  }

  throw new Error("Unable to claim request idempotency.");
}

export async function claimGenerateRequestIdempotency(args: {
  shopId: string;
  requestKey: string;
}) {
  return claimRequestIdempotency({
    ...args,
    operation: "generate",
    outfitId: randomUUID(),
  });
}

export async function claimRegenerateRequestIdempotency(args: {
  shopId: string;
  requestKey: string;
  outfitId: string;
}) {
  return claimRequestIdempotency({
    ...args,
    operation: "regenerate",
  });
}

export async function markRequestEnqueued(
  args: TransitionRequestArgs
): Promise<boolean> {
  const { shopId, operation, requestKey, runToken, jobId } = args;
  const updated = await prisma.requestIdempotency.updateMany({
    where: {
      shopId,
      operation,
      requestKey,
      runToken,
      status: "pending",
    },
    data: {
      status: "enqueued",
      jobId: jobId ?? null,
      expiresAt: createExpiry(IDEMPOTENCY_ENQUEUED_TTL_MS),
    },
  });

  return updated.count > 0;
}

export async function markRequestFailed(
  args: TransitionRequestArgs
): Promise<boolean> {
  const { shopId, operation, requestKey, runToken } = args;
  const updated = await prisma.requestIdempotency.updateMany({
    where: {
      shopId,
      operation,
      requestKey,
      runToken,
      status: "pending",
    },
    data: {
      status: "failed",
      expiresAt: new Date(),
    },
  });

  return updated.count > 0;
}
