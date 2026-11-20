ALTER TABLE "lesson_logs" ADD COLUMN "conversionId" TEXT REFERENCES "conversions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "lesson_logs_conversionId_type_key" ON "lesson_logs"("conversionId", "type");
CREATE TABLE "refund_confirm_receipts" (
  "requestId" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "response" JSONB NOT NULL
);
