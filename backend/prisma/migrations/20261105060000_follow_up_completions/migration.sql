CREATE TABLE "follow_up_completions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "follow_up_completions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "follow_up_completions_userId_campusId_day_taskKey_revision_key" ON "follow_up_completions"("userId", "campusId", "day", "taskKey", "revision");
CREATE INDEX "follow_up_completions_organizationId_campusId_userId_day_idx" ON "follow_up_completions"("organizationId", "campusId", "userId", "day");
