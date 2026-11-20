-- Additive only: no historical logs or student balances are changed.
CREATE TABLE "lesson_add_requests" (
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lesson_add_requests_pkey" PRIMARY KEY ("organizationId", "requestId")
);
CREATE INDEX "lesson_add_requests_studentId_idx" ON "lesson_add_requests"("studentId");
