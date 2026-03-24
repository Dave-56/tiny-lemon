CREATE TABLE "RateLimitEvent" (
    "id" TEXT NOT NULL,
    "namespace" TEXT NOT NULL,
    "subjectDigest" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateLimitEvent_namespace_subjectDigest_createdAt_idx"
ON "RateLimitEvent"("namespace", "subjectDigest", "createdAt");

CREATE INDEX "RateLimitEvent_namespace_subjectDigest_windowStart_idx"
ON "RateLimitEvent"("namespace", "subjectDigest", "windowStart");

CREATE INDEX "RateLimitEvent_expiresAt_idx"
ON "RateLimitEvent"("expiresAt");
