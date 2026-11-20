-- Additive receipt ledger: existing orders, student balances, and logs remain unchanged.
CREATE TABLE "renewal_requests" (
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "renewal_requests_pkey" PRIMARY KEY ("organizationId", "requestId")
);
CREATE INDEX "renewal_requests_studentId_idx" ON "renewal_requests"("studentId");
