-- Remove duplicate pose rows before enforcing uniqueness.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "outfitId", "pose"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "GeneratedImage"
)
DELETE FROM "GeneratedImage"
WHERE "id" IN (
  SELECT "id" FROM ranked WHERE rn > 1
);

-- Enforce one generated image per outfit/pose.
CREATE UNIQUE INDEX "GeneratedImage_outfitId_pose_key"
ON "GeneratedImage"("outfitId", "pose");
