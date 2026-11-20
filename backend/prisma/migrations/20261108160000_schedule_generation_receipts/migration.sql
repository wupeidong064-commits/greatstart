CREATE TABLE "schedule_generation_receipts" (
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_generation_receipts_pkey" PRIMARY KEY ("organizationId", "requestId")
);
