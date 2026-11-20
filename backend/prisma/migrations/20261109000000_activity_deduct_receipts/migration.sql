CREATE TABLE "activity_deduct_receipts" (
  "organizationId" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "campusId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "lessons" INTEGER NOT NULL,
  "notes" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_deduct_receipts_pkey" PRIMARY KEY ("organizationId", "requestId")
);
