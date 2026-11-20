CREATE TABLE lesson_batch_pricing (
  id TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL, "campusId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
  "creditLogId" TEXT NOT NULL REFERENCES lesson_logs(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "originalLessons" INTEGER NOT NULL CHECK ("originalLessons" > 0),
  "amountCents" DECIMAL(12,0) NOT NULL CHECK ("amountCents" >= 0),
  "basisType" TEXT NOT NULL CHECK ("basisType" IN ('manualVoucher','existingOrder')),
  "orderId" TEXT, notes TEXT NOT NULL, "actorId" TEXT NOT NULL, "requestId" UUID NOT NULL,
  "payloadHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (("basisType"='existingOrder') = ("orderId" IS NOT NULL))
);
CREATE UNIQUE INDEX "lesson_batch_pricing_creditLogId_key" ON lesson_batch_pricing("creditLogId");
CREATE UNIQUE INDEX "lesson_batch_pricing_orderId_key" ON lesson_batch_pricing("orderId");
CREATE UNIQUE INDEX "lesson_batch_pricing_organizationId_requestId_key" ON lesson_batch_pricing("organizationId","requestId");
CREATE INDEX "lesson_batch_pricing_organizationId_studentId_idx" ON lesson_batch_pricing("organizationId","studentId");
