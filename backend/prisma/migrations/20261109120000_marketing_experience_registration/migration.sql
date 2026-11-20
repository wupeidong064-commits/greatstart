ALTER TABLE "experience_lessons" ADD COLUMN "scheduleId" TEXT
  REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "experience_lessons_scheduleId_idx" ON "experience_lessons"("scheduleId");

CREATE TABLE "registration_receipts" (
  "organizationId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "campusId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "resultId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("organizationId", "operation", "requestId")
);
