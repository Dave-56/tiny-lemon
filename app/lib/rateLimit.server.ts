import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../db.server";
import { logServerEvent } from "./observability.server";

const MAX_RATE_LIMIT_RETRIES = 3;
const CLEANUP_EVERY_N_CALLS = 20;
const CLEANUP_DELETE_LIMIT = 25;

let warnedSecretFallback = false;
let consumeCalls = 0;

export type RateLimitAlgorithm = "fixed" | "sliding";

export type ConsumeRateLimitArgs = {
  namespace: string;
  subject: string;
  limit: number;
  windowMs: number;
  algorithm: RateLimitAlgorithm;
  now?: Date;
};

export type RateLimitDecision = {
  allowed: boolean;
  enforced: boolean;
  storeAvailable: boolean;
  limit: number;
  remaining: number | null;
  resetAt: Date | null;
  retryAfterMs: number | null;
  subjectDigest: string;
  algorithm: RateLimitAlgorithm;
};

type RateLimitTx = Pick<Prisma.TransactionClient, "rateLimitEvent">;

type PersistedDecision = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number | null;
};

function getRateLimitSecret(): string {
  const dedicatedSecret = process.env.RATE_LIMIT_HMAC_SECRET?.trim();
  if (dedicatedSecret) {
    return dedicatedSecret;
  }

  const fallbackSecret = process.env.SHOPIFY_API_SECRET?.trim();
  if (fallbackSecret) {
    if (!warnedSecretFallback) {
      warnedSecretFallback = true;
      logServerEvent("warn", "rate_limit.secret_fallback", {
        fallbackSource: "SHOPIFY_API_SECRET",
      });
    }
    return fallbackSecret;
  }

  throw new Error("Missing rate limit HMAC secret.");
}

export function createRateLimitSubjectDigest(subject: string): string {
  return createHmac("sha256", getRateLimitSecret())
    .update(subject)
    .digest("hex");
}

function getWindowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function isRetryableRateLimitError(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("could not serialize") ||
    message.includes("serialization failure") ||
    message.includes("deadlock")
  );
}

async function withRateLimitRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRateLimitError(error) || attempt === MAX_RATE_LIMIT_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function consumeFixedWindow(
  tx: RateLimitTx,
  args: ConsumeRateLimitArgs,
  subjectDigest: string,
  now: Date,
): Promise<PersistedDecision> {
  const windowStart = getWindowStart(now, args.windowMs);
  const resetAt = new Date(windowStart.getTime() + args.windowMs);
  const count = await tx.rateLimitEvent.count({
    where: {
      namespace: args.namespace,
      subjectDigest,
      algorithm: args.algorithm,
      windowStart,
    },
  });

  if (count >= args.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: Math.max(0, resetAt.getTime() - now.getTime()),
    };
  }

  await tx.rateLimitEvent.create({
    data: {
      namespace: args.namespace,
      subjectDigest,
      algorithm: args.algorithm,
      windowStart,
      expiresAt: resetAt,
    },
  });

  return {
    allowed: true,
    remaining: Math.max(0, args.limit - (count + 1)),
    resetAt,
    retryAfterMs: null,
  };
}

async function consumeSlidingWindow(
  tx: RateLimitTx,
  args: ConsumeRateLimitArgs,
  subjectDigest: string,
  now: Date,
): Promise<PersistedDecision> {
  const cutoff = new Date(now.getTime() - args.windowMs);
  const recentHits = await tx.rateLimitEvent.findMany({
    where: {
      namespace: args.namespace,
      subjectDigest,
      algorithm: args.algorithm,
      createdAt: { gt: cutoff },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
    take: args.limit,
  });

  if (recentHits.length >= args.limit) {
    const resetAt = new Date(recentHits[0].createdAt.getTime() + args.windowMs);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterMs: Math.max(0, resetAt.getTime() - now.getTime()),
    };
  }

  const expiresAt = new Date(now.getTime() + args.windowMs);
  await tx.rateLimitEvent.create({
    data: {
      namespace: args.namespace,
      subjectDigest,
      algorithm: args.algorithm,
      expiresAt,
    },
  });

  const hitsAfterConsume = [...recentHits, { createdAt: now }].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const oldestHit = hitsAfterConsume[0]?.createdAt ?? now;

  return {
    allowed: true,
    remaining: Math.max(0, args.limit - hitsAfterConsume.length),
    resetAt: new Date(oldestHit.getTime() + args.windowMs),
    retryAfterMs: null,
  };
}

async function cleanupExpiredRateLimitEvents(now: Date) {
  consumeCalls += 1;
  if (consumeCalls % CLEANUP_EVERY_N_CALLS !== 0) {
    return;
  }

  const expired = await prisma.rateLimitEvent.findMany({
    where: { expiresAt: { lt: now } },
    orderBy: { expiresAt: "asc" },
    select: { id: true },
    take: CLEANUP_DELETE_LIMIT,
  });

  if (expired.length === 0) {
    return;
  }

  await prisma.rateLimitEvent.deleteMany({
    where: { id: { in: expired.map((entry) => entry.id) } },
  });
}

export async function consumeRateLimit(
  args: ConsumeRateLimitArgs,
): Promise<RateLimitDecision> {
  const now = args.now ?? new Date();
  const subjectDigest = createRateLimitSubjectDigest(args.subject);

  try {
    const persisted = await withRateLimitRetries(() =>
      prisma.$transaction(
        async (tx) => {
          if (args.algorithm === "fixed") {
            return consumeFixedWindow(tx, args, subjectDigest, now);
          }
          return consumeSlidingWindow(tx, args, subjectDigest, now);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    void cleanupExpiredRateLimitEvents(now).catch((error) => {
      logServerEvent("warn", "rate_limit.cleanup_failed", {
        namespace: args.namespace,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const eventName = persisted.allowed ? "rate_limit.allowed" : "rate_limit.denied";
    logServerEvent("info", eventName, {
      namespace: args.namespace,
      algorithm: args.algorithm,
      limit: args.limit,
      windowMs: args.windowMs,
      remaining: persisted.remaining,
      retryAfterMs: persisted.retryAfterMs ?? undefined,
      resetAt: Math.ceil(persisted.resetAt.getTime() / 1000),
      subjectDigestPrefix: subjectDigest.slice(0, 12),
    });

    return {
      ...persisted,
      enforced: true,
      storeAvailable: true,
      limit: args.limit,
      subjectDigest,
      algorithm: args.algorithm,
    };
  } catch (error) {
    logServerEvent("warn", "rate_limit.store_unavailable", {
      namespace: args.namespace,
      algorithm: args.algorithm,
      limit: args.limit,
      windowMs: args.windowMs,
      subjectDigestPrefix: subjectDigest.slice(0, 12),
      error: error instanceof Error ? error.message : String(error),
      failMode: "open",
    });

    return {
      allowed: true,
      enforced: false,
      storeAvailable: false,
      limit: args.limit,
      remaining: null,
      resetAt: null,
      retryAfterMs: null,
      subjectDigest,
      algorithm: args.algorithm,
    };
  }
}

export function buildRateLimitHeaders(decision: RateLimitDecision): Headers {
  const headers = new Headers();

  if (decision.remaining === null || decision.resetAt === null) {
    return headers;
  }

  headers.set("X-RateLimit-Limit", String(decision.limit));
  headers.set("X-RateLimit-Remaining", String(decision.remaining));
  headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(decision.resetAt.getTime() / 1000)),
  );

  if (!decision.allowed && decision.retryAfterMs !== null) {
    headers.set(
      "Retry-After",
      String(Math.max(0, Math.ceil(decision.retryAfterMs / 1000))),
    );
  }

  return headers;
}
