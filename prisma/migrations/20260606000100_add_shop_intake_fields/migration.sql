ALTER TABLE "Shop"
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "launchStage" TEXT,
  ADD COLUMN "shootGoal" TEXT,
  ADD COLUMN "heroProductFocus" TEXT,
  ADD COLUMN "stylingSupport" TEXT,
  ADD COLUMN "graphicSensitivity" TEXT,
  ADD COLUMN "outputChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "intakeNotes" TEXT;
