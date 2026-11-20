ALTER TABLE "payments" ADD COLUMN "requestId" TEXT, ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "payments_organizationId_requestId_key" ON "payments"("organizationId", "requestId");
